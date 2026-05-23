import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Loader2 } from "lucide-react";

import type { Route } from "./+types/flow";
import { WorkflowCanvas, type WorkflowCanvasHandle } from "~/components/flow/workflow-canvas";
import { FlowTopBar, type FlowTab, type SaveState } from "~/components/flow/flow-top-bar";
import { WorkflowInfoDialog, type WorkflowInfo } from "~/components/flow/workflow-info-dialog";
import { ExecutionsView } from "~/components/flow/executions-view";
import { Button } from "~/components/ui/button";
import * as workflowsApi from "~/services/workflows";
import { queryKeys } from "~/lib/query-keys";
import { cn } from "~/lib/utils";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Workflow Editor" },
    { name: "description", content: "Editor de workflows com React Flow" },
  ];
}

const AUTO_SAVE_DEBOUNCE_MS = 1500;

export default function FlowRoute() {
  const { id } = useParams<{ id: string }>();

  // React Flow precisa do DOM (mede nós, faz fitView), então só montamos no cliente.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const [tab, setTab] = useState<FlowTab>("editor");
  const [infoOpen, setInfoOpen] = useState(false);

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

  const handleDirty = useCallback(() => {
    setSaveState((prev) => (prev === "saving" ? prev : "dirty"));
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(flushSave, AUTO_SAVE_DEBOUNCE_MS);
  }, [flushSave]);

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
              initialDefinition={workflow.definition}
              onDirtyChange={handleDirty}
            />
          ) : (
            <LoadingState />
          )}
        </div>
        <div className={cn("absolute inset-0", tab === "executions" ? "block" : "hidden")}>
          <ExecutionsView />
        </div>
        <FlowTopBar
          tab={tab}
          onTabChange={setTab}
          onInfoClick={() => setInfoOpen(true)}
          onSave={flushSave}
          saveState={saveState}
          lastSavedAt={lastSavedAt}
        />
      </div>

      <WorkflowInfoDialog
        open={infoOpen}
        onOpenChange={setInfoOpen}
        info={info}
        onSave={handleInfoSave}
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
