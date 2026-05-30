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
  FileJson,
  History,
  Loader2,
  Plus,
  RefreshCw,
  Send,
  Settings,
  Shield,
  Trash2,
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
import { Textarea } from "~/components/ui/textarea";
import { Sections } from "~/components/ui/sections";
import type { SectionItem } from "~/components/ui/sections";
import { KeyValueEditor } from "./node-config/fields";
import { queryKeys } from "~/lib/query-keys";
import { cn } from "~/lib/utils";
import * as triggersApi from "~/services/triggers";
import type {
  Trigger,
  WebhookFieldSchema,
  WebhookHealth,
  WebhookInputSchema,
  WebhookInvocation,
  WebhookMethod,
} from "~/services/triggers";
import { TriggerVersionPicker } from "./trigger-version-picker";

type Props = {
  workflowId: string;
  nodeId: string;
};

const ALL_METHODS: WebhookMethod[] = ["POST", "GET", "PUT", "PATCH", "DELETE"];

export function WebhookTriggerExtras({ workflowId, nodeId }: Props) {
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
        webhookResponseMode: "async",
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
/* Painel com Sections (sidebar nav + conteúdo)                               */
/* -------------------------------------------------------------------------- */

type SectionKey = "config" | "schema" | "resposta" | "teste" | "seguranca" | "invocacoes" | "saude";

const WEBHOOK_SECTIONS: ReadonlyArray<SectionItem<SectionKey>> = [
  { id: "config", label: "Config", icon: Settings },
  { id: "schema", label: "Schema", icon: FileJson },
  { id: "resposta", label: "Resposta", icon: RefreshCw },
  { id: "teste", label: "Teste", icon: Send },
  { id: "seguranca", label: "Segurança", icon: Shield },
  { id: "invocacoes", label: "Invocações", icon: History },
  { id: "saude", label: "Saúde", icon: Activity },
];

function TriggerActiveTabbed({
  workflowId,
  trigger,
  onChanged,
}: {
  workflowId: string;
  trigger: Trigger;
  onChanged: () => void;
}) {
  const [section, setSection] = useState<SectionKey>("config");
  // URL padrão = token. Se o usuário setou um path personalizado, mostra ele
  // como URL primária (mais amigável) e mantém o token como fallback técnico.
  const tokenUrl = trigger.webhookToken ? triggersApi.webhookUrl(trigger.webhookToken) : null;
  const pathUrl = trigger.webhookPath ? triggersApi.webhookUrl(trigger.webhookPath) : null;
  const url = pathUrl ?? tokenUrl;

  return (
    <Sections
      sections={WEBHOOK_SECTIONS}
      value={section}
      onValueChange={setSection}
      ariaLabel="Seções do webhook"
      className="min-h-[320px]"
      navClassName="w-36"
    >
      {section === "config" && (
        <ConfigTab workflowId={workflowId} trigger={trigger} url={url} onChanged={onChanged} />
      )}
      {section === "schema" && (
        <SchemaTab workflowId={workflowId} trigger={trigger} onChanged={onChanged} />
      )}
      {section === "resposta" && (
        <ResponseTab workflowId={workflowId} trigger={trigger} onChanged={onChanged} />
      )}
      {section === "teste" && (
        url && trigger.enabled ? (
          <WebhookTester
            url={url}
            mode={trigger.webhookResponseMode ?? "async"}
            allowedMethods={trigger.allowedMethods}
            hmacEnabled={Boolean(trigger.hmacSecret)}
          />
        ) : (
          <EmptyHint>
            Ative o webhook na seção <strong>Config</strong> antes de testar.
          </EmptyHint>
        )
      )}
      {section === "seguranca" && (
        <SecurityTab workflowId={workflowId} trigger={trigger} onChanged={onChanged} />
      )}
      {section === "invocacoes" && (
        <InvocationsTab workflowId={workflowId} triggerId={trigger.id} />
      )}
      {section === "saude" && (
        <HealthTab workflowId={workflowId} triggerId={trigger.id} />
      )}
    </Sections>
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
  const [pathDraft, setPathDraft] = useState(trigger.webhookPath ?? "");
  const [pathError, setPathError] = useState<string | null>(null);
  const allowed = trigger.allowedMethods ?? ["POST"];

  const pathMutation = useMutation({
    mutationFn: (next: string | null) =>
      triggersApi.update(workflowId, trigger.id, { webhookPath: next }),
    onSuccess: () => {
      setPathError(null);
      onChanged();
    },
    onError: (err: Error) => {
      setPathError(err.message || "Path inválido ou já em uso");
    },
  });

  function savePath() {
    const trimmed = pathDraft.trim();
    if (trimmed === (trigger.webhookPath ?? "")) return;
    if (trimmed === "") {
      pathMutation.mutate(null);
      return;
    }
    if (!/^[a-z0-9_-]{2,64}$/.test(trimmed)) {
      setPathError("Use 2-64 chars: letras minúsculas, números, '-' ou '_'");
      return;
    }
    pathMutation.mutate(trimmed);
  }

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

  const METHOD_COLORS: Record<WebhookMethod, string> = {
    POST:   "bg-emerald-500/10 text-emerald-700 border-emerald-500/30 dark:text-emerald-400",
    GET:    "bg-sky-500/10     text-sky-700     border-sky-500/30     dark:text-sky-400",
    PUT:    "bg-amber-500/10   text-amber-700   border-amber-500/30   dark:text-amber-400",
    PATCH:  "bg-violet-500/10  text-violet-700  border-violet-500/30  dark:text-violet-400",
    DELETE: "bg-rose-500/10    text-rose-700    border-rose-500/30    dark:text-rose-400",
  };

  return (
    <div className="space-y-5">
      {/* URL pública */}
      {url && (
        <div className="space-y-1.5">
          <p className="text-xs font-semibold text-foreground">URL pública</p>
          <div className="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2">
            <code className="flex-1 truncate font-mono text-[11px] text-muted-foreground">{url}</code>
            <button
              type="button"
              onClick={copy}
              aria-label="Copiar URL"
              className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
            >
              {copied
                ? <Check className="size-3.5 text-emerald-500" />
                : <Copy className="size-3.5" />}
            </button>
          </div>
          {trigger.webhookToken && trigger.webhookPath && (
            <p className="text-[10px] text-muted-foreground">
              Alias ativo — a URL antiga com token (<code className="rounded bg-muted px-1">{trigger.webhookToken.slice(0, 12)}…</code>) ainda responde.
            </p>
          )}
        </div>
      )}

      {/* Path personalizado */}
      <div className="space-y-1.5">
        <p className="text-xs font-semibold text-foreground">Path personalizado (opcional)</p>
        <p className="text-[10px] text-muted-foreground">
          Substitui o token na URL por um alias amigável. Ex.: <code className="rounded bg-muted px-1">clinicare1</code> → <code className="rounded bg-muted px-1">/hooks/clinicare1</code>. Slug minúsculo, único globalmente.
        </p>
        <div className="flex items-center gap-2">
          <div className="flex flex-1 items-center gap-1 rounded-md border border-border bg-background px-2 py-1">
            <span className="font-mono text-[11px] text-muted-foreground">/hooks/</span>
            <input
              type="text"
              value={pathDraft}
              onChange={(e) => {
                setPathDraft(e.target.value.toLowerCase());
                if (pathError) setPathError(null);
              }}
              onBlur={savePath}
              onKeyDown={(e) => e.key === "Enter" && savePath()}
              placeholder="meu-webhook"
              spellCheck={false}
              autoCapitalize="off"
              className="flex-1 bg-transparent font-mono text-[11px] outline-none placeholder:text-muted-foreground/60"
            />
            {pathMutation.isPending && <Loader2 className="size-3.5 animate-spin text-muted-foreground" />}
          </div>
          {trigger.webhookPath && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setPathDraft("");
                pathMutation.mutate(null);
              }}
              disabled={pathMutation.isPending}
              className="h-7 px-2 text-[11px] text-muted-foreground hover:text-destructive"
            >
              Limpar
            </Button>
          )}
        </div>
        {pathError && <p className="text-[10px] text-destructive">{pathError}</p>}
      </div>

      {/* Métodos HTTP */}
      <div className="space-y-2">
        <div>
          <p className="text-xs font-semibold text-foreground">Métodos aceitos</p>
          <p className="text-[11px] text-muted-foreground">
            Clique para ativar ou desativar. Requisições fora da seleção recebem <code className="rounded bg-muted px-1">405</code>.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {ALL_METHODS.map((m) => {
            const active = allowed.includes(m);
            return (
              <button
                key={m}
                type="button"
                onClick={() => toggleMethod(m)}
                disabled={methodsMutation.isPending}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 font-mono text-[11px] font-medium transition-all",
                  active
                    ? METHOD_COLORS[m]
                    : "border-border bg-background text-muted-foreground opacity-40 hover:opacity-70",
                )}
              >
                {active && <span className="size-1.5 rounded-full bg-current" />}
                {m}
              </button>
            );
          })}
        </div>
      </div>

      {/* curl de exemplo */}
      <details className="rounded-md border border-border bg-muted/30">
        <summary className="cursor-pointer select-none px-3 py-2 text-[11px] font-medium text-muted-foreground hover:text-foreground">
          Ver exemplo cURL
        </summary>
        <pre className="overflow-x-auto whitespace-pre-wrap break-all border-t border-border px-3 py-2 font-mono text-[10px] leading-relaxed text-muted-foreground">
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
/* Seção Schema — validação do body de entrada                                */
/* -------------------------------------------------------------------------- */

