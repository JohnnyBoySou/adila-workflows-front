/**
 * Sincronização CRDT do documento de workflow via Yjs.
 *
 * Fluxo:
 *   bootstrap   ← GET /rooms/:id/document (snapshot + patches) → applyUpdate
 *   seed        → se doc vazio, popula com `initialDefinition` (origin 'seed', não broadcast)
 *   local edit  → handleLocalDirty() lê canvas → syncToDoc(local) → broadcast via WS
 *   remote      → onYjsUpdate(b64) → applyUpdate(doc, 'remote') → readFromDoc → canvas.applyRemoteDefinition
 *
 * Não é uma integração CRDT fina (cada nó é serializado como JSON e
 * substituído inteiro), mas usa Yjs como camada de transporte/merge por
 * id — concorrências em nós distintos não se sobrescrevem.
 */
import { useCallback, useEffect, useRef } from "react";
import * as Y from "yjs";

import type { WorkflowCanvasHandle } from "~/components/flow/workflow-canvas";
import type { PersistedDefinition } from "~/components/flow/definition";
import { fetchDocument } from "~/services/collaboration";
import { base64Decode, base64Encode, isDocEmpty, readFromDoc, syncToDoc } from "~/lib/yjs-doc";

type UseCollabDocOptions = {
  workflowId: string;
  enabled: boolean;
  /** Definition vinda do backend — usada apenas para o seed inicial. */
  initialDefinition: PersistedDefinition | null;
  /** Handle do canvas — chamado para aplicar estado remoto. */
  canvasRef: React.RefObject<WorkflowCanvasHandle | null>;
  /** Broadcaster do WS — vem do useCollaboration. */
  sendYjsUpdate: (updateBase64: string) => void;
};

const LOCAL_ORIGIN = "local";
const REMOTE_ORIGIN = "remote";
const BOOTSTRAP_ORIGIN = "bootstrap";
const SEED_ORIGIN = "seed";

/** Origins que não devem disparar broadcast Yjs ao gerar update no doc. */
const NON_BROADCAST = new Set<unknown>([REMOTE_ORIGIN, BOOTSTRAP_ORIGIN, SEED_ORIGIN]);

export function useCollabDoc({
  workflowId,
  enabled,
  initialDefinition,
  canvasRef,
  sendYjsUpdate,
}: UseCollabDocOptions) {
  const docRef = useRef<Y.Doc | null>(null);
  const readyRef = useRef(false);
  // Suprime aplicação no canvas durante o bootstrap (o canvas já hidrata
  // initialDefinition por conta própria; só sobrescrevemos se há patches).
  const hasRemoteStateRef = useRef(false);

  // Bootstrap do doc.
  useEffect(() => {
    if (!enabled || !workflowId) return;
    let cancelled = false;
    const doc = new Y.Doc();
    docRef.current = doc;

    (async () => {
      try {
        const snap = await fetchDocument(workflowId);
        if (cancelled) return;
        if (snap.snapshot) {
          Y.applyUpdate(doc, base64Decode(snap.snapshot.updateBase64), BOOTSTRAP_ORIGIN);
          hasRemoteStateRef.current = true;
        }
        for (const p of snap.patches) {
          Y.applyUpdate(doc, base64Decode(p.updateBase64), BOOTSTRAP_ORIGIN);
          hasRemoteStateRef.current = true;
        }
      } catch {
        // gateway offline — segue só com seed local
      }
      if (cancelled) return;

      // Seed se doc vazio (primeiro usuário do workflow).
      if (isDocEmpty(doc) && initialDefinition) {
        syncToDoc(doc, initialDefinition, SEED_ORIGIN);
      } else if (hasRemoteStateRef.current) {
        // Doc tem estado remoto → empurra pro canvas (sobrescreve o
        // initialDefinition que o canvas hidratou do React Query).
        const def = readFromDoc(doc);
        canvasRef.current?.applyRemoteDefinition(def);
      }

      readyRef.current = true;
    })();

    return () => {
      cancelled = true;
      readyRef.current = false;
      hasRemoteStateRef.current = false;
      doc.destroy();
      docRef.current = null;
    };
  }, [enabled, workflowId, initialDefinition, canvasRef]);

  // Broadcast: qualquer update local vira mensagem no WS.
  useEffect(() => {
    const doc = docRef.current;
    if (!enabled || !doc) return;
    const handler = (update: Uint8Array, origin: unknown) => {
      if (NON_BROADCAST.has(origin)) return;
      sendYjsUpdate(base64Encode(update));
    };
    doc.on("update", handler);
    return () => {
      doc.off("update", handler);
    };
  }, [enabled, sendYjsUpdate, workflowId]);

  // Handler para mensagens remotas do WS — exposto para o useCollaboration.
  const onRemoteUpdate = useCallback((updateBase64: string) => {
    const doc = docRef.current;
    if (!doc) return;
    try {
      Y.applyUpdate(doc, base64Decode(updateBase64), REMOTE_ORIGIN);
    } catch {
      return;
    }
    const def = readFromDoc(doc);
    canvasRef.current?.applyRemoteDefinition(def);
  }, [canvasRef]);

  // Chamado pelo parent sempre que o canvas reporta dirty local.
  const pushLocalChange = useCallback(() => {
    const doc = docRef.current;
    if (!doc || !readyRef.current) return;
    const def = canvasRef.current?.getDefinition();
    if (!def) return;
    syncToDoc(doc, def, LOCAL_ORIGIN);
  }, [canvasRef]);

  return { onRemoteUpdate, pushLocalChange };
}
