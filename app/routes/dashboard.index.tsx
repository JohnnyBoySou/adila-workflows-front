import { useMemo } from "react";
import { useSession } from "~/lib/auth-client";
import { Link } from "react-router";
import { useQueries, useQuery } from "@tanstack/react-query";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from "recharts";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  PlayCircle,
  Workflow,
} from "lucide-react";

import type { Route } from "./+types/dashboard.index";
import type { DashboardHandle } from "./dashboard";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "~/components/ui/chart";
import { Skeleton } from "~/components/ui/skeleton";
import { StatusBars, type StatusBucket } from "~/components/status-bars";
import { queryKeys } from "~/lib/query-keys";
import * as workflowsApi from "~/services/workflows";
import * as runsApi from "~/services/runs";
import type { RunStatus, WorkflowRun } from "~/services/runs";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Dashboard — Workflows" },
    { name: "description", content: "Visão geral dos seus workflows" },
  ];
}

export const handle: DashboardHandle = {
  title: "Dashboard",
};

/* -------------------------------------------------------------------------- */
/* Parâmetros                                                                  */
/* -------------------------------------------------------------------------- */

const HEALTH_BUCKETS = 120; // ~ últimas 2h em janelas de 1 min
const HEALTH_BUCKET_MS = 60_000;
const EXECUTIONS_HOURS = 24;
const TOP_WORKFLOWS = 8; // quantos workflows aparecem na seção de saúde

/* -------------------------------------------------------------------------- */
/* Configs de chart                                                            */
/* -------------------------------------------------------------------------- */

const executionsConfig = {
  success: { label: "Sucesso", color: "var(--chart-2)" },
  failed: { label: "Falha", color: "var(--chart-3)" },
} satisfies ChartConfig;

const latencyConfig = {
  avg: { label: "Tempo médio (s)", color: "var(--chart-1)" },
} satisfies ChartConfig;

const statusConfig = {
  success: { label: "Sucesso", color: "var(--chart-2)" },
  failed: { label: "Falha", color: "var(--chart-3)" },
  cancelled: { label: "Cancelado", color: "var(--chart-4)" },
  queued: { label: "Em fila", color: "var(--chart-1)" },
  running: { label: "Em execução", color: "var(--chart-1)" },
} satisfies ChartConfig;

/* -------------------------------------------------------------------------- */
/* Helpers de agregação                                                        */
/* -------------------------------------------------------------------------- */

function timestampOf(run: WorkflowRun): number {
  const ref = run.finishedAt ?? run.startedAt ?? run.createdAt;
  return ref ? new Date(ref).getTime() : 0;
}

function bucketsFromRuns(runs: WorkflowRun[], count: number, bucketMs: number): StatusBucket[] {
  const now = Date.now();
  const buckets: StatusBucket[] = Array.from({ length: count }, () => "empty");

  for (const run of runs) {
    const ts = timestampOf(run);
    if (!ts) continue;
    const ageMs = now - ts;
    const idx = count - 1 - Math.floor(ageMs / bucketMs);
    if (idx < 0 || idx >= count) continue;

    // Resolve conflito quando vários runs caem no mesmo bucket: pior status ganha.
    const current = buckets[idx];
    const next = severityOf(run.status);
    if (severityRank(next) > severityRank(current)) buckets[idx] = next;
  }
  return buckets;
}

function severityOf(status: RunStatus): StatusBucket {
  if (status === "failed") return "fail";
  if (status === "cancelled") return "warn";
  if (status === "success") return "ok";
  // running / queued ainda não terminaram — tratamos como "ok" (operacional)
  return "ok";
}

function severityRank(b: StatusBucket): number {
  switch (b) {
    case "fail":
      return 3;
    case "warn":
      return 2;
    case "ok":
      return 1;
    case "empty":
      return 0;
  }
}

function uptimeOf(buckets: StatusBucket[]): string {
  const known = buckets.filter((b) => b !== "empty");
  if (known.length === 0) return "—";
  const okish = known.filter((b) => b === "ok").length;
  const pct = (okish / known.length) * 100;
  return `${pct.toFixed(pct === 100 ? 0 : 1)}%`;
}

function executionsByHour(allRuns: WorkflowRun[]) {
  const now = new Date();
  const startMs = now.getTime() - EXECUTIONS_HOURS * 3600_000;

  const slots = Array.from({ length: EXECUTIONS_HOURS }, (_, i) => {
    const d = new Date(startMs + i * 3600_000);
    return {
      hour: `${String(d.getHours()).padStart(2, "0")}h`,
      success: 0,
      failed: 0,
    };
  });

  for (const run of allRuns) {
    const ts = timestampOf(run);
    if (!ts || ts < startMs) continue;
    const idx = Math.floor((ts - startMs) / 3600_000);
    if (idx < 0 || idx >= slots.length) continue;
    if (run.status === "failed") slots[idx].failed += 1;
    else if (run.status === "success") slots[idx].success += 1;
  }
  return slots;
}

