/**
 * Hook de presença em tempo real para o editor de workflow.
 *
 * Mantém um WebSocket vivo enquanto a rota do flow estiver montada,
 * publica eventos locais (cursor, seleção, viewport) e expõe a lista
 * de presenças dos demais usuários.
 *
 * Não implementa sincronização do documento (yjs.update) — o backend já
 * persiste patches, mas a integração CRDT no React Flow é fase futura.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  buildWsUrl,
  fetchPresence,
  type AwarenessEvent,
  type Cursor,
  type OutgoingMessage,
  type Presence,
  type Viewport,
} from "~/services/collaboration";

type LocalUser = {
  id: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;
};

type UseCollaborationOptions = {
  workflowId: string;
  user: LocalUser | null | undefined;
  enabled?: boolean;
  /** Disparado quando outro cliente envia uma patch yjs.update. */
  onYjsUpdate?: (updateBase64: string) => void;
  /**
   * Eventos de comentário broadcasted pela sala. Use pra invalidar o cache
   * da query de comments, mostrar toast de menção, etc.
   */
  onCommentEvent?: (
    event: Extract<
      AwarenessEvent,
      { type: "comment.created" } | { type: "comment.updated" } | { type: "comment.deleted" }
    >,
  ) => void;
};

type Status = "idle" | "connecting" | "online" | "offline";

export type RemotePresence = Presence & {
  /** Enriquecido pelo consumidor (ex.: via membros da org). */
  displayName?: string;
  email?: string;
  image?: string | null;
};

const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 15000;

