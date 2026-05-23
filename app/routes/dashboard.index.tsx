import { Link } from "react-router";
import { ArrowUpRight, CheckCircle2, Clock, Plus, PlayCircle, Workflow } from "lucide-react";

import type { Route } from "./+types/dashboard.index";
import type { DashboardHandle } from "./dashboard";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Dashboard — Workflows" },
    { name: "description", content: "Visão geral dos seus workflows" },
  ];
}

export const handle: DashboardHandle = {
  title: "Dashboard",
  breadcrumb: "Workflows",
};

type Stat = {
  label: string;
  value: string;
  hint: string;
  icon: React.ComponentType<{ className?: string }>;
};

const stats: Stat[] = [
  { label: "Workflows ativos", value: "12", hint: "+2 esta semana", icon: Workflow },
  { label: "Execuções hoje", value: "284", hint: "+18% vs ontem", icon: PlayCircle },
  { label: "Taxa de sucesso", value: "98,4%", hint: "Últimos 7 dias", icon: CheckCircle2 },
  { label: "Tempo médio", value: "1,2s", hint: "Por execução", icon: Clock },
];

const recent = [
  { name: "Onboarding de lead", status: "Ativo", runs: 142 },
  { name: "Notificar churn risk", status: "Ativo", runs: 87 },
  { name: "Sincronizar CRM", status: "Pausado", runs: 23 },
  { name: "Resumo semanal", status: "Ativo", runs: 7 },
];

export default function DashboardRoute() {
  return (
    <>
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Boa noite, Lai</h1>
          <p className="text-sm text-muted-foreground">Aqui está o resumo da sua operação hoje.</p>
        </div>
        <Button asChild>
          <Link to="/flow">
            <Plus className="size-4" /> Novo workflow
          </Link>
        </Button>
      </div>

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

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle>Workflows recentes</CardTitle>
              <CardDescription>Atividade das últimas 24 horas.</CardDescription>
            </div>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/flow">
                Ver todos <ArrowUpRight className="size-4" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            <ul className="divide-y">
              {recent.map((w) => (
                <li key={w.name} className="flex items-center justify-between py-3 text-sm">
                  <div className="flex items-center gap-3">
                    <div className="grid size-8 place-items-center rounded-md border bg-muted">
                      <Workflow className="size-4 text-muted-foreground" />
                    </div>
                    <div>
                      <div className="font-medium">{w.name}</div>
                      <div className="text-xs text-muted-foreground">{w.runs} execuções</div>
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

        <Card>
          <CardHeader>
            <CardTitle>Começar rápido</CardTitle>
            <CardDescription>Templates para acelerar a criação.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {[
              "Notificação por e-mail",
              "Sincronizar com CRM",
              "Enriquecer lead",
              "Webhook → Slack",
            ].map((t) => (
              <Button key={t} variant="outline" className="w-full justify-between">
                {t} <ArrowUpRight className="size-4" />
              </Button>
            ))}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
