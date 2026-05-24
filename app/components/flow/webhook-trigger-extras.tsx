/**
 * Painel extra do node `webhook_trigger`.
 *
 * Quando o trigger ainda não existe, mostra o CTA "Habilitar webhook". Já
 * existindo, abre um painel com abas: Config, Teste, Segurança, Invocações
 * e Saúde. A entidade `triggers` continua sendo a fonte da verdade do
 * token/segredo; os campos declarativos do node guardam preferências.
 */
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  Check,
  Copy,
  Eye,
  EyeOff,
  History,
  Loader2,
  RefreshCw,
  Send,
  Settings,
  Shield,
  Webhook,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Button } from "~/components/ui/button";
import { Badge } from "~/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { Textarea } from "~/components/ui/textarea";
import { KeyValueEditor } from "./node-config/fields";
import { queryKeys } from "~/lib/query-keys";
import { cn } from "~/lib/utils";
import * as triggersApi from "~/services/triggers";
import type {
  Trigger,
  WebhookHealth,
  WebhookInvocation,
  WebhookMethod,
} from "~/services/triggers";
import { TriggerVersionPicker } from "./trigger-version-picker";

type Props = {
  workflowId: string;
  nodeId: string;
  responseMode?: "async" | "sync";
  responseTimeoutMs?: number;
};

const ALL_METHODS: WebhookMethod[] = ["POST", "GET", "PUT", "PATCH", "DELETE"];

export function WebhookTriggerExtras({
  workflowId,
  nodeId,
  responseMode,
  responseTimeoutMs,
}: Props) {
  const queryClient = useQueryClient();

  const triggersQuery = useQuery({
    queryKey: queryKeys.triggers.list(workflowId),
    queryFn: () => triggersApi.list(workflowId, "webhook"),
  });

  const trigger = triggersQuery.data?.find((t) => t.nodeId === nodeId) ?? null;

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: queryKeys.triggers.list(workflowId) });
  }

  const createMutation = useMutation({
    mutationFn: () =>
      triggersApi.create(workflowId, {
        type: "webhook",
        name: `Webhook ${nodeId.slice(0, 6)}`,
        nodeId,
        webhookResponseMode: responseMode ?? "async",
        webhookResponseTimeoutMs: responseTimeoutMs ?? 30_000,
      }),
    onSuccess: invalidate,
  });

  if (triggersQuery.isPending) {
    return (
      <div className="mt-4 flex items-center gap-2 rounded-md border border-dashed border-border px-3 py-3 text-xs text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" /> Verificando webhook…
      </div>
    );
  }

  if (!trigger) {
    return (
      <div className="mt-4 space-y-2 rounded-md border border-dashed border-border bg-muted/20 px-3 py-3">
        <div className="flex items-start gap-2">
          <Webhook className="mt-0.5 size-4 text-muted-foreground" />
          <div className="text-xs text-muted-foreground">
            Webhook ainda não habilitado. Habilitar gera uma URL pública e um token — qualquer
            chamada <code className="rounded bg-muted px-1">POST</code> nessa URL dispara o
            workflow.
          </div>
        </div>
        <div className="flex justify-end">
          <Button
            size="sm"
            onClick={() => createMutation.mutate()}
            disabled={createMutation.isPending}
          >
            {createMutation.isPending && <Loader2 className="size-4 animate-spin" />}
            Habilitar webhook
          </Button>
        </div>
      </div>
    );
  }

  return (
    <TriggerActiveTabbed
      workflowId={workflowId}
      trigger={trigger}
      onChanged={invalidate}
    />
  );
}

/* -------------------------------------------------------------------------- */
/* Painel com abas                                                            */
/* -------------------------------------------------------------------------- */

type TabKey = "config" | "teste" | "seguranca" | "invocacoes" | "saude";

