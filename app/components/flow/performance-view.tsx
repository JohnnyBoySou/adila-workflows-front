import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  AlertTriangle,
  Cpu,
  Gauge,
  History,
  Layers,
  Loader2,
  RefreshCw,
  Rocket,
  TimerReset,
  Zap,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { queryKeys } from "~/lib/query-keys";
import { cn } from "~/lib/utils";
import * as metricsApi from "~/services/workflow-metrics";
import type { LoadTestResponse } from "~/services/workflow-metrics";

type PerformanceViewProps = {
  workflowId: string;
  /** Tab ativa? Se não, suspende polling pra não cobrar back. */
  active: boolean;
  /** Chamado quando o usuário quer ir pra aba de execuções (ex.: após load test). */
  onShowExecutions?: (focusRunId?: string) => void;
};

const REFRESH_MS = 5000;
const timeFormatter = new Intl.DateTimeFormat("pt-BR", {
  hour: "2-digit",
  minute: "2-digit",
});

function formatMinuteLabel(iso: string): string {
  return timeFormatter.format(new Date(iso));
}

function formatMs(ms: number): string {
  if (ms < 1) return "<1ms";
  if (ms < 1000) return `${ms.toFixed(0)}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(2)}s`;
  return `${Math.floor(ms / 60_000)}m ${Math.floor((ms % 60_000) / 1000)}s`;
}

export function PerformanceView({ workflowId, active, onShowExecutions }: PerformanceViewProps) {
  const queryClient = useQueryClient();
  const [runsWindow, setRunsWindow] = useState(50);

  const throughputQuery = useQuery({
    queryKey: queryKeys.workflowMetrics.throughput(workflowId),
    queryFn: () => metricsApi.throughput(workflowId),
    refetchInterval: active ? REFRESH_MS : false,
    enabled: active,
  });

  const durationsQuery = useQuery({
    queryKey: queryKeys.workflowMetrics.nodeDurations(workflowId, runsWindow),
    queryFn: () => metricsApi.nodeDurations(workflowId, runsWindow),
    refetchInterval: active ? REFRESH_MS * 4 : false,
    enabled: active,
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.workflowMetrics.all });
  };

  const data = throughputQuery.data;
  const durations = durationsQuery.data ?? [];

  return (
    <div className="flex h-full w-full flex-col overflow-y-auto bg-background">
      <header className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-border bg-card/80 px-6 py-3 backdrop-blur">
        <div className="flex items-center gap-2">
          <Activity className="size-4 text-foreground/70" />
          <h2 className="font-heading text-sm font-medium">Performance</h2>
          <span className="text-xs text-muted-foreground">
            Janela de {data?.windowMinutes ?? 15} minutos
          </span>
        </div>
        <Button
          size="icon-sm"
          variant="ghost"
          onClick={refresh}
          disabled={throughputQuery.isFetching}
          aria-label="Recarregar"
          title="Recarregar"
        >
          <RefreshCw
            className={cn("size-3.5", throughputQuery.isFetching && "animate-spin")}
          />
        </Button>
      </header>

      <div className="mx-auto w-full max-w-6xl space-y-4 px-6 py-5">
        {/* KPI cards */}
        <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <KpiCard
            icon={Gauge}
            label="Runs por segundo"
            value={data ? data.runsPerSecond.toFixed(2) : "—"}
            hint={data ? `${data.finishedRuns} concluídos na janela` : undefined}
          />
          <KpiCard
            icon={Cpu}
            label="Worker concurrency"
            value={data ? String(data.workerConcurrency) : "—"}
            hint="Jobs paralelos por worker"
          />
          <KpiCard
            icon={Layers}
            label="Fila ativa"
            value={data ? String(data.queue.active + data.queue.waiting) : "—"}
            hint={
              data
                ? `${data.queue.active} executando · ${data.queue.waiting} aguardando`
                : undefined
            }
          />
          <KpiCard
            icon={AlertTriangle}
            label="Falhas (15min)"
            value={data ? String(data.queue.failed) : "—"}
            tone={data && data.queue.failed > 0 ? "warn" : "default"}
          />
        </section>

        {/* Throughput chart */}
        <Panel
          title="Runs concluídos por minuto"
          subtitle="Eventos workflow.finished agregados por minuto"
        >
          <div className="h-64">
            {throughputQuery.isPending ? (
              <CenteredSpinner />
            ) : data && data.series.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.series}>
                  <defs>
                    <linearGradient id="runsFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="currentColor" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="currentColor" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="currentColor" opacity={0.1} />
                  <XAxis
                    dataKey="minute"
                    tickFormatter={formatMinuteLabel}
                    fontSize={11}
                    stroke="currentColor"
                    opacity={0.6}
                  />
                  <YAxis allowDecimals={false} fontSize={11} stroke="currentColor" opacity={0.6} />
                  <RechartsTooltip
                    labelFormatter={(v) => (typeof v === "string" ? formatMinuteLabel(v) : "")}
                    contentStyle={{
                      background: "var(--background)",
                      border: "1px solid var(--border)",
                      borderRadius: 6,
                      fontSize: 12,
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="runs"
                    stroke="currentColor"
                    fill="url(#runsFill)"
                    className="text-sky-500"
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <EmptyPanel message="Sem execuções nos últimos 15 minutos." />
            )}
          </div>
        </Panel>

        {/* Queue + load test side by side */}
        <div className="grid gap-3 lg:grid-cols-2">
          <Panel title="Fila BullMQ" subtitle="Estado atual dos jobs">
            <div className="h-56">
              {data ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={[
                      { name: "waiting", value: data.queue.waiting },
                      { name: "prioritized", value: data.queue.prioritized },
                      { name: "active", value: data.queue.active },
                      { name: "delayed", value: data.queue.delayed },
                      { name: "completed", value: data.queue.completed },
                      { name: "failed", value: data.queue.failed },
                    ]}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="currentColor" opacity={0.1} />
                    <XAxis dataKey="name" fontSize={11} stroke="currentColor" opacity={0.6} />
                    <YAxis allowDecimals={false} fontSize={11} stroke="currentColor" opacity={0.6} />
                    <RechartsTooltip
                      contentStyle={{
                        background: "var(--background)",
                        border: "1px solid var(--border)",
                        borderRadius: 6,
                        fontSize: 12,
                      }}
                    />
                    <Bar dataKey="value" fill="currentColor" className="text-violet-500" />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <CenteredSpinner />
              )}
            </div>
          </Panel>

          <LoadTestPanel
            workflowId={workflowId}
            onCompleted={refresh}
            onShowExecutions={onShowExecutions}
          />
        </div>

        {/* Duração por nó */}
        <Panel
          title="Duração por nó"
          subtitle={`Média e p95 dos últimos ${runsWindow} runs · ordem por mais lento`}
          right={
            <div className="flex items-center gap-2 text-xs">
              <label className="text-muted-foreground" htmlFor="runs-window">
                Janela
              </label>
              <select
                id="runs-window"
                className="rounded-md border border-border bg-background px-2 py-1 text-xs"
                value={runsWindow}
                onChange={(e) => setRunsWindow(Number(e.target.value))}
              >
                <option value={20}>20 runs</option>
                <option value={50}>50 runs</option>
                <option value={100}>100 runs</option>
                <option value={200}>200 runs</option>
              </select>
            </div>
          }
        >
          {durationsQuery.isPending ? (
            <CenteredSpinner />
          ) : durations.length === 0 ? (
            <EmptyPanel message="Sem dados de duração — rode o workflow algumas vezes." />
          ) : (
            <NodeDurationsTable rows={durations} />
          )}
        </Panel>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Subcomponents                                                              */
