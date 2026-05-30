/**
 * Painel dedicado pro nó `embeddings`. Seções:
 *
 *   Provedor   — openai (oficial) ou custom (qualquer endpoint OpenAI-compatible:
 *                Ollama, LM Studio, vLLM, Together, Groq, etc).
 *                Mostra catálogo de modelos sugeridos com dimensão prevista.
 *   Entrada    — text (single) ou texts (batch)
 *   Teste      — dispara dry-run; mostra vetor amostrado + dimensão + custo (se houver)
 *   Histórico  — últimas execuções do node em runs reais
 *
 * Persiste em `values`:
 *   provider: "openai" | "custom"      — default openai
 *   model: string                       — default text-embedding-3-small
 *   baseUrl?: string                    — somente provider custom
 *   apiKey?: string                     — somente provider custom (geralmente {{env.X}})
 *   text?: string                       — modo single
 *   texts?: string[] | string           — modo batch (no UI guardamos como JSON string ou array)
 */
import { useMemo, useState } from "react";
import { useFieldError } from "./use-field-error";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Boxes,
  Cpu,
  History,
  Loader2,
  Send,
  Sparkles,
  Type,
} from "lucide-react";

import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Sections, type SectionItem } from "~/components/ui/sections";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { Textarea } from "~/components/ui/textarea";
import { cn } from "~/lib/utils";
import { queryKeys } from "~/lib/query-keys";
import * as environmentsApi from "~/services/environments";
import * as nodesApi from "~/services/workflow-nodes";
import type { NodeInvocation } from "~/services/workflow-nodes";

import { useWorkflowId } from "../workflow-context";
import type { CustomPanelProps } from "./types";

type Provider = "openai" | "custom";
type Mode = "single" | "batch";

type ModelPreset = {
  id: string;
  name: string;
  dims: number;
  context?: number;
  cost?: string;
  note?: string;
};

const OPENAI_MODELS: ModelPreset[] = [
  { id: "text-embedding-3-small", name: "text-embedding-3-small", dims: 1536, cost: "$0.020 / 1M tokens", note: "Padrão recomendado. Bom custo/qualidade." },
  { id: "text-embedding-3-large", name: "text-embedding-3-large", dims: 3072, cost: "$0.130 / 1M tokens", note: "Maior qualidade, +5x mais caro. Use em RAG difícil." },
  { id: "text-embedding-ada-002", name: "text-embedding-ada-002", dims: 1536, cost: "$0.100 / 1M tokens", note: "Geração antiga. Prefira -3-small." },
];

const CUSTOM_PRESETS: ModelPreset[] = [
  { id: "nomic-embed-text", name: "nomic-embed-text (Ollama)", dims: 768, note: "Padrão Ollama. Roda em CPU/GPU local." },
  { id: "mxbai-embed-large", name: "mxbai-embed-large (Ollama)", dims: 1024, note: "Maior qualidade, ~334M params." },
  { id: "bge-m3", name: "BAAI/bge-m3", dims: 1024, note: "Multilingual, longo contexto." },
  { id: "snowflake-arctic-embed", name: "snowflake-arctic-embed", dims: 1024, note: "SOTA inglês em retrieval (Snowflake)." },
];

const PROVIDERS: { value: Provider; label: string; icon: typeof Sparkles; hint: string }[] = [
  { value: "openai", label: "OpenAI", icon: Sparkles, hint: "API oficial. Lê OPENAI_API_KEY do environment." },
  { value: "custom", label: "Custom (OpenAI-compatible)", icon: Cpu, hint: "Ollama, LM Studio, vLLM, Together, Groq, etc. Você informa baseUrl." },
];

const SECTIONS = [
  { id: "provider", label: "Provedor", icon: Boxes },
  { id: "input", label: "Entrada", icon: Type },
  { id: "test", label: "Teste", icon: Send },
  { id: "history", label: "Histórico", icon: History },
] as const satisfies ReadonlyArray<SectionItem>;

type SectionId = (typeof SECTIONS)[number]["id"];

function readString(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}
function readProvider(v: unknown): Provider {
  return v === "custom" ? "custom" : "openai";
}
function readMode(values: Record<string, unknown>): Mode {
  return Array.isArray(values.texts) || typeof values.texts === "string" ? "batch" : "single";
}