function TriggerActiveTabbed({
  workflowId,
  trigger,
  onChanged,
}: {
  workflowId: string;
  trigger: Trigger;
  onChanged: () => void;
}) {
  const [tab, setTab] = useState<TabKey>("config");
  const url = trigger.webhookToken ? triggersApi.webhookUrl(trigger.webhookToken) : null;

  return (
    <div className="mt-4 space-y-3 rounded-md border border-border bg-muted/20 p-3">
      <HeaderBar trigger={trigger} />

      <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)}>
        <TabsList className="h-8 w-full justify-start">
          <TabsTrigger value="config" className="gap-1 text-[11px]">
            <Settings className="size-3.5" /> Config
          </TabsTrigger>
          <TabsTrigger value="teste" className="gap-1 text-[11px]">
            <Send className="size-3.5" /> Teste
          </TabsTrigger>
          <TabsTrigger value="seguranca" className="gap-1 text-[11px]">
            <Shield className="size-3.5" /> Segurança
          </TabsTrigger>
          <TabsTrigger value="invocacoes" className="gap-1 text-[11px]">
            <History className="size-3.5" /> Invocações
          </TabsTrigger>
          <TabsTrigger value="saude" className="gap-1 text-[11px]">
            <Activity className="size-3.5" /> Saúde
          </TabsTrigger>
        </TabsList>

        <TabsContent value="config" className="mt-3">
          <ConfigTab workflowId={workflowId} trigger={trigger} url={url} onChanged={onChanged} />
        </TabsContent>

        <TabsContent value="teste" className="mt-3">
          {url && trigger.enabled ? (
            <WebhookTester
              url={url}
              mode={trigger.webhookResponseMode ?? "async"}
              allowedMethods={trigger.allowedMethods}
              hmacEnabled={Boolean(trigger.hmacSecret)}
            />
          ) : (
            <EmptyHint>
              Ative o webhook na aba <strong>Config</strong> antes de testar.
            </EmptyHint>
          )}
        </TabsContent>

        <TabsContent value="seguranca" className="mt-3">
          <SecurityTab workflowId={workflowId} trigger={trigger} onChanged={onChanged} />
        </TabsContent>

        <TabsContent value="invocacoes" className="mt-3">
          <InvocationsTab workflowId={workflowId} triggerId={trigger.id} />
        </TabsContent>

        <TabsContent value="saude" className="mt-3">
          <HealthTab workflowId={workflowId} triggerId={trigger.id} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function HeaderBar({ trigger }: { trigger: Trigger }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span
        className={cn("size-2 rounded-full", trigger.enabled ? "bg-emerald-500" : "bg-muted")}
        aria-hidden
      />
      <span className="font-medium">
        {trigger.enabled ? "Webhook ativo" : "Webhook desabilitado"}
      </span>
      {trigger.hmacSecret && (
        <Badge variant="outline" className="h-5 gap-1 px-1.5 text-[10px]">
          <Shield className="size-3" /> HMAC
        </Badge>
      )}
      <span className="ml-auto text-muted-foreground">
        {trigger.lastTriggeredAt
          ? `Disparado por último em ${new Date(trigger.lastTriggeredAt).toLocaleString("pt-BR")}`
          : "Nunca disparado"}
      </span>
    </div>
  );
}

