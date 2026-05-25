import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  Ban,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Loader2,
  Pencil,
  Pin,
  PinOff,
  PlayCircle,
  RefreshCw,
  Workflow as WorkflowIcon,
  XCircle,
  type LucideIcon,
} from "lucide-react";

import { Button } from "~/components/ui/button";
import { queryKeys } from "~/lib/query-keys";
import { cn } from "~/lib/utils";
import * as runsApi from "~/services/runs";
import type { RunStatus, RunStep, WorkflowRun } from "~/services/runs";
import { pinnedDataApi, useIsPinned } from "~/stores/pinned-data";
import { WORKFLOW_NODE_PIN_EDIT_EVENT } from "./pin-editor-dialog";
import { subscribeToRunEvents } from "~/services/run-events";
import { CopyJsonButton, HighlightedJson } from "./highlighted-json";
import { useExecutionStore } from "~/stores/execution";

type ExecutionsViewProps = {
  workflowId: string;
  /** Run recém-disparado — abre o painel de detalhe automaticamente. */
  focusedRunId: string | null;
  onFocusedRunHandled?: () => void;
  /** Pede pro pai trocar pra aba do editor com o overlay desta run. */
  onOpenInEditor?: (runId: string) => void;
};

const STATUS_META: Record<
  RunStatus,
  { icon: LucideIcon; label: string; color: string; dot: string; border: string }
> = {
  queued: {
    icon: Clock,
    label: "Na fila",
    color: "text-muted-foreground",
    dot: "bg-muted",
    border: "border-l-muted-foreground/30",
  },
  running: {
    icon: Loader2,
    label: "Em execução",
    color: "text-sky-600",
    dot: "bg-sky-500",
    border: "border-l-sky-500",
  },
  success: {
    icon: CheckCircle2,
    label: "Sucesso",
    color: "text-emerald-600",
    dot: "bg-emerald-500",
    border: "border-l-emerald-500",
  },
  failed: {
    icon: XCircle,
    label: "Falhou",
    color: "text-rose-600",
    dot: "bg-rose-500",
    border: "border-l-rose-500",
  },
  cancelled: {
    icon: Ban,
    label: "Cancelado",
    color: "text-amber-600",
    dot: "bg-amber-500",
    border: "border-l-amber-500",
  },
};

const TERMINAL_STATUSES = new Set<RunStatus>(["success", "failed", "cancelled"]);

const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