export function EmbeddingsPanel({ values, onChange, onError, nodeId }: CustomPanelProps) {
  const [section, setSection] = useState<SectionId>("provider");
  const workflowId = useWorkflowId() ?? "";

  const provider = readProvider(values.provider);
  const model = readString(values.model);
  const baseUrl = readString(values.baseUrl);
  const mode = readMode(values);

  const modelMissing = model.trim() === "";
  const baseUrlMissing = provider === "custom" && baseUrl.trim() === "";

  useFieldError(onError, "model", modelMissing ? "Informe o modelo." : null);
  useFieldError(onError, "baseUrl", baseUrlMissing ? "Informe a baseUrl." : null);

  function set(patch: Record<string, unknown>) {
    onChange(patch);
  }

  return (
    <Sections
      sections={SECTIONS as unknown as SectionItem<SectionId>[]}
      value={section}
      onValueChange={setSection}
      ariaLabel="Seções do nó Embeddings"
    >
      {section === "provider" && (
        <ProviderSection values={values} onSet={set} provider={provider} modelMissing={modelMissing} baseUrlMissing={baseUrlMissing} />
      )}
      {section === "input" && <InputSection values={values} onSet={set} mode={mode} />}
      {section === "test" && (
        <TestSection workflowId={workflowId} nodeId={nodeId} values={values} provider={provider} />
      )}
      {section === "history" && <HistorySection workflowId={workflowId} nodeId={nodeId} />}
    </Sections>
  );
}

/* -------------------------------------------------------------------------- */
/* Provedor                                                                   */
/* -------------------------------------------------------------------------- */

function ProviderSection({
  values,
  onSet,
  provider,
  modelMissing,
  baseUrlMissing,
}: {
  values: Record<string, unknown>;
  onSet: (patch: Record<string, unknown>) => void;
  provider: Provider;
  modelMissing: boolean;
  baseUrlMissing: boolean;
}) {
  const presets = provider === "openai" ? OPENAI_MODELS : CUSTOM_PRESETS;
  const model = readString(values.model);
  const activePreset = presets.find((p) => p.id === model);

  return (
    <div className="space-y-4">
      <SectionHeader title="Provedor" hint="Escolha de onde o vetor vem. O modelo pode ser fornecido pelo provider ou um endpoint local seu." />

      <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
        {PROVIDERS.map((p) => {
          const Icon = p.icon;
          const active = p.value === provider;
          return (
            <button
              key={p.value}
              type="button"
              onClick={() => {
                const patch: Record<string, unknown> = { provider: p.value };
                if (p.value === "openai" && !values.model) patch.model = "text-embedding-3-small";
                onSet(patch);
              }}
              className={cn(
                "flex items-start gap-2 rounded-md border px-2.5 py-2 text-left transition-colors",
                active ? "border-primary bg-primary/10" : "border-border bg-background hover:border-primary/40",
              )}
            >
              <Icon className={cn("mt-0.5 size-4 shrink-0", active ? "text-primary" : "text-muted-foreground")} />
              <div className="min-w-0">
                <p className={cn("text-[12px] font-medium", active && "text-primary")}>{p.label}</p>
                <p className="text-[10px] text-muted-foreground">{p.hint}</p>
              </div>
            </button>
          );
        })}
      </div>

      {provider === "custom" && (
        <>
          <FieldRow
            label="Base URL"
            hint="Endpoint até a raiz da API OpenAI-compatible. Ollama: http://host.docker.internal:11434/v1"
            error={baseUrlMissing ? "Obrigatório." : null}
          >
            <Input
              value={readString(values.baseUrl)}
              onChange={(e) => onSet({ baseUrl: e.target.value })}
              placeholder="http://localhost:11434/v1"
              className="font-mono text-xs"
            />
          </FieldRow>
          <FieldRow
            label="API Key (opcional)"
            hint="Geralmente {{env.SUA_KEY}}. Ollama puro não precisa. Together/Groq precisam."
          >
            <Input
              value={readString(values.apiKey)}
              onChange={(e) => onSet({ apiKey: e.target.value })}
              placeholder="{{env.TOGETHER_API_KEY}}"
              className="font-mono text-xs"
            />
          </FieldRow>
        </>
      )}

      <FieldRow
        label="Modelo"
        hint={provider === "openai" ? "Modelos OpenAI oficiais." : "ID do modelo no servidor. Para Ollama, use o `ollama pull <id>` previamente."}
        error={modelMissing ? "Obrigatório." : null}
      >
        <Input
          value={model}
          onChange={(e) => onSet({ model: e.target.value })}
          placeholder={provider === "openai" ? "text-embedding-3-small" : "nomic-embed-text"}
          className="font-mono text-xs"
        />
      </FieldRow>

      <div className="space-y-1.5">
        <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Sugestões</Label>
        <div className="grid grid-cols-1 gap-1.5 md:grid-cols-2">
          {presets.map((p) => {
            const active = p.id === model;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => onSet({ model: p.id })}
                className={cn(
                  "rounded-md border px-2 py-1.5 text-left transition-colors",
                  active ? "border-primary bg-primary/10" : "border-border bg-background hover:border-primary/40",
                )}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <p className={cn("font-mono text-[11px]", active && "text-primary font-medium")}>{p.name}</p>
                  <span className="font-mono text-[10px] tabular-nums text-muted-foreground">{p.dims}d</span>
                </div>
                {p.cost && <p className="text-[10px] text-muted-foreground">{p.cost}</p>}
                {p.note && <p className="mt-0.5 text-[10px] text-muted-foreground">{p.note}</p>}
              </button>
            );
          })}
        </div>
        {activePreset && (
          <p className="rounded-md border border-dashed border-border bg-muted/20 px-2 py-1 text-[10px] text-muted-foreground">
            ⚠️ Vetores de <code className="font-mono">{activePreset.dims}d</code> — a tabela
            pgvector destino precisa ter coluna <code className="font-mono">vector({activePreset.dims})</code>.
            Misturar dimensões na mesma tabela causa erro no INSERT.
          </p>
        )}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Entrada                                                                    */