/* -------------------------------------------------------------------------- */

function KpiCard({
  icon: Icon,
  label,
  value,
  hint,
  tone = "default",
}: {
  icon: typeof Activity;
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "warn";
}) {
  return (
    <div
      className={cn(
        "rounded-lg border border-border bg-card px-4 py-3",
        tone === "warn" && "border-amber-500/40 bg-amber-500/5",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        <Icon className={cn("size-4", tone === "warn" ? "text-amber-600" : "text-muted-foreground")} />
      </div>
      <div className="mt-1 font-heading text-2xl font-semibold tabular-nums">{value}</div>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function Panel({
  title,
  subtitle,
  right,
  children,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-border bg-card">
      <header className="flex items-start justify-between gap-3 border-b border-border px-4 py-2.5">
        <div>
          <h3 className="text-sm font-medium">{title}</h3>
          {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
        </div>
        {right}
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

function CenteredSpinner() {
  return (
    <div className="grid h-full place-items-center text-muted-foreground">
      <Loader2 className="size-4 animate-spin" />
    </div>
  );
}

function EmptyPanel({ message }: { message: string }) {
  return (
    <div className="grid h-full place-items-center px-4 text-center text-xs text-muted-foreground">
      {message}
    </div>
  );
}

function NodeDurationsTable({
  rows,
}: {
  rows: metricsApi.NodeDuration[];
}) {
  const maxAvg = Math.max(...rows.map((r) => r.avgMs), 1);
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead className="text-left text-muted-foreground">
          <tr className="border-b border-border">
            <th className="py-2 pr-3 font-medium">Nó</th>
            <th className="py-2 pr-3 font-medium">Tipo</th>
            <th className="py-2 pr-3 text-right font-medium">Exec.</th>
            <th className="py-2 pr-3 text-right font-medium">Média</th>
            <th className="py-2 pr-3 text-right font-medium">p95</th>
            <th className="py-2 pr-3 text-right font-medium">Máx</th>
            <th className="py-2 pr-3 text-right font-medium">Falhas</th>
            <th className="py-2 pr-0 font-medium">Carga</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const pct = (row.avgMs / maxAvg) * 100;
            return (
              <tr key={row.nodeId} className="border-b border-border/50 last:border-0">
                <td className="py-2 pr-3 font-mono">{row.nodeId}</td>
                <td className="py-2 pr-3 text-muted-foreground">{row.nodeType}</td>
                <td className="py-2 pr-3 text-right tabular-nums">{row.executions}</td>
                <td className="py-2 pr-3 text-right tabular-nums">{formatMs(row.avgMs)}</td>
                <td className="py-2 pr-3 text-right tabular-nums">{formatMs(row.p95Ms)}</td>
                <td className="py-2 pr-3 text-right tabular-nums">{formatMs(row.maxMs)}</td>
                <td
                  className={cn(
                    "py-2 pr-3 text-right tabular-nums",
                    row.failures > 0 && "font-medium text-rose-600",
                  )}
                >
                  {row.failures}
                </td>
                <td className="py-2 pr-0">
                  <div className="h-1.5 w-32 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full bg-sky-500"
                      style={{ width: `${Math.max(pct, 4)}%` }}
                    />
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Load test panel                                                            */
/* -------------------------------------------------------------------------- */

function LoadTestPanel({
  workflowId,
  onCompleted,
  onShowExecutions,
}: {
  workflowId: string;
  onCompleted: () => void;
  onShowExecutions?: (focusRunId?: string) => void;
}) {
  const [count, setCount] = useState(20);
  const [lastResult, setLastResult] = useState<LoadTestResponse | null>(null);

  const mutation = useMutation({
    mutationFn: () => metricsApi.loadTest(workflowId, { count }),
    onSuccess: (res) => {
      setLastResult(res);
      onCompleted();
    },
  });

  const rate =
    lastResult && lastResult.enqueueMs > 0
      ? ((lastResult.enqueued / lastResult.enqueueMs) * 1000).toFixed(1)
      : null;

  return (
    <Panel
      title="Teste de throughput"
      subtitle="Enfileira N execuções com payload sintético na versão publicada"
    >
      <div className="space-y-3">
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <label className="mb-1 block text-xs text-muted-foreground" htmlFor="lt-count">
              Quantidade de runs
            </label>
            <Input
              id="lt-count"
              type="number"
              min={1}
              max={500}
              value={count}
              onChange={(e) => setCount(Math.max(1, Math.min(500, Number(e.target.value) || 1)))}
              className="h-9"
            />
          </div>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            {mutation.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Rocket className="size-4" />
            )}
            Disparar
          </Button>
        </div>

        {mutation.isError && (
          <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            Falhou ao enfileirar runs.
          </p>
        )}

        {lastResult && (
          <>
            <div className="grid grid-cols-2 gap-2 rounded-md border border-border bg-muted/30 p-3 text-xs sm:grid-cols-4">
              <Stat icon={Zap} label="Enfileirados" value={String(lastResult.enqueued)} />
              <Stat
                icon={AlertTriangle}
                label="Falhas"
                value={String(lastResult.failed)}
                tone={lastResult.failed > 0 ? "warn" : "default"}
              />
              <Stat icon={TimerReset} label="Tempo enqueue" value={`${lastResult.enqueueMs}ms`} />
              <Stat icon={Gauge} label="Taxa enqueue" value={rate ? `${rate}/s` : "—"} />
            </div>
            {onShowExecutions && lastResult.enqueued > 0 && (
              <Button
                size="sm"
                variant="outline"
                className="w-full"
                onClick={() => onShowExecutions(lastResult.runs[0]?.runId)}
              >
                <History className="size-4" />
                Ver execuções do teste
              </Button>
            )}
          </>
        )}

        {lastResult && lastResult.errors.length > 0 && (
          <details className="rounded-md border border-border bg-background p-2 text-xs">
            <summary className="cursor-pointer text-muted-foreground">
              Ver erros ({lastResult.errors.length})
            </summary>
            <ul className="mt-2 space-y-1 font-mono">
              {lastResult.errors.slice(0, 10).map((e) => (
                <li key={e.index} className="text-destructive/80">
                  #{e.index}: {e.error}
                </li>
              ))}
              {lastResult.errors.length > 10 && (
                <li className="text-muted-foreground">… +{lastResult.errors.length - 10} mais</li>
              )}
            </ul>
          </details>
        )}
      </div>
    </Panel>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  tone = "default",
}: {
  icon: typeof Activity;
  label: string;
  value: string;
  tone?: "default" | "warn";
}) {
  return (
    <div className="space-y-0.5">
      <div className="flex items-center gap-1 text-muted-foreground">
        <Icon className="size-3" />
        <span>{label}</span>
      </div>
      <div
        className={cn(
          "font-mono text-sm tabular-nums",
          tone === "warn" && "font-medium text-amber-600",
        )}
      >
        {value}
      </div>
    </div>
  );
}