const timeFormatter = new Intl.DateTimeFormat("pt-BR", {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return dateFormatter.format(new Date(iso));
}

function formatTime(iso: string | null): string {
  if (!iso) return "—";
  return timeFormatter.format(new Date(iso));
}

function formatDuration(run: WorkflowRun): string {
  if (!run.startedAt) return "—";
  const end = run.finishedAt ? Date.parse(run.finishedAt) : Date.now();
  const ms = end - Date.parse(run.startedAt);
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const min = Math.floor(ms / 60_000);
  const sec = Math.floor((ms % 60_000) / 1000);
  return `${min}m ${sec}s`;
}

export function ExecutionsView({
  workflowId,
  focusedRunId,
  onFocusedRunHandled,
  onOpenInEditor,
}: ExecutionsViewProps) {
  const queryClient = useQueryClient();
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);

  const runsQuery = useQuery({
    queryKey: queryKeys.runs.list(workflowId),
    queryFn: () => runsApi.list(workflowId, { limit: 50 }),
    // Enquanto houver run não-terminal, polling leve como fallback ao SSE.
    refetchInterval: (q) => {
      const data = q.state.data;
      if (!data || data.length === 0) return false;
      return data.some((r) => !TERMINAL_STATUSES.has(r.status)) ? 5000 : false;
    },
  });

  const runs = runsQuery.data ?? [];

  // Run recém-disparado pelo botão Play é selecionado automaticamente.
  // Fora isso, a aba abre sem nenhum run selecionado — o usuário escolhe
  // explicitamente o que quer inspecionar.
  useEffect(() => {
    if (focusedRunId) {
      setSelectedRunId(focusedRunId);
      onFocusedRunHandled?.();
    }
  }, [focusedRunId, onFocusedRunHandled]);

  const counts = runs.reduce(
    (acc, r) => {
      acc[r.status] = (acc[r.status] ?? 0) + 1;
      return acc;
    },
    {} as Record<RunStatus, number>,
  );

  return (
    <div className="flex h-full w-full overflow-hidden bg-background">
      {/* Aside esquerdo — lista de runs */}
      <aside className="flex w-80 shrink-0 flex-col border-r border-border bg-card">
        <header className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
          <div>
            <h2 className="font-heading text-sm font-medium text-foreground">Execuções</h2>
            <p className="text-xs text-muted-foreground">{runs.length} runs</p>
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            {counts.success ? (
              <span className="inline-flex items-center gap-1">
                <span className="size-1.5 rounded-full bg-emerald-500" /> {counts.success}
              </span>
            ) : null}
            {counts.failed ? (
              <span className="inline-flex items-center gap-1">
                <span className="size-1.5 rounded-full bg-rose-500" /> {counts.failed}
              </span>
            ) : null}
            {counts.running || counts.queued ? (
              <span className="inline-flex items-center gap-1">
                <span className="size-1.5 rounded-full bg-sky-500" />{" "}
                {(counts.running ?? 0) + (counts.queued ?? 0)}
              </span>
            ) : null}
            <Button
              size="icon-sm"
              variant="ghost"
              onClick={() =>
                queryClient.invalidateQueries({ queryKey: queryKeys.runs.list(workflowId) })
              }
              aria-label="Recarregar"
              title="Recarregar"
              disabled={runsQuery.isFetching}
            >
              <RefreshCw className={cn("size-3.5", runsQuery.isFetching && "animate-spin")} />
            </Button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto">
          {runsQuery.isPending ? (
            <div className="grid place-items-center py-16 text-xs text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
            </div>
          ) : runs.length === 0 ? (
            <AsideEmptyState />
          ) : (
            <ul>
              {runs.map((run, i) => (
                <RunListItem
                  key={run.id}
                  run={run}
                  index={i}
                  selected={selectedRunId === run.id}
                  onSelect={() => setSelectedRunId(run.id)}
                />
              ))}
            </ul>
          )}
        </div>
      </aside>

      {/* Detalhe à direita */}
      <section className="flex-1 overflow-y-auto">
        {selectedRunId ? (
          <RunDetailPanel
            workflowId={workflowId}
            runId={selectedRunId}
            onOpenInEditor={onOpenInEditor}
          />
        ) : (
          <DetailEmptyState hasRuns={runs.length > 0} />
        )}
      </section>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Item compacto da lista lateral                                              */
/* -------------------------------------------------------------------------- */

function RunListItem({
  run,
  index,
  selected,
  onSelect,
}: {
  run: WorkflowRun;
  index: number;
  selected: boolean;
  onSelect: () => void;
}) {
  const meta = STATUS_META[run.status];
  const Icon = meta.icon;
  const isRunning = run.status === "running";

  return (
    <motion.li
      initial={{ opacity: 0, x: -6 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: Math.min(index, 10) * 0.02, type: "spring", stiffness: 380, damping: 30 }}
    >
      <button
        type="button"
        onClick={onSelect}
        className={cn(
          "flex w-full flex-col gap-1 border-b border-border border-l-2 px-3 py-2.5 text-left transition-colors hover:bg-muted/40",
          meta.border,
          selected && "bg-muted/60",
        )}
      >
        <div className="flex items-center justify-between gap-2">
          <span className={cn("inline-flex items-center gap-1.5 text-xs font-medium", meta.color)}>
            <Icon className={cn("size-3.5", isRunning && "animate-spin")} />
            {meta.label}
          </span>
          <span className="font-mono text-[10px] text-muted-foreground">
            {run.id.slice(0, 8)}
          </span>
        </div>
        <div className="flex items-center justify-between text-xs text-muted-foreground tabular-nums">
          <span>{formatTime(run.startedAt ?? run.createdAt)}</span>
          <span>{formatDuration(run)}</span>
        </div>
      </button>
    </motion.li>
  );
}

function AsideEmptyState() {
  return (
    <div className="grid place-items-center px-4 py-12 text-center">
      <div className="space-y-2">
        <PlayCircle className="mx-auto size-5 text-muted-foreground/60" />
        <p className="text-xs text-muted-foreground">Nenhuma execução ainda.</p>
      </div>
    </div>
  );
}

function DetailEmptyState({ hasRuns }: { hasRuns: boolean }) {
  return (
    <div className="grid h-full place-items-center px-6 text-center">
      <div className="space-y-2">
        <PlayCircle className="mx-auto size-8 text-muted-foreground/60" />
        <p className="text-sm font-medium">
          {hasRuns ? "Selecione um run pra ver os detalhes" : "Nenhuma execução ainda"}
        </p>
        <p className="text-xs text-muted-foreground">
          {hasRuns
            ? "Escolha uma execução na lista ao lado."
            : "Clique no botão Play para disparar o workflow manualmente."}
        </p>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Painel de detalhe — steps em ordem, com SSE se o run ainda estiver vivo.    */
/* -------------------------------------------------------------------------- */

function RunDetailPanel({
  workflowId,
  runId,
  onOpenInEditor,
}: {
  workflowId: string;
  runId: string;
  onOpenInEditor?: (runId: string) => void;
}) {
  const queryClient = useQueryClient();

  const runQuery = useQuery({
    queryKey: queryKeys.runs.detail(workflowId, runId),
    queryFn: () => runsApi.get(workflowId, runId),
  });

  const stepsQuery = useQuery({
    queryKey: queryKeys.runs.steps(workflowId, runId),
    queryFn: () => runsApi.listSteps(workflowId, runId),
  });

  const run = runQuery.data;
  const steps = stepsQuery.data ?? [];

  // Espelha os steps deste run no store de execução para o canvas pintar
  // os nós e o inspector lateral exibir input/output. Limpa ao desmontar
  // (trocar run / fechar painel) — o inspector fecha junto.
  const setFocused = useExecutionStore((s) => s.setFocused);
  const clearExecution = useExecutionStore((s) => s.clear);
  useEffect(() => {
    setFocused(runId, steps);
    return () => clearExecution();
  }, [runId, steps, setFocused, clearExecution]);

  const cancelMutation = useMutation({
    mutationFn: () => runsApi.cancel(workflowId, runId),
    onSuccess: (updated) => {
      queryClient.setQueryData(queryKeys.runs.detail(workflowId, runId), updated);
      queryClient.invalidateQueries({ queryKey: queryKeys.runs.list(workflowId) });
    },
  });

  const rerunMutation = useMutation({
    mutationFn: () => runsApi.rerun(workflowId, runId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.runs.list(workflowId) });
    },
  });

  // SSE: enquanto o run não estiver terminal, ouvimos eventos para atualizar
  // steps e status ao vivo. Backend fecha o stream em terminais.
  useEffect(() => {
    if (!run) return;
    if (TERMINAL_STATUSES.has(run.status)) return;

    const sub = subscribeToRunEvents(workflowId, runId, {
      onSnapshot: (evt) => {
        queryClient.setQueryData(queryKeys.runs.detail(workflowId, runId), evt.run);
        queryClient.setQueryData(queryKeys.runs.steps(workflowId, runId), evt.steps);
      },
      onStepStart: () => {
        queryClient.invalidateQueries({ queryKey: queryKeys.runs.steps(workflowId, runId) });
      },
      onStepSuccess: () => {
        queryClient.invalidateQueries({ queryKey: queryKeys.runs.steps(workflowId, runId) });
      },
      onStepFailed: () => {
        queryClient.invalidateQueries({ queryKey: queryKeys.runs.steps(workflowId, runId) });
      },
      onRunSuccess: () => {
        queryClient.invalidateQueries({ queryKey: queryKeys.runs.detail(workflowId, runId) });
        queryClient.invalidateQueries({ queryKey: queryKeys.runs.steps(workflowId, runId) });
        queryClient.invalidateQueries({ queryKey: queryKeys.runs.list(workflowId) });
      },
      onRunFailed: () => {
        queryClient.invalidateQueries({ queryKey: queryKeys.runs.detail(workflowId, runId) });
        queryClient.invalidateQueries({ queryKey: queryKeys.runs.steps(workflowId, runId) });
        queryClient.invalidateQueries({ queryKey: queryKeys.runs.list(workflowId) });
      },
      onRunCancelled: () => {
        queryClient.invalidateQueries({ queryKey: queryKeys.runs.detail(workflowId, runId) });
        queryClient.invalidateQueries({ queryKey: queryKeys.runs.list(workflowId) });
      },
    });
    return () => sub.close();
  }, [workflowId, runId, run, queryClient]);

  if (runQuery.isPending) {
    return (
      <div className="grid h-full place-items-center text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
      </div>
    );
  }

  if (!run) return null;

  const meta = STATUS_META[run.status];
  const isTerminal = TERMINAL_STATUSES.has(run.status);

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-4 px-6 pb-6 pt-20">
      {/* Header do detalhe */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3">
        <div className="flex items-center gap-3">
          <span className={cn("inline-flex items-center gap-2 text-sm font-medium", meta.color)}>
            <meta.icon className={cn("size-4", run.status === "running" && "animate-spin")} />
            {meta.label}
          </span>
          <span className="font-mono text-xs text-muted-foreground">{run.id}</span>
        </div>
        <div className="flex items-center gap-2">
          {onOpenInEditor && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => onOpenInEditor(run.id)}
              title="Abre o editor com os nós percorridos por esta run destacados"
            >
              <WorkflowIcon className="size-4" /> Ver no editor
            </Button>
          )}
          {!isTerminal && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => cancelMutation.mutate()}
              disabled={cancelMutation.isPending}
            >
              <Ban className="size-4" /> Cancelar
            </Button>
          )}
          {isTerminal && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => rerunMutation.mutate()}
              disabled={rerunMutation.isPending}
            >
              <RefreshCw className={cn("size-4", rerunMutation.isPending && "animate-spin")} />{" "}
              Reexecutar
            </Button>
          )}
        </div>
      </div>

      {/* Metadados */}
      <div className="grid grid-cols-3 gap-4 rounded-lg border border-border bg-muted/30 px-4 py-3 text-xs">
        <Field label="Criado">{formatDate(run.createdAt)}</Field>
        <Field label="Início">{formatDate(run.startedAt)}</Field>
        <Field label="Fim">{formatDate(run.finishedAt)}</Field>
      </div>

      {/* Conteúdo */}
      <div className="space-y-4 rounded-lg border border-border bg-card p-4">
        {(run.input || run.output) && (
          <div className="grid gap-2 sm:grid-cols-2">
            {run.input && <JsonBlock label="Input do run" data={run.input} />}
            {run.output && <JsonBlock label="Output do run" data={run.output} />}
          </div>
        )}

        <StepsSection steps={steps} run={run} workflowId={workflowId} />

        {run.error && (
          <div className="mt-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs">
            <p className="font-medium text-destructive">Erro</p>
            <pre className="mt-1 overflow-x-auto whitespace-pre-wrap break-words text-destructive/90">
              {JSON.stringify(run.error, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium tabular-nums">{children}</dd>
    </div>
  );
}

/**
 * Cabeçalho da seção de steps com toggle Lista/Trilha. Mantém o estado
 * local — não vale persistir entre sessões; é mais UX-driven do que
 * preferência durável.
 */
function StepsSection({
  steps,
  run,
  workflowId,
}: {
  steps: RunStep[];
  run: WorkflowRun;
  workflowId: string;
}) {
  const sorted = [...steps].toSorted((a, b) => a.index - b.index);

  if (steps.length === 0) {
    return (
      <div className="space-y-2">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Steps (0)
        </h4>
        <p className="text-xs text-muted-foreground">Aguardando primeiro step…</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Trilha ({steps.length})
        </h4>
        <RunTimeline steps={sorted} run={run} />
      </div>
      <div className="space-y-2">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Detalhes
        </h4>
        <ol className="space-y-1.5">
          {sorted.map((step) => (
            <StepRow key={step.id} step={step} workflowId={workflowId} />
          ))}
        </ol>
      </div>
    </div>
  );
}

/**
 * Trilha tipo Gantt das durações dos steps. Eixo X = tempo relativo ao
 * início da run; cada step vira uma linha com barra proporcional. Steps
 * paralelos (mesmo intervalo) aparecem empilhados — fica visualmente
 * óbvio onde o workflow ramificou.
 */
function RunTimeline({ steps, run }: { steps: RunStep[]; run: WorkflowRun }) {
  // Janela: do primeiro started_at até o último finished_at (ou agora,
  // se ainda houver step rodando). Usamos run.startedAt como fallback.
  const startMs = (() => {
    const candidates = steps
      .map((s) => (s.startedAt ? new Date(s.startedAt).getTime() : null))
      .filter((v): v is number => v !== null);
    if (run.startedAt) candidates.push(new Date(run.startedAt).getTime());
    return candidates.length ? Math.min(...candidates) : Date.now();
  })();

  const endMs = (() => {
    const candidates = steps
      .map((s) => {
        if (s.finishedAt) return new Date(s.finishedAt).getTime();
        if (s.startedAt && s.durationMs !== null)
          return new Date(s.startedAt).getTime() + s.durationMs;
        return null;
      })
      .filter((v): v is number => v !== null);
    if (run.finishedAt) candidates.push(new Date(run.finishedAt).getTime());
    return candidates.length ? Math.max(...candidates) : startMs + 1;
  })();

  const totalMs = Math.max(1, endMs - startMs);

  // Eixo: 4 marcações equidistantes (0%, 33%, 66%, 100%).
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => ({
    pct: t * 100,
    label: formatMs(totalMs * t),
  }));

  return (
    <div className="space-y-2 rounded-md border border-border bg-muted/10 p-3">
      {/* Eixo de tempo */}
      <div className="relative ml-32 mr-2 h-4 border-b border-border/60">
        {ticks.map((t) => (
          <span
            key={t.pct}
            className="absolute -bottom-0.5 -translate-x-1/2 text-[10px] tabular-nums text-muted-foreground"
            style={{ left: `${t.pct}%` }}
          >
            {t.label}
          </span>
        ))}
      </div>

      <div className="space-y-1">
        {steps.map((step) => {
          const stepStart = step.startedAt ? new Date(step.startedAt).getTime() : startMs;
          const stepEnd = step.finishedAt
            ? new Date(step.finishedAt).getTime()
            : step.durationMs !== null
              ? stepStart + step.durationMs
              : stepStart + 1;
          const offsetPct = ((stepStart - startMs) / totalMs) * 100;
          // Garante visibilidade mínima de 0.5% pra steps muito curtos.
          const widthPct = Math.max(0.5, ((stepEnd - stepStart) / totalMs) * 100);

          const statusKey: RunStatus =
            step.status === "running"
              ? "running"
              : step.status === "success"
                ? "success"
                : "failed";
          const meta = STATUS_META[statusKey];
          const durLabel =
            step.durationMs !== null
              ? formatMs(step.durationMs)
              : step.status === "running"
                ? "em curso…"
                : "—";

          return (
            <div key={step.id} className="flex items-center gap-2">
              <div className="flex w-32 min-w-0 items-center gap-1.5 text-xs">
                <span
                  className={cn(
                    "inline-flex size-4 shrink-0 items-center justify-center rounded-full text-[9px] font-semibold tabular-nums text-white",
                    meta.dot,
                  )}
                >
                  {step.index + 1}
                </span>
                <span className="truncate font-mono text-[11px]" title={step.nodeType}>
                  {step.nodeType}
                </span>
              </div>
              <div className="relative h-5 flex-1">
                <div
                  className={cn(
                    "absolute top-0 h-full rounded-sm transition-all",
                    meta.dot,
                    step.status === "running" && "animate-pulse",
                  )}
                  style={{ left: `${offsetPct}%`, width: `${widthPct}%`, minWidth: 2 }}
                  title={`${step.nodeType} — ${durLabel}`}
                />
              </div>
              <span className="w-16 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">
                {durLabel}
              </span>
            </div>
          );
        })}
      </div>

      <p className="pt-1 text-[10px] text-muted-foreground">
        Total: {formatMs(totalMs)} · barras empilhadas em paralelo indicam fan-out
      </p>
    </div>
  );
}

function formatMs(ms: number): string {
  if (ms < 1) return "0ms";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(2)}s`;
  return `${Math.floor(ms / 60_000)}m ${Math.floor((ms % 60_000) / 1000)}s`;
}

function StepRow({ step, workflowId }: { step: RunStep; workflowId: string }) {
  const statusKey: RunStatus =
    step.status === "running" ? "running" : step.status === "success" ? "success" : "failed";
  const meta = STATUS_META[statusKey];
  const Icon = meta.icon;
  const [expanded, setExpanded] = useState(false);
  const hasPayload = step.output !== null || step.error !== null;
  const ChevronIcon = expanded ? ChevronDown : ChevronRight;
  const isPinned = useIsPinned(workflowId, step.nodeId);
  const canPin = step.status === "success" && step.output !== null;

  function togglePin(e: React.MouseEvent) {
    e.stopPropagation();
    if (isPinned) {
      pinnedDataApi.remove(workflowId, step.nodeId);
    } else if (step.output) {
      pinnedDataApi.set(workflowId, step.nodeId, step.output);
    }
  }

  return (
    <li className="rounded-md border border-border bg-background text-sm">
      <button
        type="button"
        onClick={() => hasPayload && setExpanded((v) => !v)}
        disabled={!hasPayload}
        className={cn(
          "flex w-full items-center gap-3 px-3 py-2 text-left",
          hasPayload && "cursor-pointer hover:bg-muted/40",
        )}
      >
        <span
          className={cn(
            "inline-flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold tabular-nums text-white",
            meta.dot,
          )}
        >
          {step.index + 1}
        </span>
        <span className={cn("inline-flex items-center gap-1.5", meta.color)}>
          <Icon className={cn("size-3.5", step.status === "running" && "animate-spin")} />
        </span>
        <span className="truncate font-mono text-xs">{step.nodeType}</span>
        <span className="ml-auto tabular-nums text-xs text-muted-foreground">
          {step.durationMs !== null ? `${step.durationMs}ms` : "—"}
        </span>
        {canPin && (
          <span
            role="button"
            tabIndex={0}
            onClick={togglePin}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                togglePin(e as unknown as React.MouseEvent);
              }
            }}
            aria-label={isPinned ? "Despinar output deste nó" : "Pinar output deste nó"}
            title={
              isPinned
                ? "Output pinado — clique para despinar"
                : "Pinar output (próximos runs pulam este nó)"
            }
            className={cn(
              "inline-flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground",
              isPinned && "text-amber-500 hover:text-amber-600",
            )}
          >
            {isPinned ? <PinOff className="size-3.5" /> : <Pin className="size-3.5" />}
          </span>
        )}
        {isPinned && (
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation();
              window.dispatchEvent(
                new CustomEvent(WORKFLOW_NODE_PIN_EDIT_EVENT, {
                  detail: { nodeId: step.nodeId },
                }),
              );
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                e.stopPropagation();
                window.dispatchEvent(
                  new CustomEvent(WORKFLOW_NODE_PIN_EDIT_EVENT, {
                    detail: { nodeId: step.nodeId },
                  }),
                );
              }
            }}
            aria-label="Editar JSON pinado"
            title="Editar JSON pinado"
            className="inline-flex size-6 items-center justify-center rounded-md text-amber-500 hover:bg-muted hover:text-amber-600"
          >
            <Pencil className="size-3.5" />
          </span>
        )}
        {hasPayload && <ChevronIcon className="size-3.5 text-muted-foreground" />}
      </button>

      {expanded && hasPayload && (
        <div className="space-y-2 border-t border-border bg-muted/20 p-3">
          {step.output && <JsonBlock label="Output" data={step.output} />}
          {step.error && <JsonBlock label="Erro" data={step.error} tone="error" />}
        </div>
      )}
    </li>
  );
}

function JsonBlock({
  label,
  data,
  tone = "default",
}: {
  label: string;
  data: Record<string, unknown>;
  tone?: "default" | "error";
}) {
  return (
    <div
      className={cn(
        "rounded-md border bg-background px-3 py-2 text-xs",
        tone === "error" ? "border-destructive/40 bg-destructive/5" : "border-border",
      )}
    >
      <div className="mb-1 flex items-center justify-between">
        <p
          className={cn(
            "font-medium",
            tone === "error" ? "text-destructive" : "text-muted-foreground",
          )}
        >
          {label}
        </p>
        {tone !== "error" && <CopyJsonButton value={data} />}
      </div>
      <pre
        className={cn(
          "max-h-64 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed",
          tone === "error" && "text-destructive/90",
        )}
      >
        {tone === "error" ? JSON.stringify(data, null, 2) : <HighlightedJson value={data} />}
      </pre>
    </div>
  );
}
