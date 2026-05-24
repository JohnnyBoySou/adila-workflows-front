import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Loader2 } from "lucide-react";

import type { PersistedNode } from "~/components/flow/definition";
import type { Route } from "./+types/flow";
import { WorkflowCanvas, type WorkflowCanvasHandle } from "~/components/flow/workflow-canvas";
import {
  WORKFLOW_NODE_PLAY_EVENT,
  type WorkflowNodePlayDetail,
} from "~/components/flow/workflow-node";
import { FlowTopBar, type FlowTab, type SaveState } from "~/components/flow/flow-top-bar";
import { WorkflowInfoDialog, type WorkflowInfo } from "~/components/flow/workflow-info-dialog";
import { ConnectionsManagerDialog } from "~/components/database-connections/connections-manager-dialog";
import { RequireAuth } from "~/components/auth/require-auth";
import { ExecutionsView } from "~/components/flow/executions-view";
import { PerformanceView } from "~/components/flow/performance-view";
import { Button } from "~/components/ui/button";
import * as workflowsApi from "~/services/workflows";
import * as runsApi from "~/services/runs";
import type { RunStatus } from "~/services/runs";
import { queryKeys } from "~/lib/query-keys";
import { cn } from "~/lib/utils";
import { pinnedDataApi, usePinnedData } from "~/stores/pinned-data";
import {
  PinEditorDialog,
  WORKFLOW_NODE_PIN_EDIT_EVENT,
  type WorkflowNodePinEditDetail,
} from "~/components/flow/pin-editor-dialog";
import { useSession } from "~/lib/auth-client";
import { useCollaboration, type RemotePresence } from "~/hooks/use-collaboration";
import { useOrgMembersIndex } from "~/hooks/use-org-members";
import { useWorkflowComments } from "~/hooks/use-workflow-comments";
import { CommentThreadSheet } from "~/components/flow/comments/comment-thread-sheet";
import type { MentionMember } from "~/components/flow/comments/mention-input";
import { useCollabDoc } from "~/hooks/use-collab-doc";
import type { PersistedDefinition } from "~/components/flow/definition";
import { CollabPresenceStack } from "~/components/flow/collab-presence-stack";
import { DraftAheadBanner } from "~/components/flow/draft-ahead-banner";
import { PublishVersionDialog } from "~/components/flow/publish-version-dialog";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Workflow Editor" },
    { name: "description", content: "Editor de workflows com React Flow" },
  ];
}

const AUTO_SAVE_DEBOUNCE_MS = 30_000;

const TERMINAL_RUN_STATUSES = new Set<RunStatus>(["success", "failed", "cancelled"]);

export default function FlowRoute() {
  return (
    <RequireAuth>
      <FlowRouteInner />
    </RequireAuth>
  );
}