function statusDistribution(allRuns: WorkflowRun[]) {
  const counts: Record<string, number> = {};
  for (const r of allRuns) counts[r.status] = (counts[r.status] ?? 0) + 1;

  const order: { key: RunStatus; label: string; fill: string }[] = [
    { key: "success", label: "Sucesso", fill: "var(--color-success)" },
    { key: "failed", label: "Falha", fill: "var(--color-failed)" },
    { key: "cancelled", label: "Cancelado", fill: "var(--color-cancelled)" },
    { key: "queued", label: "Em fila", fill: "var(--color-queued)" },
    { key: "running", label: "Em execução", fill: "var(--color-running)" },
  ];

  return order
    .map((o) => ({ name: o.label, value: counts[o.key] ?? 0, fill: o.fill }))
    .filter((d) => d.value > 0);
}

function latencySeries(allRuns: WorkflowRun[]) {
  // Últimas 24 janelas de 5 min (~2h) — média de duração de runs finalizados.
  const slots = 24;
  const bucketMs = 5 * 60_000;
  const now = Date.now();
  const startMs = now - slots * bucketMs;

  type Acc = { sum: number; count: number };
  const acc: Acc[] = Array.from({ length: slots }, () => ({ sum: 0, count: 0 }));

  for (const r of allRuns) {
    if (!r.startedAt || !r.finishedAt) continue;
    const start = new Date(r.startedAt).getTime();
    const end = new Date(r.finishedAt).getTime();
    if (end < startMs) continue;
    const idx = Math.floor((end - startMs) / bucketMs);
    if (idx < 0 || idx >= slots) continue;
    acc[idx].sum += (end - start) / 1000;
    acc[idx].count += 1;
  }

  return acc.map((a, i) => ({
    bucket: `${i * 5}m`,
    avg: a.count > 0 ? Number((a.sum / a.count).toFixed(2)) : 0,
  }));
}

function avgDurationSeconds(allRuns: WorkflowRun[]): number | null {
  const finished = allRuns.filter((r) => r.startedAt && r.finishedAt);
  if (finished.length === 0) return null;
  const sum = finished.reduce((acc, r) => {
    return acc + (new Date(r.finishedAt!).getTime() - new Date(r.startedAt!).getTime()) / 1000;
  }, 0);
  return sum / finished.length;
}

function successRate(allRuns: WorkflowRun[]): number | null {
  const terminal = allRuns.filter((r) => r.status === "success" || r.status === "failed");
  if (terminal.length === 0) return null;
  const ok = terminal.filter((r) => r.status === "success").length;
  return (ok / terminal.length) * 100;
}

function executionsToday(allRuns: WorkflowRun[]): number {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const startMs = start.getTime();
  return allRuns.filter((r) => timestampOf(r) >= startMs).length;
}

/* -------------------------------------------------------------------------- */
/* Página                                                                      */
/* -------------------------------------------------------------------------- */

function greeting(name: string | undefined | null): string {
  const hour = new Date().getHours();
  const salutation =
    hour >= 5 && hour < 12 ? "Bom dia" :
    hour >= 12 && hour < 18 ? "Boa tarde" :
    "Boa noite";
  const first = name?.trim().split(/\s+/)[0] ?? "";
  return first ? `${salutation}, ${first}` : salutation;
}

