import { Link } from "react-router";
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
  ArrowUpRight,
  CheckCircle2,
  Clock,
  Plus,
  PlayCircle,
  Workflow,
} from "lucide-react";

import type { Route } from "./+types/dashboard.index";
import type { DashboardHandle } from "./dashboard";
import { Button } from "~/components/ui/button";
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
import { StatusBars, type StatusBucket } from "~/components/status-bars";

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
/* Dados mock                                                                  */
/* -------------------------------------------------------------------------- */
// TODO: trocar por agregações reais quando o backend expor (ex.: /metrics).

const stats = [
  { label: "Workflows ativos", value: "12", hint: "+2 esta semana", icon: Workflow },
  { label: "Execuções hoje", value: "284", hint: "+18% vs ontem", icon: PlayCircle },
  { label: "Taxa de sucesso", value: "98,4%", hint: "Últimos 7 dias", icon: CheckCircle2 },
  { label: "Tempo médio", value: "1,2s", hint: "Por execução", icon: Clock },
] as const;

// Execuções por hora nas últimas 24h
const executionsByHour = Array.from({ length: 24 }, (_, h) => {
  // Curva sintética: pico de manhã e à tarde
  const base = 10 + 25 * Math.sin((h / 24) * Math.PI * 2 - Math.PI / 2);
  const noise = Math.round((Math.sin(h * 1.7) + 1) * 5);
  return {
    hour: `${String(h).padStart(2, "0")}h`,
    success: Math.max(0, Math.round(base + noise)),
    failed: Math.max(0, Math.round(noise / 3 + (h % 5 === 0 ? 4 : 0))),
  };
});

// Tempo médio de execução (últimas 12 janelas de 5 min)
const latencySeries = Array.from({ length: 24 }, (_, i) => ({
  bucket: `${i * 5}m`,
  avg: 0.8 + Math.sin(i / 3) * 0.4 + (i > 18 ? 0.6 : 0),
}));

// Distribuição de status agregada
const statusDistribution = [
  { name: "Sucesso", value: 248, fill: "var(--color-success)" },
  { name: "Falha", value: 9, fill: "var(--color-failed)" },
  { name: "Cancelado", value: 4, fill: "var(--color-cancelled)" },
  { name: "Em fila", value: 23, fill: "var(--color-queued)" },
];

// Saúde por workflow (cada workflow tem N buckets — uptime por intervalo)
function generateBuckets(count: number, failRate: number): StatusBucket[] {
  return Array.from({ length: count }, () => {
    const r = Math.random();
    if (r < failRate) return "fail";
    if (r < failRate + 0.05) return "warn";
    if (r < failRate + 0.07) return "empty";
    return "ok";
  });
}

const workflowHealth = [
  { name: "Onboarding de lead", uptime: "99,8%", buckets: generateBuckets(60, 0.01) },
  { name: "Notificar churn risk", uptime: "98,2%", buckets: generateBuckets(60, 0.04) },
  { name: "Sincronizar CRM", uptime: "94,5%", buckets: generateBuckets(60, 0.09) },
  { name: "Resumo semanal", uptime: "100%", buckets: generateBuckets(60, 0) },
  { name: "Enriquecer lead", uptime: "97,1%", buckets: generateBuckets(60, 0.05) },
];

const recent = [
  { name: "Onboarding de lead", status: "Ativo", runs: 142 },
  { name: "Notificar churn risk", status: "Ativo", runs: 87 },
  { name: "Sincronizar CRM", status: "Pausado", runs: 23 },
  { name: "Resumo semanal", status: "Ativo", runs: 7 },
];

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
} satisfies ChartConfig;

/* -------------------------------------------------------------------------- */
/* Página                                                                      */
/* -------------------------------------------------------------------------- */

export default function DashboardRoute() {
  return (
    <>
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Boa noite, Lai</h1>
          <p className="text-sm text-muted-foreground">
            Aqui está o resumo da sua operação hoje.
          </p>
        </div>
        <Button asChild>
          <Link to="/flow">
            <Plus className="size-4" /> Novo workflow
          </Link>
        </Button>
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

      {/* Gráfico de execuções + distribuição */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Execuções nas últimas 24 horas</CardTitle>
            <CardDescription>Sucesso vs falha por hora.</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={executionsConfig} className="h-[240px] w-full">
              <BarChart data={executionsByHour} barCategoryGap={4}>
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
                <Bar dataKey="success" stackId="a" fill="var(--color-success)" radius={[0, 0, 0, 0]} />
                <Bar dataKey="failed" stackId="a" fill="var(--color-failed)" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Distribuição de status</CardTitle>
            <CardDescription>Últimas 24h.</CardDescription>
          </CardHeader>
          <CardContent className="flex items-center justify-center">
            <ChartContainer config={statusConfig} className="h-[240px] w-full">
              <PieChart>
                <ChartTooltip content={<ChartTooltipContent hideLabel />} />
                <Pie
                  data={statusDistribution}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={2}
                >
                  {statusDistribution.map((entry) => (
                    <Cell key={entry.name} fill={entry.fill} />
                  ))}
                </Pie>
              </PieChart>
            </ChartContainer>
          </CardContent>
        </Card>
      </div>

      {/* Saúde dos workflows (status bars) */}
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>Saúde dos workflows</CardTitle>
            <CardDescription>
              Últimos 60 minutos — cada barra representa 1 minuto.
            </CardDescription>
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <Legend color="bg-emerald-500" label="Operacional" />
            <Legend color="bg-amber-400" label="Degradado" />
            <Legend color="bg-rose-500" label="Falha" />
            <Legend color="bg-muted" label="Sem dados" />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {workflowHealth.map((w) => (
            <div key={w.name} className="space-y-1.5">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">{w.name}</span>
                <span className="text-muted-foreground tabular-nums">{w.uptime}</span>
              </div>
              <StatusBars buckets={w.buckets} />
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Latência + workflows recentes */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Tempo médio de execução</CardTitle>
            <CardDescription>Últimas 2 horas.</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={latencyConfig} className="h-[200px] w-full">
              <AreaChart data={latencySeries}>
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
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle>Workflows recentes</CardTitle>
              <CardDescription>Últimas 24h.</CardDescription>
            </div>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/dashboard/workflows">
                Ver todos <ArrowUpRight className="size-4" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            <ul className="divide-y">
              {recent.map((w) => (
                <li
                  key={w.name}
                  className="flex items-center justify-between py-3 text-sm"
                >
                  <div className="flex items-center gap-3">
                    <div className="grid size-8 place-items-center rounded-md border bg-muted">
                      <Workflow className="size-4 text-muted-foreground" />
                    </div>
                    <div>
                      <div className="font-medium">{w.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {w.runs} execuções
                      </div>
                    </div>
                  </div>
                  <span
                    className={
                      "rounded-md border px-2 py-0.5 text-xs " +
                      (w.status === "Ativo"
                        ? "border-transparent bg-primary/10 text-foreground"
                        : "text-muted-foreground")
                    }
                  >
                    {w.status}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className={`size-2 rounded-sm ${color}`} />
      <span>{label}</span>
    </div>
  );
}