export function useCollaboration({
  workflowId,
  user,
  enabled = true,
  onYjsUpdate,
  onCommentEvent,
}: UseCollaborationOptions) {
  // Mantém a referência mais recente do handler sem reabrir o WS a cada
  // re-render do parent.
  const onYjsUpdateRef = useRef(onYjsUpdate);
  useEffect(() => {
    onYjsUpdateRef.current = onYjsUpdate;
  }, [onYjsUpdate]);
  const commentHandlerRef = useRef(onCommentEvent);
  useEffect(() => {
    commentHandlerRef.current = onCommentEvent;
  }, [onCommentEvent]);

  const [status, setStatus] = useState<Status>("idle");
  const [others, setOthers] = useState<Map<string, RemotePresence>>(() => new Map());

  const wsRef = useRef<WebSocket | null>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const attemptRef = useRef(0);
  const lastSentCursorRef = useRef<{ at: number; x: number; y: number }>({ at: 0, x: 0, y: 0 });
  const lastSelectionRef = useRef<string | undefined>(undefined);
  const lastGrabbedRef = useRef<string | undefined>(undefined);
  const lastViewportRef = useRef<Viewport | undefined>(undefined);

  const userId = user?.id;
  const shouldRun = Boolean(enabled && workflowId && userId);

  const send = useCallback((message: OutgoingMessage) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    try {
      ws.send(JSON.stringify(message));
    } catch {
      // ignore — reconnect cuidará disso
    }
  }, []);

  const sendCursor = useCallback(
    (cursor: Cursor) => {
      if (!userId) return;
      // Throttle: máx ~30 msgs/s.
      const now = Date.now();
      if (now - lastSentCursorRef.current.at < 33) return;
      lastSentCursorRef.current = { at: now, x: cursor.x, y: cursor.y };
      send({
        type: "cursor.move",
        userId,
        cursor,
        ...(lastSelectionRef.current && { selectedNodeId: lastSelectionRef.current }),
        ...(lastGrabbedRef.current && { grabbedNodeId: lastGrabbedRef.current }),
        ...(lastViewportRef.current && { viewport: lastViewportRef.current }),
      });
    },
    [send, userId],
  );

  const sendGrab = useCallback(
    (nodeId: string) => {
      if (!userId) return;
      lastGrabbedRef.current = nodeId;
      send({
        type: "node.selected",
        userId,
        cursor: { x: lastSentCursorRef.current.x, y: lastSentCursorRef.current.y },
        grabbedNodeId: nodeId,
        ...(lastSelectionRef.current && { selectedNodeId: lastSelectionRef.current }),
      });
    },
    [send, userId],
  );

  const sendRelease = useCallback(() => {
    if (!userId) return;
    lastGrabbedRef.current = undefined;
    send({
      type: "node.selected",
      userId,
      cursor: { x: lastSentCursorRef.current.x, y: lastSentCursorRef.current.y },
      // "" sinaliza release explícito ao server.
      grabbedNodeId: "",
      ...(lastSelectionRef.current && { selectedNodeId: lastSelectionRef.current }),
    });
  }, [send, userId]);

  const sendSelection = useCallback(
    (nodeId: string | undefined) => {
      if (!userId) return;
      lastSelectionRef.current = nodeId;
      send({
        type: "node.selected",
        userId,
        cursor: { x: lastSentCursorRef.current.x, y: lastSentCursorRef.current.y },
        ...(nodeId && { selectedNodeId: nodeId }),
        ...(lastViewportRef.current && { viewport: lastViewportRef.current }),
      });
    },
    [send, userId],
  );

  const sendYjsUpdate = useCallback(
    (updateBase64: string) => {
      if (!userId) return;
      send({
        type: "yjs.update",
        userId,
        cursor: { x: lastSentCursorRef.current.x, y: lastSentCursorRef.current.y },
        updateBase64,
      });
    },
    [send, userId],
  );

  const sendViewport = useCallback(
    (viewport: Viewport) => {
      if (!userId) return;
      lastViewportRef.current = viewport;
      send({
        type: "viewport.changed",
        userId,
        cursor: { x: lastSentCursorRef.current.x, y: lastSentCursorRef.current.y },
        ...(lastSelectionRef.current && { selectedNodeId: lastSelectionRef.current }),
        viewport,
      });
    },
    [send, userId],
  );

  // Hidrata presenças via REST quando entra na sala (antes do WS abrir).
  useEffect(() => {
    if (!shouldRun) return;
    let cancelled = false;
    fetchPresence(workflowId)
      .then((snap) => {
        if (cancelled) return;
        setOthers((prev) => {
          const next = new Map(prev);
          for (const p of snap.users) {
            if (p.userId === userId) continue;
            next.set(p.userId, p);
          }
          return next;
        });
      })
      .catch(() => {
        /* gateway offline — o WS reconnect tenta de novo */
      });
    return () => {
      cancelled = true;
    };
  }, [shouldRun, workflowId, userId]);

  useEffect(() => {
    if (!shouldRun) {
      setStatus("idle");
      return;
    }

    let disposed = false;

    function clearTimers() {
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current);
        heartbeatRef.current = null;
      }
      if (reconnectRef.current) {
        clearTimeout(reconnectRef.current);
        reconnectRef.current = null;
      }
    }

    function scheduleReconnect() {
      if (disposed) return;
      const delay = Math.min(RECONNECT_MAX_MS, RECONNECT_BASE_MS * 2 ** attemptRef.current);
      attemptRef.current += 1;
      reconnectRef.current = setTimeout(connect, delay);
    }

    function connect() {
      if (disposed) return;
      setStatus("connecting");
      let ws: WebSocket;
      try {
        ws = new WebSocket(buildWsUrl(workflowId));
      } catch {
        scheduleReconnect();
        return;
      }
      wsRef.current = ws;

      ws.onopen = () => {
        if (disposed) {
          ws.close();
          return;
        }
        attemptRef.current = 0;
        setStatus("online");
        // NÃO enviar user.joined aqui — o handler `open` do servidor é async
        // (autorize + subscribe Redis); se enviarmos antes dele popular o
        // estado da conexão, o server trata como anônimo e fecha o socket.
        // Aguardamos `room.ready` (enviado ao fim do open) antes de mandar
        // qualquer mensagem.
      };

      ws.onmessage = (evt) => {
        let parsed: AwarenessEvent;
        try {
          parsed = JSON.parse(typeof evt.data === "string" ? evt.data : "") as AwarenessEvent;
        } catch {
          return;
        }
        if (parsed.type === "error") {
          setStatus("offline");
          return;
        }
        if (parsed.type === "room.ready") {
          send({ type: "user.joined", userId: userId!, cursor: { x: 0, y: 0 } });
          // Heartbeat — backend expira presença em ~45s; mandamos cursor.move
          // a cada 15s pra manter o TTL ativo mesmo sem mouse.
          if (heartbeatRef.current) clearInterval(heartbeatRef.current);
          heartbeatRef.current = setInterval(() => {
            send({
              type: "cursor.move",
              userId: userId!,
              cursor: { x: lastSentCursorRef.current.x, y: lastSentCursorRef.current.y },
              ...(lastSelectionRef.current && { selectedNodeId: lastSelectionRef.current }),
              ...(lastViewportRef.current && { viewport: lastViewportRef.current }),
            });
          }, 15000);
          return;
        }
        if (parsed.type === "yjs.update") {
          onYjsUpdateRef.current?.(parsed.updateBase64);
          return;
        }

        if (parsed.type === "user.left") {
          setOthers((prev) => {
            if (!prev.has(parsed.userId)) return prev;
            const next = new Map(prev);
            next.delete(parsed.userId);
            return next;
          });
          return;
        }

        if (
          parsed.type === "comment.created" ||
          parsed.type === "comment.updated" ||
          parsed.type === "comment.deleted"
        ) {
          commentHandlerRef.current?.(parsed);
          return;
        }

        // Os demais eventos carregam `presence`.
        if (!("presence" in parsed)) return;
        const p = parsed.presence;
        if (!p || p.userId === userId) return;
        setOthers((prev) => {
          const next = new Map(prev);
          next.set(p.userId, p);
          return next;
        });
      };

      ws.onclose = () => {
        wsRef.current = null;
        clearTimers();
        if (disposed) return;
        setStatus("offline");
        scheduleReconnect();
      };

      ws.onerror = () => {
        // onclose vai disparar em seguida — não duplicamos lógica.
      };
    }

    connect();

    return () => {
      disposed = true;
      clearTimers();
      const ws = wsRef.current;
      wsRef.current = null;
      if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
        ws.close();
      }
    };
  }, [shouldRun, workflowId, userId, send]);

  const othersArray = useMemo(() => Array.from(others.values()), [others]);

  // Map<nodeId, RemotePresence> dos nodes lockados por outros usuários.
  // Consumido pelo canvas pra bloquear interação local + mostrar overlay.
  const nodeLocks = useMemo(() => {
    const map = new Map<string, RemotePresence>();
    for (const p of othersArray) {
      if (p.grabbedNodeId) map.set(p.grabbedNodeId, p);
    }
    return map;
  }, [othersArray]);

  return {
    status,
    others: othersArray,
    nodeLocks,
    sendCursor,
    sendSelection,
    sendGrab,
    sendRelease,
    sendViewport,
    sendYjsUpdate,
  };
}