export default function DashboardRoute() {
  const { data: session } = useSession();
  const workflowsQuery = useQuery({
    queryKey: queryKeys.workflows.list(null, 0),
    queryFn: () => workflowsApi.list({ limit: 100, offset: 0 }),
  });

  const workflows = workflowsQuery.data?.items ?? [];
  const activeWorkflows = workflows.filter((w) => w.status === "active");
  const topWorkflows = activeWorkflows.slice(0, TOP_WORKFLOWS);

  // Uma query de runs por workflow do "top". useQueries permite paralelizar.
  const runsQueries = useQueries({
    queries: topWorkflows.map((w) => ({
      queryKey: queryKeys.runs.list(w.id),
      queryFn: () => runsApi.list(w.id, { limit: 100 }),
      enabled: !!w.id,
    })),
  });

  const runsByWorkflow = useMemo(() => {
    const map = new Map<string, WorkflowRun[]>();
    topWorkflows.forEach((w, i) => {
      map.set(w.id, runsQueries[i]?.data ?? []);
    });
    return map;
  }, [topWorkflows, runsQueries]);

  const allRuns = useMemo(() => {
    return Array.from(runsByWorkflow.values()).flat();
  }, [runsByWorkflow]);

  const isLoading = workflowsQuery.isPending || runsQueries.some((q) => q.isPending);

  // KPIs derivados
  const activeCount = workflows.filter((w) => w.status === "active").length;
  const execsToday = executionsToday(allRuns);
  const sucRate = successRate(allRuns);
  const avgDur = avgDurationSeconds(allRuns);

  const stats = [
    {
      label: "Workflows ativos",
      value: workflowsQuery.isPending ? "…" : String(activeCount),
      hint: `${workflows.length} no total`,
      icon: Workflow,
    },
    {
      label: "Execuções hoje",
      value: isLoading ? "…" : String(execsToday),
      hint: `${allRuns.length} nos últimos`,
      icon: PlayCircle,
    },
    {
      label: "Taxa de sucesso",
      value: isLoading ? "…" : sucRate === null ? "—" : `${sucRate.toFixed(1)}%`,
      hint: "Sobre runs finalizados",
      icon: CheckCircle2,
    },
    {
      label: "Tempo médio",
      value: isLoading ? "…" : avgDur === null ? "—" : `${avgDur.toFixed(2)}s`,
      hint: "Por execução",
      icon: Clock,
    },
  ];

  const executionsData = useMemo(() => executionsByHour(allRuns), [allRuns]);
  const statusData = useMemo(() => statusDistribution(allRuns), [allRuns]);
  const latencyData = useMemo(() => latencySeries(allRuns), [allRuns]);

  const workflowHealth = topWorkflows.map((w) => {
    const buckets = bucketsFromRuns(
      runsByWorkflow.get(w.id) ?? [],
      HEALTH_BUCKETS,
      HEALTH_BUCKET_MS,
    );
    return { workflow: w, buckets, uptime: uptimeOf(buckets) };
  });

  // Últimas falhas — une todos os runs, filtra failed/cancelled, pega os 6 mais recentes.
  const recentFailures = useMemo(() => {
    const workflowById = new Map(workflows.map((w) => [w.id, w]));
    return allRuns
      .filter((r) => r.status === "failed" || r.status === "cancelled")
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 6)
      .map((r) => ({ run: r, workflow: workflowById.get(r.workflowId) }));
  }, [allRuns, workflows]);

  return (
    <>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{greeting(session?.user?.name)}</h1>
        <p className="text-sm text-muted-foreground">
          Aqui está o resumo da sua operação hoje.
        </p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label}>
            <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
              <CardDescription>{s.label}</CardDescription>
              <s.icon className="size-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold">{s.value}</div>
              <p className="text-xs text-muted-foreground">{s.hint}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Execuções 24h + distribuição */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Execuções nas últimas 24 horas</CardTitle>
            <CardDescription>Sucesso vs falha por hora.</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-[240px] w-full" />
            ) : (
              <ChartContainer config={executionsConfig} className="h-[240px] w-full">
                <BarChart data={executionsData} barCategoryGap={4}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" />
                  <XAxis
                    dataKey="hour"
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                    interval={2}
                  />
                  <YAxis tickLine={false} axisLine={false} tickMargin={8} width={28} />
                  <ChartTooltip content={<ChartTooltipContent indicator="dot" />} />
                  <Bar dataKey="success" stackId="a" fill="var(--color-success)" />
                  <Bar
                    dataKey="failed"
                    stackId="a"
                    fill="var(--color-failed)"
                    radius={[3, 3, 0, 0]}
                  />
                </BarChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Distribuição de status</CardTitle>
            <CardDescription>Sobre os runs carregados.</CardDescription>
          </CardHeader>
          <CardContent className="flex items-center justify-center">
            {isLoading ? (
              <Skeleton className="size-[200px] rounded-full" />
            ) : statusData.length === 0 ? (
              <EmptyHint label="Nenhuma execução ainda." />
            ) : (
              <ChartContainer config={statusConfig} className="h-[240px] w-full">
                <PieChart>
                  <ChartTooltip content={<ChartTooltipContent hideLabel />} />
                  <Pie
                    data={statusData}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={2}
                  >
                    {statusData.map((entry) => (
                      <Cell key={entry.name} fill={entry.fill} />
                    ))}
                  </Pie>
                </PieChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Saúde dos workflows — só exibe se houver ao menos 1 workflow ativo */}
      {(workflowsQuery.isPending || workflowHealth.length > 0) && (
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle>Saúde dos workflows</CardTitle>
              <CardDescription>
                Últimos {HEALTH_BUCKETS} minutos — cada barra representa 1 minuto.
              </CardDescription>
            </div>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <Legend color="bg-emerald-500" label="Operacional" />
              <Legend color="bg-amber-400" label="Degradado" />
              <Legend color="bg-rose-500" label="Falha" />
              <Legend color="bg-muted" label="Sem dados" />
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {workflowsQuery.isPending ? (
              <HealthSkeleton />
            ) : (
              workflowHealth.map((h) => (
                <div key={h.workflow.id} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <Link
                      to={`/flow/${h.workflow.id}`}
                      className="truncate font-medium hover:underline"
                    >
                      {h.workflow.name}
                    </Link>
                    <span className="text-muted-foreground tabular-nums">{h.uptime}</span>
                  </div>
                  <StatusBars buckets={h.buckets} />
                </div>
              ))
            )}
          </CardContent>
        </Card>
      )}

      {/* Latência + recentes */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Tempo médio de execução</CardTitle>
            <CardDescription>Últimas 2 horas em janelas de 5 min.</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-[200px] w-full" />
            ) : (
              <ChartContainer config={latencyConfig} className="h-[200px] w-full">
                <AreaChart data={latencyData}>
                  <defs>
                    <linearGradient id="latencyFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--color-avg)" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="var(--color-avg)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" />
                  <XAxis
                    dataKey="bucket"
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                    interval={3}
                  />
                  <YAxis tickLine={false} axisLine={false} tickMargin={8} width={28} />
                  <ChartTooltip content={<ChartTooltipContent indicator="line" />} />
                  <Area
                    type="monotone"
                    dataKey="avg"
                    stroke="var(--color-avg)"
                    fill="url(#latencyFill)"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle>Falhas recentes</CardTitle>
              <CardDescription>Execuções com erro ou canceladas.</CardDescription>
            </div>
            {recentFailures.length > 0 && (
              <AlertTriangle className="size-4 text-amber-500" />
            )}
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <RecentSkeleton />
            ) : recentFailures.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-6 text-center text-sm text-muted-foreground">
                <CheckCircle2 className="size-7 text-emerald-500" />
                Nenhuma falha recente. Tudo operando bem.
              </div>
            ) : (
              <ul className="divide-y">
                {recentFailures.map(({ run, workflow }) => (
                  <li key={run.id} className="flex items-center justify-between gap-2 py-3 text-sm">
                    <Link
                      to={`/flow/${run.workflowId}`}
                      className="flex min-w-0 items-center gap-3 hover:underline"
                    >
                      <div className="grid size-8 shrink-0 place-items-center rounded-md border bg-rose-500/10">
                        <Workflow className="size-4 text-rose-500" />
                      </div>
                      <div className="min-w-0">
                        <div className="truncate font-medium">
                          {workflow?.name ?? "Workflow removido"}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {new Date(run.createdAt).toLocaleString("pt-BR", {
                            dateStyle: "short",
                            timeStyle: "short",
                          })}
                        </div>
                      </div>
                    </Link>
                    <RunStatusBadge status={run.status} />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Subcomponentes                                                              */
/* -------------------------------------------------------------------------- */

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className={`size-2 rounded-sm ${color}`} />
      <span>{label}</span>
    </div>
  );
}

function RunStatusBadge({ status }: { status: RunStatus }) {
  const meta: Record<RunStatus, { label: string; cn: string }> = {
    queued:    { label: "Na fila",    cn: "text-muted-foreground" },
    running:   { label: "Rodando",   cn: "border-transparent bg-sky-500/10 text-sky-600" },
    success:   { label: "Sucesso",   cn: "border-transparent bg-emerald-500/10 text-emerald-600" },
    failed:    { label: "Falhou",    cn: "border-transparent bg-rose-500/10 text-rose-600" },
    cancelled: { label: "Cancelado", cn: "text-muted-foreground" },
  };
  const m = meta[status];
  return <span className={`rounded-md border px-2 py-0.5 text-xs ${m.cn}`}>{m.label}</span>;
}


function HealthSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="space-y-1">
          <div className="flex justify-between">
            <Skeleton className="h-3 w-32" />
            <Skeleton className="h-3 w-10" />
          </div>
          <Skeleton className="h-[18px] w-full" />
        </div>
      ))}
    </div>
  );
}

function RecentSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="size-8 rounded-md" />
          <div className="flex-1 space-y-1">
            <Skeleton className="h-3 w-40" />
            <Skeleton className="h-3 w-20" />
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyHint({ label }: { label: string }) {
  return (
    <p className="py-8 text-center text-sm text-muted-foreground">{label}</p>
  );
}