function EmptyHint({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-dashed border-border bg-background/40 px-3 py-4 text-center text-[11px] text-muted-foreground">
      {children}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Aba Config                                                                 */
/* -------------------------------------------------------------------------- */

function ConfigTab({
  workflowId,
  trigger,
  url,
  onChanged,
}: {
  workflowId: string;
  trigger: Trigger;
  url: string | null;
  onChanged: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const allowed = trigger.allowedMethods ?? ["POST"];

  const toggleMutation = useMutation({
    mutationFn: () => triggersApi.update(workflowId, trigger.id, { enabled: !trigger.enabled }),
    onSuccess: onChanged,
  });

  const methodsMutation = useMutation({
    mutationFn: (next: WebhookMethod[]) =>
      triggersApi.update(workflowId, trigger.id, { allowedMethods: next }),
    onSuccess: onChanged,
  });

  const removeMutation = useMutation({
    mutationFn: () => triggersApi.remove(workflowId, trigger.id),
    onSuccess: onChanged,
  });

  async function copy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* sem clipboard */
    }
  }

  function toggleMethod(m: WebhookMethod) {
    const next = allowed.includes(m) ? allowed.filter((x) => x !== m) : [...allowed, m];
    if (next.length === 0) return; // garante ao menos um método
    methodsMutation.mutate(next);
  }

  const curl = url
    ? `curl -X ${allowed[0]} '${url}' \\\n  -H 'Content-Type: application/json' \\\n  -d '{"hello":"world"}'`
    : "—";

  return (
    <div className="space-y-3">
      {url && (
        <div className="flex items-center gap-2 rounded-md border border-border bg-background px-2 py-1.5">
          <code className="flex-1 truncate font-mono text-[11px]">{url}</code>
          <Button
            size="icon-sm"
            variant="ghost"
            onClick={copy}
            aria-label="Copiar URL"
            title="Copiar URL"
          >
            {copied ? <Check className="size-4 text-emerald-500" /> : <Copy className="size-4" />}
          </Button>
        </div>
      )}

      <div className="space-y-1.5">
        <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          Métodos HTTP aceitos
        </label>
        <div className="flex flex-wrap gap-1.5">
          {ALL_METHODS.map((m) => {
            const active = allowed.includes(m);
            return (
              <button
                key={m}
                type="button"
                onClick={() => toggleMethod(m)}
                disabled={methodsMutation.isPending}
                className={cn(
                  "rounded-md border px-2 py-0.5 font-mono text-[10px] transition-colors",
                  active
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-background text-muted-foreground hover:border-primary/40",
                )}
              >
                {m}
              </button>
            );
          })}
        </div>
        <p className="text-[10px] text-muted-foreground">
          Requisições com método fora dessa lista recebem <code>405</code>.
        </p>
      </div>

      <details className="rounded-md border border-border bg-background/60">
        <summary className="cursor-pointer select-none px-2 py-1.5 text-[11px] font-medium text-muted-foreground hover:bg-muted/40">
          Exemplo de chamada (curl)
        </summary>
        <pre className="overflow-x-auto whitespace-pre-wrap break-all px-2 py-1.5 font-mono text-[10px] leading-relaxed">
          {curl}
        </pre>
      </details>

      <TriggerVersionPicker
        workflowId={workflowId}
        triggerId={trigger.id}
        triggerName={trigger.name}
        currentVersionId={trigger.workflowVersionId}
      />

      <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
        <Button
          size="sm"
          variant="outline"
          onClick={() => toggleMutation.mutate()}
          disabled={toggleMutation.isPending}
        >
          {trigger.enabled ? "Desativar" : "Ativar"}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="text-destructive hover:text-destructive"
          onClick={() => {
            if (confirm("Remover o webhook deste node? A URL atual vai parar de funcionar."))
              removeMutation.mutate();
          }}
          disabled={removeMutation.isPending}
        >
          Remover webhook
        </Button>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Aba Segurança — rotação de token + segredo HMAC                            */
/* -------------------------------------------------------------------------- */

function SecurityTab({
  workflowId,
  trigger,
  onChanged,
}: {
  workflowId: string;
  trigger: Trigger;
  onChanged: () => void;
}) {
  const [revealedSecret, setRevealedSecret] = useState<string | null>(null);
  const [showSecret, setShowSecret] = useState(false);

  const rotateTokenMutation = useMutation({
    mutationFn: () => triggersApi.rotateToken(workflowId, trigger.id),
    onSuccess: onChanged,
  });

  const rotateHmacMutation = useMutation({
    mutationFn: () => triggersApi.rotateHmac(workflowId, trigger.id),
    onSuccess: (res) => {
      setRevealedSecret(res.secret);
      setShowSecret(true);
      onChanged();
    },
  });

  const clearHmacMutation = useMutation({
    mutationFn: () => triggersApi.clearHmac(workflowId, trigger.id),
    onSuccess: () => {
      setRevealedSecret(null);
      onChanged();
    },
  });

  return (
    <div className="space-y-4">
      <section className="space-y-2 rounded-md border border-border bg-background/60 p-2.5">
        <div className="flex items-center justify-between">
          <h4 className="text-[11px] font-semibold">Token da URL</h4>
          <Badge variant="outline" className="h-5 px-1.5 text-[10px]">
            sempre obrigatório
          </Badge>
        </div>
        <p className="text-[10px] text-muted-foreground">
          Girar o token invalida a URL atual. Quem estiver chamando vai começar a receber{" "}
          <code>404</code>.
        </p>
        <div className="flex justify-end">
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              if (confirm("Confirmar rotação do token?")) rotateTokenMutation.mutate();
            }}
            disabled={rotateTokenMutation.isPending}
          >
            <RefreshCw
              className={cn("size-4", rotateTokenMutation.isPending && "animate-spin")}
            />
            Girar token
          </Button>
        </div>
      </section>

      <section className="space-y-2 rounded-md border border-border bg-background/60 p-2.5">
        <div className="flex items-center justify-between">
          <h4 className="text-[11px] font-semibold">Assinatura HMAC-SHA256</h4>
          <Badge
            variant={trigger.hmacSecret ? "default" : "outline"}
            className="h-5 px-1.5 text-[10px]"
          >
            {trigger.hmacSecret ? "ativa" : "desativada"}
          </Badge>
        </div>
        <p className="text-[10px] text-muted-foreground">
          Com o segredo configurado, as chamadas precisam mandar o header{" "}
          <code className="rounded bg-muted px-1">X-Signature-256: sha256=…</code> (também aceita{" "}
          <code className="rounded bg-muted px-1">X-Hub-Signature-256</code>). Falha de assinatura
          devolve <code>401</code>.
        </p>

        {revealedSecret && (
          <div className="space-y-1 rounded-md border border-amber-500/40 bg-amber-500/5 p-2">
            <p className="text-[10px] font-medium text-amber-700 dark:text-amber-400">
              Copie o segredo agora — ele não será mostrado de novo.
            </p>
            <div className="flex items-center gap-1.5 rounded-md border border-border bg-background px-2 py-1">
              <code className="flex-1 truncate font-mono text-[11px]">
                {showSecret
                  ? revealedSecret
                  : "•".repeat(Math.min(revealedSecret.length, 48))}
              </code>
              <Button
                size="icon-sm"
                variant="ghost"
                onClick={() => setShowSecret((s) => !s)}
                aria-label={showSecret ? "Ocultar segredo" : "Mostrar segredo"}
              >
                {showSecret ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </Button>
              <Button
                size="icon-sm"
                variant="ghost"
                onClick={() => navigator.clipboard.writeText(revealedSecret).catch(() => {})}
                aria-label="Copiar segredo"
              >
                <Copy className="size-4" />
              </Button>
            </div>
          </div>
        )}

        <div className="flex flex-wrap justify-end gap-2">
          {trigger.hmacSecret && (
            <Button
              size="sm"
              variant="ghost"
              className="text-destructive hover:text-destructive"
              onClick={() => {
                if (confirm("Remover o segredo? O webhook voltará a aceitar sem assinatura."))
                  clearHmacMutation.mutate();
              }}
              disabled={clearHmacMutation.isPending}
            >
              Remover segredo
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              const ok =
                !trigger.hmacSecret ||
                confirm(
                  "Gerar um novo segredo invalida o atual. Todas as integrações precisarão atualizar.",
                );
              if (ok) rotateHmacMutation.mutate();
            }}
            disabled={rotateHmacMutation.isPending}
          >
            <RefreshCw
              className={cn("size-4", rotateHmacMutation.isPending && "animate-spin")}
            />
            {trigger.hmacSecret ? "Regerar segredo" : "Gerar segredo"}
          </Button>
        </div>
      </section>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Aba Invocações                                                             */
/* -------------------------------------------------------------------------- */

function InvocationsTab({ workflowId, triggerId }: { workflowId: string; triggerId: string }) {
  const limit = 25;
  const query = useQuery({
    queryKey: queryKeys.triggers.invocations(workflowId, triggerId, limit),
    queryFn: () => triggersApi.listInvocations(workflowId, triggerId, limit),
  });

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-[10px] text-muted-foreground">
          Últimas {limit} chamadas recebidas neste webhook.
        </p>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => query.refetch()}
          disabled={query.isFetching}
          className="h-7 px-2 text-[11px]"
        >
          <RefreshCw className={cn("size-3.5", query.isFetching && "animate-spin")} />
          Atualizar
        </Button>
      </div>

      {query.isPending && (
        <div className="flex items-center gap-2 px-2 py-4 text-[11px] text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" /> Carregando…
        </div>
      )}

      {query.data && query.data.length === 0 && (
        <EmptyHint>Nenhuma invocação registrada ainda.</EmptyHint>
      )}

      {query.data && query.data.length > 0 && (
        <div className="overflow-hidden rounded-md border border-border bg-background">
          <table className="w-full text-[11px]">
            <thead className="bg-muted/40 text-[10px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-2 py-1.5 text-left">Quando</th>
                <th className="px-2 py-1.5 text-left">Status</th>
                <th className="px-2 py-1.5 text-right">Duração</th>
                <th className="px-2 py-1.5 text-left">Input</th>
              </tr>
            </thead>
            <tbody>
              {query.data.map((inv) => (
                <InvocationRow key={inv.id} inv={inv} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function InvocationRow({ inv }: { inv: WebhookInvocation }) {
  const durationMs = useMemo(() => {
    if (!inv.startedAt || !inv.finishedAt) return null;
    return new Date(inv.finishedAt).getTime() - new Date(inv.startedAt).getTime();
  }, [inv.startedAt, inv.finishedAt]);

  const snippet = useMemo(() => {
    try {
      const s = JSON.stringify(inv.input);
      return s.length > 80 ? `${s.slice(0, 80)}…` : s;
    } catch {
      return "—";
    }
  }, [inv.input]);

  return (
    <tr className="border-t border-border/60">
      <td className="px-2 py-1.5 text-muted-foreground">
        {new Date(inv.createdAt).toLocaleString("pt-BR")}
      </td>
      <td className="px-2 py-1.5">
        <StatusBadge status={inv.status} />
      </td>
      <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">
        {durationMs !== null ? `${durationMs}ms` : "—"}
      </td>
      <td className="px-2 py-1.5 font-mono text-[10px] text-muted-foreground">{snippet}</td>
    </tr>
  );
}

function StatusBadge({ status }: { status: WebhookInvocation["status"] }) {
  const map: Record<WebhookInvocation["status"], string> = {
    success: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
    failed: "border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-400",
    running: "border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-400",
    queued: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400",
    cancelled: "border-border bg-muted text-muted-foreground",
  };
  return (
    <span
      className={cn(
        "rounded-md border px-1.5 py-0.5 font-mono text-[10px] uppercase",
        map[status],
      )}
    >
      {status}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* Aba Saúde                                                                  */
/* -------------------------------------------------------------------------- */

function HealthTab({ workflowId, triggerId }: { workflowId: string; triggerId: string }) {
  const query = useQuery({
    queryKey: queryKeys.triggers.health(workflowId, triggerId),
    queryFn: () => triggersApi.health(workflowId, triggerId),
    refetchInterval: 30_000,
  });

  if (query.isPending) {
    return (
      <div className="flex items-center gap-2 px-2 py-4 text-[11px] text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" /> Carregando…
      </div>
    );
  }

  if (!query.data) {
    return <EmptyHint>Sem dados de saúde.</EmptyHint>;
  }

  const h = query.data;
  const successPct = h.successRate === null ? "—" : `${Math.round(h.successRate * 100)}%`;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Kpi label="Sucesso" value={successPct} hint={`em ${h.windowHours}h`} />
        <Kpi label="Chamadas" value={String(h.total)} hint={`${h.failed} falhas`} />
        <Kpi label="Latência média" value={`${h.avgMs}ms`} />
        <Kpi label="Latência p95" value={`${h.p95Ms}ms`} />
      </div>

      <HealthSparkline series={h.series} />
    </div>
  );
}

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-md border border-border bg-background/60 px-2 py-1.5">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="font-mono text-base tabular-nums">{value}</p>
      {hint && <p className="text-[10px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function HealthSparkline({ series }: { series: WebhookHealth["series"] }) {
  const data = useMemo(
    () =>
      series.map((s) => ({
        bucket: new Date(s.bucket).toLocaleTimeString("pt-BR", {
          hour: "2-digit",
          minute: "2-digit",
        }),
        total: s.total,
        failed: s.failed,
      })),
    [series],
  );

  if (data.length === 0) {
    return <EmptyHint>Sem chamadas nas últimas 24h.</EmptyHint>;
  }

  return (
    <div className="rounded-md border border-border bg-background/60 p-2">
      <p className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">
        Chamadas por hora (24h)
      </p>
      <div className="h-32">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
            <defs>
              <linearGradient id="webhookTotal" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.4} />
                <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="webhookFailed" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="rgb(244 63 94)" stopOpacity={0.4} />
                <stop offset="100%" stopColor="rgb(244 63 94)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
            <XAxis dataKey="bucket" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
            <RTooltip
              contentStyle={{ fontSize: 11 }}
              labelFormatter={(v) => (typeof v === "string" ? v : "")}
            />
            <Area
              type="monotone"
              dataKey="total"
              stroke="hsl(var(--primary))"
              fill="url(#webhookTotal)"
              strokeWidth={1.5}
            />
            <Area
              type="monotone"
              dataKey="failed"
              stroke="rgb(244 63 94)"
              fill="url(#webhookFailed)"
              strokeWidth={1.5}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Tester                                                                     */
/* -------------------------------------------------------------------------- */

type TesterResult =
  | { kind: "ok"; status: number; body: string; durationMs: number }
  | { kind: "error"; message: string };

const DEFAULT_TEST_BODY = `{\n  "hello": "world"\n}`;

function WebhookTester({
  url,
  mode,
  allowedMethods,
  hmacEnabled,
}: {
  url: string;
  mode: "async" | "sync";
  allowedMethods: WebhookMethod[];
  hmacEnabled: boolean;
}) {
  const methods = allowedMethods.length > 0 ? allowedMethods : (["POST"] as WebhookMethod[]);
  const [method, setMethod] = useState<WebhookMethod>(methods[0]);
  const [body, setBody] = useState(DEFAULT_TEST_BODY);
  const [headers, setHeaders] = useState<Record<string, unknown>>({});
  const [result, setResult] = useState<TesterResult | null>(null);
  const [sending, setSending] = useState(false);
  const [bodyError, setBodyError] = useState<string | null>(null);

  const canHaveBody = method !== "GET";

  async function send() {
    let parsed: unknown = undefined;
    if (canHaveBody) {
      const trimmed = body.trim();
      if (trimmed.length > 0) {
        try {
          parsed = JSON.parse(trimmed);
        } catch (err) {
          setBodyError((err as Error).message);
          return;
        }
      }
    }
    setBodyError(null);
    setSending(true);
    setResult(null);

    const mergedHeaders: Record<string, string> = canHaveBody
      ? { "Content-Type": "application/json" }
      : {};
    for (const [k, v] of Object.entries(headers)) {
      const key = k.trim();
      if (!key) continue;
      mergedHeaders[key] = typeof v === "string" ? v : String(v);
    }

    const startedAt = performance.now();
    try {
      const res = await fetch(url, {
        method,
        headers: mergedHeaders,
        body: canHaveBody && parsed !== undefined ? JSON.stringify(parsed) : undefined,
      });
      const text = await res.text();
      let pretty = text;
      try {
        pretty = JSON.stringify(JSON.parse(text), null, 2);
      } catch {
        /* não é JSON */
      }
      setResult({
        kind: "ok",
        status: res.status,
        body: pretty,
        durationMs: Math.round(performance.now() - startedAt),
      });
    } catch (err) {
      setResult({ kind: "error", message: (err as Error).message });
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="space-y-1">
        <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          Método
        </label>
        <div className="flex flex-wrap gap-1.5">
          {methods.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMethod(m)}
              className={cn(
                "rounded-md border px-2 py-0.5 font-mono text-[10px] transition-colors",
                method === m
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border bg-background text-muted-foreground hover:border-primary/40",
              )}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-1">
        <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          Headers
        </label>
        <KeyValueEditor
          value={headers}
          onChange={(next) => setHeaders((next as Record<string, unknown>) ?? {})}
        />
        <p className="text-[10px] text-muted-foreground">
          {canHaveBody && (
            <>
              <code className="rounded bg-muted px-1">Content-Type: application/json</code>{" "}
              é enviado por padrão.{" "}
            </>
          )}
          {hmacEnabled ? (
            <>
              HMAC ativo — assine o body e adicione{" "}
              <code className="rounded bg-muted px-1">X-Signature-256: sha256=&lt;hex&gt;</code>.
            </>
          ) : (
            <>Sobrescreva ou adicione headers custom (ex: assinaturas).</>
          )}
        </p>
      </div>

      {canHaveBody && (
        <div className="space-y-1">
          <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Body (JSON)
          </label>
          <Textarea
            value={body}
            onChange={(e) => {
              setBody(e.target.value);
              if (bodyError) setBodyError(null);
            }}
            rows={4}
            spellCheck={false}
            className="font-mono text-[11px]"
            placeholder='{ "key": "value" }'
          />
          {bodyError && (
            <p className="text-[10px] text-destructive">JSON inválido: {bodyError}</p>
          )}
        </div>
      )}

      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] text-muted-foreground">
          {mode === "sync"
            ? "Modo sync — vai aguardar o run terminar (até 30s)."
            : "Modo async — devolve 202 com o runId imediatamente."}
        </p>
        <Button size="sm" onClick={send} disabled={sending}>
          {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          Enviar teste
        </Button>
      </div>

      {result && <TesterResultView result={result} />}
    </div>
  );
}

function TesterResultView({ result }: { result: TesterResult }) {
  if (result.kind === "error") {
    return (
      <div className="rounded-md border border-destructive/40 bg-destructive/10 px-2 py-1.5">
        <p className="text-[10px] font-medium text-destructive">Falha na chamada</p>
        <p className="mt-0.5 break-words text-[11px] text-destructive/90">{result.message}</p>
        <p className="mt-1 text-[10px] text-muted-foreground">
          Verifique se a URL está correta, se o backend está acessível e se não há bloqueio de CORS
          no domínio do front.
        </p>
      </div>
    );
  }

  const ok = result.status >= 200 && result.status < 300;
  return (
    <div
      className={cn(
        "rounded-md border px-2 py-1.5",
        ok ? "border-emerald-500/40 bg-emerald-500/5" : "border-rose-500/40 bg-rose-500/5",
      )}
    >
      <div className="flex items-center justify-between gap-2 text-[11px]">
        <span className={cn("font-medium", ok ? "text-emerald-600" : "text-rose-600")}>
          HTTP {result.status}
        </span>
        <span className="text-[10px] tabular-nums text-muted-foreground">
          {result.durationMs}ms
        </span>
      </div>
      <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap break-words font-mono text-[10px] leading-relaxed">
        {result.body || "(corpo vazio)"}
      </pre>
    </div>
  );
}