const FIELD_TYPES: Array<{ value: WebhookFieldSchema["type"]; label: string }> = [
  { value: "string", label: "String" },
  { value: "number", label: "Number" },
  { value: "integer", label: "Integer" },
  { value: "boolean", label: "Boolean" },
  { value: "object", label: "Object" },
  { value: "array", label: "Array" },
];

type DraftField = WebhookFieldSchema & { name: string };

function schemaToFields(schema: WebhookInputSchema | null): DraftField[] {
  if (!schema) return [];
  return Object.entries(schema.properties).map(([name, f]) => ({ name, ...f }));
}

function fieldsToDraft(fields: DraftField[], required: string[]): WebhookInputSchema {
  const properties: Record<string, WebhookFieldSchema> = {};
  for (const { name, ...rest } of fields) {
    if (name.trim()) properties[name.trim()] = rest;
  }
  return { properties, required: required.filter((r) => r in properties) };
}

function SchemaTab({
  workflowId,
  trigger,
  onChanged,
}: {
  workflowId: string;
  trigger: Trigger;
  onChanged: () => void;
}) {
  const [fields, setFields] = useState<DraftField[]>(() =>
    schemaToFields(trigger.inputSchema ?? null),
  );
  const [required, setRequired] = useState<string[]>(trigger.inputSchema?.required ?? []);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  function addField() {
    setFields((prev) => [...prev, { name: "", type: "string" }]);
    setSaved(false);
  }

  function removeField(idx: number) {
    setFields((prev) => {
      const next = prev.filter((_, i) => i !== idx);
      setRequired((r) => r.filter((n) => n !== prev[idx]?.name));
      return next;
    });
    setSaved(false);
  }

  function updateField(idx: number, patch: Partial<DraftField>) {
    setFields((prev) => prev.map((f, i) => (i === idx ? { ...f, ...patch } : f)));
    setSaved(false);
  }

  function toggleRequired(name: string) {
    setRequired((prev) =>
      prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name],
    );
    setSaved(false);
  }

  async function save() {
    setSaving(true);
    try {
      const schema = fields.length > 0 ? fieldsToDraft(fields, required) : null;
      await triggersApi.update(workflowId, trigger.id, { inputSchema: schema });
      onChanged();
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs font-semibold text-foreground">Schema de entrada</p>
        <p className="text-[11px] text-muted-foreground">
          Defina os campos esperados no body. Requisições com body inválido recebem{" "}
          <code className="rounded bg-muted px-1">400</code> com detalhes por campo.
        </p>
      </div>

      {fields.length === 0 ? (
        <div className="rounded-md border border-dashed border-border px-4 py-5 text-center text-[11px] text-muted-foreground">
          Nenhum campo definido — qualquer body é aceito.
        </div>
      ) : (
        <div className="space-y-2">
          {/* Header */}
          <div className="grid grid-cols-[1fr_110px_60px_28px] gap-2 px-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            <span>Campo</span>
            <span>Tipo</span>
            <span className="text-center">Obrig.</span>
            <span />
          </div>

          {fields.map((field, idx) => (
            <div key={idx} className="space-y-1">
              <div className="grid grid-cols-[1fr_110px_60px_28px] items-center gap-2">
                <input
                  type="text"
                  value={field.name}
                  onChange={(e) => updateField(idx, { name: e.target.value })}
                  placeholder="nome_do_campo"
                  className="rounded-md border border-border bg-background px-2 py-1 font-mono text-[11px] outline-none focus:ring-1 focus:ring-ring"
                />
                <select
                  value={field.type}
                  onChange={(e) =>
                    updateField(idx, { type: e.target.value as WebhookFieldSchema["type"] })
                  }
                  className="rounded-md border border-border bg-background px-2 py-1 text-[11px] outline-none focus:ring-1 focus:ring-ring"
                >
                  {FIELD_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
                <div className="flex justify-center">
                  <input
                    type="checkbox"
                    checked={required.includes(field.name)}
                    onChange={() => toggleRequired(field.name)}
                    disabled={!field.name.trim()}
                    className="size-4 cursor-pointer accent-primary"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => removeField(idx)}
                  className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>

              {/* Linha de descrição + constraints por tipo */}
              <div className="grid grid-cols-2 gap-2 pl-1">
                <input
                  type="text"
                  value={field.description ?? ""}
                  onChange={(e) => updateField(idx, { description: e.target.value || undefined })}
                  placeholder="Descrição (opcional)"
                  className="col-span-2 rounded-md border border-border bg-background px-2 py-0.5 text-[10px] text-muted-foreground outline-none focus:ring-1 focus:ring-ring"
                />
                {(field.type === "string") && (
                  <>
                    <input
                      type="number"
                      value={field.minLength ?? ""}
                      onChange={(e) =>
                        updateField(idx, {
                          minLength: e.target.value ? Number(e.target.value) : undefined,
                        })
                      }
                      placeholder="minLength"
                      className="rounded-md border border-border bg-background px-2 py-0.5 font-mono text-[10px] outline-none focus:ring-1 focus:ring-ring"
                    />
                    <input
                      type="number"
                      value={field.maxLength ?? ""}
                      onChange={(e) =>
                        updateField(idx, {
                          maxLength: e.target.value ? Number(e.target.value) : undefined,
                        })
                      }
                      placeholder="maxLength"
                      className="rounded-md border border-border bg-background px-2 py-0.5 font-mono text-[10px] outline-none focus:ring-1 focus:ring-ring"
                    />
                    <input
                      type="text"
                      value={field.enum?.join(", ") ?? ""}
                      onChange={(e) =>
                        updateField(idx, {
                          enum: e.target.value
                            ? e.target.value.split(",").map((s) => s.trim())
                            : undefined,
                        })
                      }
                      placeholder="enum: val1, val2, val3"
                      className="col-span-2 rounded-md border border-border bg-background px-2 py-0.5 font-mono text-[10px] outline-none focus:ring-1 focus:ring-ring"
                    />
                  </>
                )}
                {(field.type === "number" || field.type === "integer") && (
                  <>
                    <input
                      type="number"
                      value={field.minimum ?? ""}
                      onChange={(e) =>
                        updateField(idx, {
                          minimum: e.target.value ? Number(e.target.value) : undefined,
                        })
                      }
                      placeholder="minimum"
                      className="rounded-md border border-border bg-background px-2 py-0.5 font-mono text-[10px] outline-none focus:ring-1 focus:ring-ring"
                    />
                    <input
                      type="number"
                      value={field.maximum ?? ""}
                      onChange={(e) =>
                        updateField(idx, {
                          maximum: e.target.value ? Number(e.target.value) : undefined,
                        })
                      }
                      placeholder="maximum"
                      className="rounded-md border border-border bg-background px-2 py-0.5 font-mono text-[10px] outline-none focus:ring-1 focus:ring-ring"
                    />
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2">
        <Button type="button" variant="outline" size="sm" onClick={addField} className="gap-1.5">
          <Plus className="size-3.5" /> Adicionar campo
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={save}
          disabled={saving}
          className="ml-auto gap-1.5"
        >
          {saving ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : saved ? (
            <Check className="size-3.5 text-emerald-400" />
          ) : null}
          {saved ? "Salvo" : "Salvar schema"}
        </Button>
      </div>

      {/* Preview JSON Schema */}
      {fields.length > 0 && (
        <details className="rounded-md border border-border bg-muted/30">
          <summary className="cursor-pointer select-none px-3 py-2 text-[11px] font-medium text-muted-foreground hover:text-foreground">
            Ver JSON Schema gerado
          </summary>
          <pre className="overflow-x-auto border-t border-border px-3 py-2 font-mono text-[10px] leading-relaxed text-muted-foreground">
            {JSON.stringify(fieldsToDraft(fields, required), null, 2)}
          </pre>
        </details>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Seção Resposta — modo async/sync e timeout                                 */
/* -------------------------------------------------------------------------- */

function ResponseTab({
  workflowId,
  trigger,
  onChanged,
}: {
  workflowId: string;
  trigger: Trigger;
  onChanged: () => void;
}) {
  const mode = trigger.webhookResponseMode ?? "async";

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          Modo de resposta
        </label>
        <div className="flex gap-1.5">
          {(["async", "sync"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() =>
                triggersApi
                  .update(workflowId, trigger.id, { webhookResponseMode: m })
                  .then(onChanged)
              }
              className={cn(
                "rounded-md border px-3 py-1 text-[11px] font-medium transition-colors",
                mode === m
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border bg-background text-muted-foreground hover:border-primary/40",
              )}
            >
              {m}
            </button>
          ))}
        </div>
        <p className="text-[10px] text-muted-foreground">
          {mode === "sync"
            ? "Sync — aguarda o run terminar e devolve a resposta do workflow ao chamador."
            : "Async — devolve 202 com o runId imediatamente e executa em background."}
        </p>
      </div>

      {mode === "sync" && (
        <div className="space-y-1.5">
          <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Timeout (ms)
          </label>
          <input
            type="number"
            min={1000}
            max={120000}
            step={1000}
            defaultValue={trigger.webhookResponseTimeoutMs ?? 30000}
            onBlur={(e) => {
              const v = Number(e.target.value);
              if (v > 0)
                triggersApi
                  .update(workflowId, trigger.id, { webhookResponseTimeoutMs: v })
                  .then(onChanged);
            }}
            className="w-32 rounded-md border border-border bg-background px-2 py-1 font-mono text-[11px]"
          />
          <p className="text-[10px] text-muted-foreground">
            Se o run não terminar dentro desse tempo, o webhook devolve 504.
          </p>
        </div>
      )}
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