function FlowRouteInner() {
  const { id } = useParams<{ id: string }>();

  // React Flow precisa do DOM (mede nós, faz fitView), então só montamos no cliente.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const [tab, setTab] = useState<FlowTab>("editor");
  const [infoOpen, setInfoOpen] = useState(false);
  const [infoNodesSnapshot, setInfoNodesSnapshot] = useState<PersistedNode[]>([]);
  const [connectionsOpen, setConnectionsOpen] = useState(false);
  const [publishDialogOpen, setPublishDialogOpen] = useState(false);
  const [focusedRunId, setFocusedRunId] = useState<string | null>(null);

  const { data: sessionData } = useSession();
  const collabUser = sessionData?.user
    ? {
        id: sessionData.user.id,
        name: sessionData.user.name,
        email: sessionData.user.email,
        image: sessionData.user.image ?? null,
      }
    : null;
  // Refs para quebrar o ciclo entre useCollaboration (precisa do onYjsUpdate
  // do useCollabDoc) e useCollabDoc (precisa do sendYjsUpdate do collab).
  const remoteYjsHandlerRef = useRef<((b64: string) => void) | null>(null);
  const handleIncomingYjs = useCallback((b64: string) => {
    remoteYjsHandlerRef.current?.(b64);
  }, []);

  const collab = useCollaboration({
    workflowId: id ?? "",
    user: collabUser,
    enabled: !!id && tab === "editor",
    onYjsUpdate: handleIncomingYjs,
    onCommentEvent: (event) => comments.handleEvent(event),
  });
  const { index: membersIndex } = useOrgMembersIndex();

  // ── Comentários (threads + WS) ─────────────────────────────────────────
  const commentsMembersIndex = useMemo<Map<string, MentionMember>>(() => {
    const m = new Map<string, MentionMember>();
    for (const [uid, member] of membersIndex.entries()) {
      m.set(uid, { id: uid, name: member.name, email: member.email });
    }
    return m;
  }, [membersIndex]);
  const mentionMembers = useMemo<MentionMember[]>(
    () => Array.from(commentsMembersIndex.values()),
    [commentsMembersIndex],
  );
  const comments = useWorkflowComments({
    workflowId: id ?? "",
    currentUserId: sessionData?.user?.id,
    membersIndex: commentsMembersIndex,
  });
  const [commentSheetOpen, setCommentSheetOpen] = useState(false);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [draftCommentPin, setDraftCommentPin] = useState<{ x: number; y: number } | null>(null);

  const activeThread = useMemo(
    () => comments.threads.find((t) => t.root.id === activeThreadId) ?? null,
    [comments.threads, activeThreadId],
  );

  const handleCreateCommentAt = useCallback((coords: { x: number; y: number }) => {
    setActiveThreadId(null);
    setDraftCommentPin(coords);
    setCommentSheetOpen(true);
  }, []);
  const handleOpenCommentThread = useCallback((rootId: string) => {
    setDraftCommentPin(null);
    setActiveThreadId(rootId);
    setCommentSheetOpen(true);
  }, []);
  const handleCommentSheetOpenChange = useCallback((open: boolean) => {
    setCommentSheetOpen(open);
    if (!open) {
      setActiveThreadId(null);
      setDraftCommentPin(null);
    }
  }, []);

  const enrichedOthers = useMemo<RemotePresence[]>(
    () =>
      collab.others.map((p) => {
        const m = membersIndex.get(p.userId);
        return m
          ? { ...p, displayName: m.name || m.email, email: m.email, image: m.image }
          : p;
      }),
    [collab.others, membersIndex],
  );

  const queryClient = useQueryClient();
  const workflowQuery = useQuery({
    queryKey: queryKeys.workflows.detail(id ?? ""),
    queryFn: () => workflowsApi.get(id!),
    enabled: !!id,
  });

  // Mantém estado local de "info" (name/description) sincronizado com o servidor.
  const [info, setInfo] = useState<WorkflowInfo>({ name: "", description: "" });
  useEffect(() => {
    if (workflowQuery.data) {
      setInfo({
        name: workflowQuery.data.name,
        description: workflowQuery.data.description ?? "",
      });
    }
  }, [workflowQuery.data]);

  // ── Save: estado + mutation ──────────────────────────────────────────
  const canvasRef = useRef<WorkflowCanvasHandle>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const saveMutation = useMutation({
    mutationFn: (definition: Record<string, unknown>) => workflowsApi.update(id!, { definition }),
    onMutate: () => setSaveState("saving"),
    onSuccess: (wf) => {
      setSaveState("saved");
      setLastSavedAt(Date.now());
      // Atualiza o cache sem refetch — o canvas não re-hidrata enquanto a
      // mesma instância estiver montada (key estável).
      queryClient.setQueryData(queryKeys.workflows.detail(wf.id), wf);
      // Invalida listagens pra refletir `updatedAt`.
      queryClient.invalidateQueries({ queryKey: queryKeys.workflows.all });
    },
    onError: () => setSaveState("error"),
  });

  const flushSave = useCallback(() => {
    if (!id || !canvasRef.current) return;
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
      debounceTimer.current = null;
    }
    const def = canvasRef.current.getDefinition();
    saveMutation.mutate(def as unknown as Record<string, unknown>);
  }, [id, saveMutation]);

  // ── Sincronização Yjs do documento ─────────────────────────────────────
  const collabDoc = useCollabDoc({
    workflowId: id ?? "",
    enabled: !!id && tab === "editor",
    initialDefinition: (workflowQuery.data?.definition ?? null) as PersistedDefinition | null,
    canvasRef,
    sendYjsUpdate: collab.sendYjsUpdate,
  });
  useEffect(() => {
    remoteYjsHandlerRef.current = collabDoc.onRemoteUpdate;
    return () => {
      remoteYjsHandlerRef.current = null;
    };
  }, [collabDoc.onRemoteUpdate]);

  const handleDirty = useCallback(() => {
    setSaveState((prev) => (prev === "saving" ? prev : "dirty"));
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(flushSave, AUTO_SAVE_DEBOUNCE_MS);
    // Propaga a mudança para o Y.Doc — o broadcast Yjs sai pelo WS imediato
    // (não espera o debounce de save).
    collabDoc.pushLocalChange();
  }, [flushSave, collabDoc]);

  // Cmd/Ctrl+S → flush imediato. Capture: bate antes de browser tentar
  // o save-page dele (mesmo `preventDefault` ainda é necessário).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const cmd = e.metaKey || e.ctrlKey;
      if (cmd && (e.key === "s" || e.key === "S")) {
        e.preventDefault();
        flushSave();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [flushSave]);

  // Cleanup do debounce ao sair da rota (evita save tardio com canvasRef nulo).
  useEffect(() => {
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, []);

  // Beforeunload guard quando há dirty/saving — evita perder mudanças em refresh.
  useEffect(() => {
    if (saveState !== "dirty" && saveState !== "saving") return;
    // `preventDefault` sozinho basta nos navegadores modernos; o aviso
    // exibido é controlado pelo browser, não pelo nosso texto.
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [saveState]);

  // ── Lista de runs (mesma query do ExecutionsView — cache compartilhado) ─
  // Usada aqui apenas para derivar `hasActiveRun` e pulsar o ícone da aba.
  const runsQuery = useQuery({
    queryKey: queryKeys.runs.list(id ?? ""),
    queryFn: () => runsApi.list(id!, { limit: 50 }),
    enabled: !!id,
    refetchInterval: (q) => {
      const data = q.state.data;
      if (!data || data.length === 0) return false;
      return data.some((r) => !TERMINAL_RUN_STATUSES.has(r.status)) ? 5000 : false;
    },
  });
  const hasActiveRun = (runsQuery.data ?? []).some(
    (r) => !TERMINAL_RUN_STATUSES.has(r.status),
  );

  const pinnedMap = usePinnedData(id ?? "");
  const pinnedCount = Object.keys(pinnedMap).length;
  const handleClearPins = useCallback(() => {
    if (!id) return;
    pinnedDataApi.clear(id);
  }, [id]);

  // Modo inspector — persiste em localStorage pra durar entre reloads/abas
  // do mesmo workflow. Default off pra não distrair quem só quer editar.
  const [inspectorMode, setInspectorMode] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("adila.inspector-mode.v1") === "1";
  });
  const toggleInspectorMode = useCallback(() => {
    setInspectorMode((cur) => {
      const next = !cur;
      try {
        localStorage.setItem("adila.inspector-mode.v1", next ? "1" : "0");
      } catch {
        // safari privado / quota — silencioso, é só preferência.
      }
      return next;
    });
  }, []);

  // ── Run: dispara o workflow e troca pra aba de execuções ───────────────
  // `pinnedData` é lido no momento do disparo (vive em localStorage, fora
  // do React Query) — assim cada run pega o snapshot mais recente, sem
  // precisar de reatividade aqui.
  const runMutation = useMutation({
    mutationFn: (opts: { stopAtNodeId?: string } = {}) => {
      const pinnedData = id ? pinnedDataApi.get(id) : {};
      return workflowsApi.run(id!, {
        ...(Object.keys(pinnedData).length > 0 && { pinnedData }),
        ...(opts.stopAtNodeId && { stopAtNodeId: opts.stopAtNodeId }),
      });
    },
    onSuccess: (res) => {
      setFocusedRunId(res.runId);
      setTab("executions");
      queryClient.invalidateQueries({ queryKey: queryKeys.runs.list(id!) });
    },
  });

  const handleRun = useCallback(
    (stopAtNodeId?: string) => {
      if (!id) return;
      // Garante que o estado atual do canvas foi persistido antes de disparar
      // — caso contrário o worker pega a definition antiga.
      if (saveState === "dirty") flushSave();
      runMutation.mutate(stopAtNodeId ? { stopAtNodeId } : {});
    },
    [id, saveState, flushSave, runMutation],
  );

  // Botão "play" dentro do node toolbar emite via window — escutamos aqui
  // pra disparar a execução até esse nó (engine para após executá-lo e
  // devolve o output como resultado final do run).
  useEffect(() => {
    function onPlayFromNode(e: Event) {
      const evt = e as CustomEvent<WorkflowNodePlayDetail>;
      handleRun(evt.detail?.nodeId);
    }
    window.addEventListener(WORKFLOW_NODE_PLAY_EVENT, onPlayFromNode);
    return () => window.removeEventListener(WORKFLOW_NODE_PLAY_EVENT, onPlayFromNode);
  }, [handleRun]);

  const [pinEditorNodeId, setPinEditorNodeId] = useState<string | null>(null);
  useEffect(() => {
    function onPinEdit(e: Event) {
      const evt = e as CustomEvent<WorkflowNodePinEditDetail>;
      if (evt.detail?.nodeId) setPinEditorNodeId(evt.detail.nodeId);
    }
    window.addEventListener(WORKFLOW_NODE_PIN_EDIT_EVENT, onPinEdit);
    return () => window.removeEventListener(WORKFLOW_NODE_PIN_EDIT_EVENT, onPinEdit);
  }, []);

  // Persistir mudanças de info (nome/descrição).
  const handleInfoSave = useCallback(
    (next: WorkflowInfo) => {
      setInfo(next);
      if (!id) return;
      workflowsApi
        .update(id, { name: next.name, description: next.description || null })
        .then((wf) => {
          queryClient.setQueryData(queryKeys.workflows.detail(id), wf);
          queryClient.invalidateQueries({ queryKey: queryKeys.workflows.all });
          return wf;
        })
        .catch(() => {
          /* erro silenciado por ora — dialog mostra falha quando tiver toast */
        });
    },
    [id, queryClient],
  );

  // ── Estados de carregamento / erro ────────────────────────────────────
  if (!id) return <NotFoundState />;
  if (workflowQuery.isPending) return <LoadingState />;
  if (workflowQuery.error || !workflowQuery.data) return <NotFoundState />;

  const workflow = workflowQuery.data;

  return (
    <main className="flex h-dvh w-full flex-col">
      <div className="relative flex-1">
        {/* Mantemos o canvas montado mesmo na aba de execuções para preservar o
            estado do flow (nodes, zoom, seleção). */}
        <div className={cn("absolute inset-0", tab === "editor" ? "block" : "hidden")}>
          {mounted ? (
            <WorkflowCanvas
              // key estável por workflow — trocar de workflow remonta o canvas
              // e re-hidrata; edições dentro do mesmo workflow não remontam.
              key={workflow.id}
              ref={canvasRef}
              workflowId={workflow.id}
              initialDefinition={workflow.definition}
              onDirtyChange={handleDirty}
              remoteCursors={enrichedOthers}
              nodeLocks={collab.nodeLocks}
              onCursorMove={collab.sendCursor}
              onSelectionChange={collab.sendSelection}
              onNodeGrab={collab.sendGrab}
              onNodeRelease={collab.sendRelease}
              onViewportChange={collab.sendViewport}
              commentThreads={comments.threads}
              activeCommentThreadId={activeThreadId}
              draftCommentPin={draftCommentPin}
              onCreateCommentAt={handleCreateCommentAt}
              onOpenCommentThread={handleOpenCommentThread}
              inspectorMode={inspectorMode}
            />
          ) : (
            <LoadingState />
          )}
        </div>
        <div className={cn("absolute inset-0", tab === "executions" ? "block" : "hidden")}>
          <ExecutionsView
            workflowId={workflow.id}
            focusedRunId={focusedRunId}
            onFocusedRunHandled={() => setFocusedRunId(null)}
            onOpenInEditor={(runId) => {
              setFocusedRunId(runId);
              setTab("editor");
            }}
          />
        </div>
        <div className={cn("absolute inset-0", tab === "performance" ? "block" : "hidden")}>
          <PerformanceView
            workflowId={workflow.id}
            active={tab === "performance"}
            onShowExecutions={(focusRunId) => {
              if (focusRunId) setFocusedRunId(focusRunId);
              setTab("executions");
            }}
          />
        </div>
        <div className="pointer-events-none absolute right-6 top-6 z-30 flex items-center">
          <div className="pointer-events-auto rounded-full border bg-card/90 px-3 py-1.5 shadow-sm backdrop-blur">
            <CollabPresenceStack status={collab.status} others={enrichedOthers} />
          </div>
        </div>
        {tab === "editor" && (
          <div className="pointer-events-none absolute left-1/2 top-6 z-30 flex -translate-x-1/2">
            <DraftAheadBanner
              workflowId={workflow.id}
              draftDefinition={workflow.definition}
              onPublish={() => setPublishDialogOpen(true)}
              publishing={publishDialogOpen}
            />
          </div>
        )}
        <FlowTopBar
          tab={tab}
          onTabChange={setTab}
          onInfoClick={() => setInfoOpen(true)}
          onConnectionsClick={() => setConnectionsOpen(true)}
          onSave={flushSave}
          onRun={handleRun}
          onPublish={() => setPublishDialogOpen(true)}
          saveState={saveState}
          publishState="idle"
          lastSavedAt={lastSavedAt}
          hasActiveRun={hasActiveRun}
          pinnedCount={pinnedCount}
          onClearPins={handleClearPins}
          inspectorMode={inspectorMode}
          onToggleInspectorMode={toggleInspectorMode}
        />
      </div>

      <WorkflowInfoDialog
        open={infoOpen}
        onOpenChange={(next) => {
          if (next) {
            const def = canvasRef.current?.getDefinition();
            setInfoNodesSnapshot(def?.nodes ?? []);
          }
          setInfoOpen(next);
        }}
        info={info}
        onSave={handleInfoSave}
        workflowId={workflow.id}
        nodes={infoNodesSnapshot}
        onOpenConnectionsManager={() => {
          setInfoOpen(false);
          setConnectionsOpen(true);
        }}
      />

      <ConnectionsManagerDialog
        open={connectionsOpen}
        onOpenChange={setConnectionsOpen}
        workflowId={workflow.id}
      />

      <CommentThreadSheet
        open={commentSheetOpen}
        onOpenChange={handleCommentSheetOpenChange}
        thread={activeThread}
        draftCoords={draftCommentPin}
        members={mentionMembers}
        currentUserId={sessionData?.user?.id}
        onCreateRoot={async (input) => {
          const created = await comments.createComment(input);
          setDraftCommentPin(null);
          setActiveThreadId(created.id);
        }}
        onCreateReply={async (parentId, input) =>
          comments.createComment({ ...input, parentId })
        }
        onUpdate={async (commentId, patch) => comments.updateComment({ commentId, patch })}
        onDelete={async (commentId) => {
          await comments.deleteComment(commentId);
          if (activeThreadId === commentId) {
            setCommentSheetOpen(false);
            setActiveThreadId(null);
          }
        }}
      />

      <PublishVersionDialog
        open={publishDialogOpen}
        onOpenChange={setPublishDialogOpen}
        workflowId={workflow.id}
        onBeforePublish={() => {
          if (saveState === "dirty") flushSave();
        }}
      />

      <PinEditorDialog
        workflowId={id ?? null}
        nodeId={pinEditorNodeId}
        open={pinEditorNodeId !== null}
        onOpenChange={(next) => {
          if (!next) setPinEditorNodeId(null);
        }}
      />
    </main>
  );
}

function LoadingState() {
  return (
    <div className="flex h-dvh w-full items-center justify-center text-sm text-muted-foreground">
      <span className="inline-flex items-center gap-2">
        <Loader2 className="size-4 animate-spin" /> Carregando workflow…
      </span>
    </div>
  );
}

function NotFoundState() {
  return (
    <div className="flex h-dvh w-full flex-col items-center justify-center gap-3 text-sm">
      <AlertTriangle className="size-6 text-amber-500" />
      <p className="font-medium">Workflow não encontrado.</p>
      <Button asChild size="sm" variant="outline">
        <Link to="/dashboard/workflows">Voltar para workflows</Link>
      </Button>
    </div>
  );
}
