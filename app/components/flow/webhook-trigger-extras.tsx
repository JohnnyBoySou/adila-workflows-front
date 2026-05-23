/**
 * Painel extra do node `webhook_trigger`.
 *
 * Renderizado dentro do `NodeConfigDialog` quando o tipo do node é
 * `webhook_trigger`. Cuida do ciclo de vida da entidade `triggers` que
 * fica associada via `nodeId`:
 *   - Se ainda não existe → mostra "Habilitar webhook" (cria via POST).
 *   - Se existe → mostra URL pública, copiar, girar token, desabilitar.
 *
 * Não toca em `node.data` — esse é só dos campos declarativos (responseMode,
 * timeout). A entidade `triggers` é a fonte da verdade do **token**; a
 * config local do node guarda **preferências** que o usuário pode mudar
 * sem precisar refazer a entidade.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, Loader2, RefreshCw, Send, Webhook } from "lucide-react";

import { Button } from "~/components/ui/button";
import { Textarea } from "~/components/ui/textarea";
import { KeyValueEditor } from "./node-config/fields";
import { queryKeys } from "~/lib/query-keys";
import { cn } from "~/lib/utils";
import * as triggersApi from "~/services/triggers";
import type { Trigger } from "~/services/triggers";

type Props = {
  workflowId: string;
  nodeId: string;
  /** Modo escolhido nos campos do dialog — propagamos pra entidade ao criar/atualizar. */
  responseMode?: "async" | "sync";
  responseTimeoutMs?: number;
};

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
    <TriggerActive
      workflowId={workflowId}
      trigger={trigger}
      onChanged={invalidate}
    />
  );
}

function TriggerActive({
  workflowId,
  trigger,
  onChanged,
}: {
  workflowId: string;
  trigger: Trigger;
  onChanged: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const url = trigger.webhookToken ? triggersApi.webhookUrl(trigger.webhookToken) : null;

  const toggleMutation = useMutation({
    mutationFn: () => triggersApi.update(workflowId, trigger.id, { enabled: !trigger.enabled }),
    onSuccess: onChanged,
  });

  const rotateMutation = useMutation({
    mutationFn: () => triggersApi.rotateToken(workflowId, trigger.id),
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
      /* clipboard indisponível — ignora */
    }
  }

  return (
    <div className="mt-4 space-y-3 rounded-md border border-border bg-muted/20 px-3 py-3">
      <div className="flex items-center gap-2 text-xs">
        <span
          className={cn("size-2 rounded-full", trigger.enabled ? "bg-emerald-500" : "bg-muted")}
          aria-hidden
        />
        <span className="font-medium">
          {trigger.enabled ? "Webhook ativo" : "Webhook desabilitado"}
        </span>
        <span className="ml-auto text-muted-foreground">
          {trigger.lastTriggeredAt
            ? `Disparado por último em ${new Date(trigger.lastTriggeredAt).toLocaleString("pt-BR")}`
            : "Nunca disparado"}
        </span>
      </div>

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

      <details className="rounded-md border border-border bg-background/60">
        <summary className="cursor-pointer select-none px-2 py-1.5 text-[11px] font-medium text-muted-foreground hover:bg-muted/40">
          Exemplo de chamada (curl)
        </summary>
        <pre className="overflow-x-auto whitespace-pre-wrap break-all px-2 py-1.5 font-mono text-[10px] leading-relaxed">
          {url
            ? `curl -X POST '${url}' \\\n  -H 'Content-Type: application/json' \\\n  -d '{"hello":"world"}'`
            : "—"}
        </pre>
      </details>

      {url && trigger.enabled && (
        <WebhookTester url={url} mode={trigger.webhookResponseMode ?? "async"} />
      )}

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
          variant="outline"
          onClick={() => {
            if (
              confirm(
                "Girar o token invalida a URL atual. Quem estiver chamando vai começar a receber 404. Continuar?",
              )
            )
              rotateMutation.mutate();
          }}
          disabled={rotateMutation.isPending}
        >
          <RefreshCw className={cn("size-4", rotateMutation.isPending && "animate-spin")} />
          Girar token
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
/* Tester — dispara o webhook com um body custom e mostra a resposta.          */
/* -------------------------------------------------------------------------- */

type TesterResult =
  | { kind: "ok"; status: number; body: string; durationMs: number }
  | { kind: "error"; message: string };

const DEFAULT_TEST_BODY = `{\n  "hello": "world"\n}`;

function WebhookTester({ url, mode }: { url: string; mode: "async" | "sync" }) {
  const [body, setBody] = useState(DEFAULT_TEST_BODY);
  const [headers, setHeaders] = useState<Record<string, unknown>>({});
  const [result, setResult] = useState<TesterResult | null>(null);
  const [sending, setSending] = useState(false);
  const [bodyError, setBodyError] = useState<string | null>(null);

  async function send() {
    // Validação local — body precisa ser JSON válido (ou vazio).
    let parsed: unknown = undefined;
    const trimmed = body.trim();
    if (trimmed.length > 0) {
      try {
        parsed = JSON.parse(trimmed);
      } catch (err) {
        setBodyError((err as Error).message);
        return;
      }
    }
    setBodyError(null);
    setSending(true);
    setResult(null);

    // Mescla headers do usuário com o Content-Type default. Headers customizados
    // têm precedência — permite testar assinaturas (X-Hub-Signature, Stripe-Signature)
    // ou trocar o Content-Type pra raw text.
    const mergedHeaders: Record<string, string> = { "Content-Type": "application/json" };
    for (const [k, v] of Object.entries(headers)) {
      const key = k.trim();
      if (!key) continue;
      mergedHeaders[key] = typeof v === "string" ? v : String(v);
    }

    const startedAt = performance.now();
    try {
      // fetch global (não $fetch) — o endpoint /hooks/:token é público e
      // não deve receber Authorization: Bearer.
      const res = await fetch(url, {
        method: "POST",
        headers: mergedHeaders,
        body: parsed !== undefined ? JSON.stringify(parsed) : undefined,
      });
      const text = await res.text();
      // Tenta reformatar JSON pra leitura — se falhar, mostra texto cru.
      let pretty = text;
      try {
        pretty = JSON.stringify(JSON.parse(text), null, 2);
      } catch {
        /* não é JSON, ok */
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
    <details className="rounded-md border border-border bg-background/60">
      <summary className="cursor-pointer select-none px-2 py-1.5 text-[11px] font-medium text-muted-foreground hover:bg-muted/40">
        Testar webhook
      </summary>
      <div className="space-y-2 px-2 py-2">
        <div className="space-y-1">
          <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Headers
          </label>
          <KeyValueEditor
            value={headers}
            onChange={(next) =>
              setHeaders((next as Record<string, unknown>) ?? {})
            }
          />
          <p className="text-[10px] text-muted-foreground">
            <code className="rounded bg-muted px-1">Content-Type: application/json</code> é enviado
            por padrão. Sobrescreva aqui ou adicione assinaturas (
            <code className="rounded bg-muted px-1">X-Hub-Signature-256</code>,{" "}
            <code className="rounded bg-muted px-1">Stripe-Signature</code> etc.).
          </p>
        </div>

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
          {bodyError && <p className="text-[10px] text-destructive">JSON inválido: {bodyError}</p>}
        </div>

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
    </details>
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
        <span className="text-[10px] tabular-nums text-muted-foreground">{result.durationMs}ms</span>
      </div>
      <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap break-words font-mono text-[10px] leading-relaxed">
        {result.body || "(corpo vazio)"}
      </pre>
    </div>
  );
}