/* -------------------------------------------------------------------------- */

function InputSection({
  values,
  onSet,
  mode,
}: {
  values: Record<string, unknown>;
  onSet: (patch: Record<string, unknown>) => void;
  mode: Mode;
}) {
  return (
    <div className="space-y-4">
      <SectionHeader
        title="Entrada"
        hint="Single: 1 texto → 1 vetor. Batch: vários textos → array de vetores (1 chamada, mais barato)."
      />

      <div className="grid grid-cols-2 gap-1.5">
        {(["single", "batch"] as Mode[]).map((m) => {
          const active = m === mode;
          return (
            <button
              key={m}
              type="button"
              onClick={() => {
                if (m === "single") onSet({ texts: undefined, text: readString(values.text) });
                else onSet({ text: undefined, texts: Array.isArray(values.texts) ? values.texts : [] });
              }}
              className={cn(
                "rounded-md border px-2.5 py-1.5 text-[12px] font-medium transition-colors",
                active ? "border-primary bg-primary/10 text-primary" : "border-border bg-background text-muted-foreground hover:border-primary/40",
              )}
            >
              {m === "single" ? "Single (text)" : "Batch (texts[])"}
            </button>
          );
        })}
      </div>

      {mode === "single" ? (
        <FieldRow
          label="Texto"
          hint="O texto a embedar. Geralmente {{steps.loader.chunk}} ou {{input.query}}."
        >
          <Textarea
            rows={6}
            spellCheck={false}
            value={readString(values.text)}
            onChange={(e) => onSet({ text: e.target.value })}
            className="font-mono text-xs"
            placeholder="{{input.query}}"
          />
        </FieldRow>
      ) : (
        <FieldRow
          label="Textos (JSON array)"
          hint="Array de strings. Geralmente {{steps.loader.chunks}}. Um vetor por item."
        >
          <Textarea
            rows={6}
            spellCheck={false}
            value={typeof values.texts === "string" ? values.texts : JSON.stringify(values.texts ?? [], null, 2)}
            onChange={(e) => {
              try {
                const parsed = e.target.value.trim() ? JSON.parse(e.target.value) : [];
                onSet({ texts: parsed });
              } catch {
                onSet({ texts: e.target.value });
              }
            }}
            className="font-mono text-xs"
            placeholder='["primeiro chunk", "segundo chunk"]'
          />
        </FieldRow>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Teste                                                                      */
/* -------------------------------------------------------------------------- */

function TestSection({
  workflowId,
  nodeId,
  values,
  provider,
}: {
  workflowId: string;
  nodeId?: string;
  values: Record<string, unknown>;
  provider: Provider;
}) {
  const [environmentId, setEnvironmentId] = useState<string | null>(null);
  const [inputText, setInputText] = useState("{}");
  const [inputErr, setInputErr] = useState<string | null>(null);
  const [quickText, setQuickText] = useState("");

  const envQuery = useQuery({
    queryKey: queryKeys.environments.list(),
    queryFn: () => environmentsApi.list(),
  });

  const mutation = useMutation({
    mutationFn: () => {
      let parsed: Record<string, unknown> = {};
      const t = inputText.trim();
      if (t) parsed = JSON.parse(t) as Record<string, unknown>;
      const cfg = quickText.trim() ? { ...values, text: quickText, texts: undefined } : values;
      return nodesApi.dryRunEmbeddings(workflowId, nodeId!, {
        config: cfg,
        input: parsed,
        environmentId,
      });
    },
  });

  if (!workflowId || !nodeId) {
    return <EmptyHint>Salve o workflow antes de testar — o teste depende do nodeId.</EmptyHint>;
  }

  function run() {
    setInputErr(null);
    const t = inputText.trim();
    if (t) {
      try {
        JSON.parse(t);
      } catch (err) {
        setInputErr((err as Error).message);
        return;
      }
    }
    mutation.mutate();
  }

  const result = mutation.data;

  return (
    <div className="space-y-3">
      <SectionHeader
        title="Disparar agora"
        hint={
          provider === "openai"
            ? "Usa OPENAI_API_KEY do environment selecionado. Sem environment → falha."
            : "Bate na baseUrl configurada com a apiKey resolvida do environment."
        }
      />

      <FieldRow label="Environment" hint="De onde vêm OPENAI_API_KEY / chaves do provider.">
        <Select
          value={environmentId ?? "__none__"}
          onValueChange={(v) => setEnvironmentId(v === "__none__" ? null : v)}
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue placeholder="Sem environment" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">— sem environment —</SelectItem>
            {envQuery.data?.map((e) => (
              <SelectItem key={e.id} value={e.id}>
                {e.name} <span className="ml-1 text-muted-foreground">({e.kind})</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FieldRow>

      <FieldRow
        label="Texto rápido (override do config)"
        hint="Se preenchido, sobrepõe `text`/`texts` do config — útil pra testar conectividade sem mexer no salvo."
      >
        <Textarea
          rows={3}
          spellCheck={false}
          className="font-mono text-[11px]"
          value={quickText}
          onChange={(e) => setQuickText(e.target.value)}
          placeholder="Hello world"
        />
      </FieldRow>

      <FieldRow label="Input simulado (JSON)" hint="Vira o {{input}} do template — só importa se o config referenciar {{input.X}}.">
        <Textarea
          rows={3}
          spellCheck={false}
          className="font-mono text-[11px]"
          value={inputText}
          onChange={(e) => {
            setInputText(e.target.value);
            if (inputErr) setInputErr(null);
          }}
        />
        {inputErr && <p className="text-[10px] text-destructive">JSON inválido: {inputErr}</p>}
      </FieldRow>

      <div className="flex justify-end">
        <Button size="sm" onClick={run} disabled={mutation.isPending}>
          {mutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          Gerar embedding
        </Button>
      </div>

      {mutation.isError && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-2 py-1.5">
          <p className="text-[11px] text-destructive">
            Falha de rede: {(mutation.error as Error).message}
          </p>
        </div>
      )}

      {result && !result.ok && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-2 py-1.5">
          <p className="text-[10px] font-medium text-destructive">Handler falhou</p>
          <p className="mt-0.5 break-words text-[11px] text-destructive/90">{result.error}</p>
          <p className="mt-1 text-[10px] text-muted-foreground">{result.durationMs}ms</p>
        </div>
      )}

      {result && result.ok && <ResultView output={result.output} durationMs={result.durationMs} />}
    </div>
  );
}

function ResultView({ output, durationMs }: { output: Record<string, unknown>; durationMs: number }) {
  const single = Array.isArray(output.embedding);
  const batch = Array.isArray(output.embeddings);
  const dims = typeof output.dimensions === "number" ? output.dimensions : 0;
  const model = readString(output.model, "—");
  const usage = output.usage as Record<string, unknown> | undefined;
  const tokens = typeof usage?.tokens === "number" ? (usage.tokens as number) : undefined;

  return (
    <div className="space-y-2 rounded-md border border-emerald-500/40 bg-emerald-500/5 p-2">
      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium text-emerald-600">
            {single ? "1 vetor" : batch ? `${(output.embeddings as unknown[]).length} vetores` : "ok"}
          </span>
          <span className="rounded border border-border bg-background px-1.5 py-0.5 font-mono text-[10px]">
            {dims}d
          </span>
          <span className="text-[10px] text-muted-foreground">model: <code className="font-mono">{model}</code></span>
          {tokens !== undefined && (
            <span className="text-[10px] text-muted-foreground">{tokens} tokens</span>
          )}
        </div>
        <span className="text-[10px] tabular-nums text-muted-foreground">{durationMs}ms</span>
      </div>

      {single && <VectorPreview vec={output.embedding as number[]} />}
      {batch && (
        <div className="space-y-1">
          {(output.embeddings as number[][]).slice(0, 3).map((v, i) => (
            <div key={i}>
              <p className="text-[10px] text-muted-foreground">[{i}]</p>
              <VectorPreview vec={v} />
            </div>
          ))}
          {(output.embeddings as number[][]).length > 3 && (
            <p className="text-[10px] text-muted-foreground">
              … +{(output.embeddings as number[][]).length - 3} vetor(es)
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function VectorPreview({ vec }: { vec: number[] }) {
  if (!vec || vec.length === 0) return <p className="text-[10px] text-muted-foreground">(vetor vazio)</p>;
  const head = vec.slice(0, 8).map((n) => n.toFixed(4)).join(", ");
  const norm = Math.sqrt(vec.reduce((s, n) => s + n * n, 0));
  return (
    <div className="rounded-md border border-border bg-background p-1.5">
      <p className="font-mono text-[10px] leading-snug">[{head}{vec.length > 8 && ", …"}]</p>
      <p className="mt-0.5 text-[10px] text-muted-foreground">‖v‖ = {norm.toFixed(4)}</p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Histórico                                                                  */
/* -------------------------------------------------------------------------- */

function HistorySection({ workflowId, nodeId }: { workflowId: string; nodeId?: string }) {
  const limit = 25;
  const query = useQuery({
    queryKey: queryKeys.workflowNodes.invocations(workflowId, nodeId ?? "", limit),
    queryFn: () => nodesApi.listInvocations(workflowId, nodeId!, limit),
    enabled: Boolean(workflowId && nodeId),
  });

  if (!workflowId || !nodeId) {
    return <EmptyHint>Salve o workflow antes de ver histórico.</EmptyHint>;
  }

  return (
    <div className="space-y-2">
      <SectionHeader title="Últimas execuções" hint={`As ${limit} chamadas mais recentes deste node em runs reais.`} />

      {query.isPending && (
        <div className="flex items-center gap-2 px-2 py-4 text-[11px] text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" /> Carregando…
        </div>
      )}

      {query.data && query.data.length === 0 && <EmptyHint>Nenhuma execução registrada ainda.</EmptyHint>}

      {query.data && query.data.length > 0 && (
        <div className="overflow-hidden rounded-md border border-border bg-background">
          <table className="w-full text-[11px]">
            <thead className="bg-muted/40 text-[10px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-2 py-1.5 text-left">Quando</th>
                <th className="px-2 py-1.5 text-left">Status</th>
                <th className="px-2 py-1.5 text-right">Duração</th>
                <th className="px-2 py-1.5 text-left">Resumo</th>
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

function InvocationRow({ inv }: { inv: NodeInvocation }) {
  const summary = useMemo(() => {
    if (inv.status === "failed" && inv.error) {
      const msg = (inv.error as Record<string, unknown>).message;
      return typeof msg === "string" ? msg : safeStringify(inv.error);
    }
    if (inv.output) {
      const out = inv.output as Record<string, unknown>;
      const dims = typeof out.dimensions === "number" ? `${out.dimensions}d` : "";
      if (Array.isArray(out.embeddings)) return `${out.embeddings.length} vetor(es) ${dims}`.trim();
      if (Array.isArray(out.embedding)) return `1 vetor ${dims}`.trim();
      return safeStringify(out).slice(0, 90);
    }
    return "—";
  }, [inv]);

  return (
    <tr className="border-t border-border/60">
      <td className="px-2 py-1.5 text-muted-foreground">{new Date(inv.createdAt).toLocaleString("pt-BR")}</td>
      <td className="px-2 py-1.5">
        <StatusBadge status={inv.status} />
      </td>
      <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">
        {inv.durationMs !== null ? `${inv.durationMs}ms` : "—"}
      </td>
      <td className="px-2 py-1.5 font-mono text-[10px] text-muted-foreground">{summary}</td>
    </tr>
  );
}

function StatusBadge({ status }: { status: NodeInvocation["status"] }) {
  const map: Record<NodeInvocation["status"], string> = {
    success: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
    failed: "border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-400",
    running: "border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-400",
    pending: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400",
    skipped: "border-border bg-muted text-muted-foreground",
    cancelled: "border-border bg-muted text-muted-foreground",
  };
  return (
    <span className={cn("rounded-md border px-1.5 py-0.5 font-mono text-[10px] uppercase", map[status])}>
      {status}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* Helpers visuais                                                            */
/* -------------------------------------------------------------------------- */

function SectionHeader({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="mb-3">
      <h3 className="text-sm font-semibold">{title}</h3>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function FieldRow({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string | null;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-[11px] font-medium">{label}</Label>
      {children}
      {error ? (
        <p className="text-[10px] text-destructive">{error}</p>
      ) : hint ? (
        <p className="text-[10px] text-muted-foreground">{hint}</p>
      ) : null}
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

function safeStringify(v: unknown): string {
  if (v === undefined || v === null) return "";
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}
