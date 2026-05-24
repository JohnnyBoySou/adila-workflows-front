/**
 * Painel dedicado pro nó `vector_store`. UI em seções:
 *
 *   Operação    — insert/search, campos dinâmicos
 *   Conexão     — connectionString (template) + tabela + schema esperado
 *   Teste       — dispara dry-run com environment selecionado
 *   Histórico   — últimas execuções deste node em runs reais
 *
 * Persiste em `values`:
 *   connectionString: string         — templatable, ex: {{env.DATABASE_VECTOR_STORE_URL}}
 *   table?: string                   — default "documents"
 *   operation: "insert" | "search"
 *
 *   insert:
 *     content: string
 *     embedding: number[]            — geralmente {{steps.embed.embedding}}
 *     metadata?: Record<string, unknown>
 *
 *   search:
 *     embedding: number[]
 *     topK?: number                  — default 5, max 100
 *     filter?: Record<string, unknown>
 */
import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Database,
  History,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Send,
  Settings2,
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

type Operation = "insert" | "search";

const OPERATIONS: { value: Operation; label: string; icon: typeof Plus; hint: string }[] = [
  { value: "insert", label: "INSERT — gravar documento", icon: Plus, hint: "Grava (content, embedding, metadata) na tabela." },
  { value: "search", label: "SEARCH — vizinhos mais próximos", icon: Search, hint: "Devolve os topK documentos mais similares ao embedding informado." },
];

const SECTIONS = [
  { id: "operation", label: "Operação", icon: Database },
  { id: "connection", label: "Conexão", icon: Settings2 },
  { id: "test", label: "Teste", icon: Send },
  { id: "history", label: "Histórico", icon: History },
] as const satisfies ReadonlyArray<SectionItem>;

type SectionId = (typeof SECTIONS)[number]["id"];

function readString(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}
function readNumber(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}
function readOperation(v: unknown): Operation {
  return v === "search" ? "search" : "insert";
}

export function VectorStorePanel({ values, onChange, onError, nodeId }: CustomPanelProps) {
  const [section, setSection] = useState<SectionId>("operation");
  const workflowId = useWorkflowId() ?? "";

  const op = readOperation(values.operation);
  const connectionString = readString(values.connectionString);
  const content = readString(values.content);

  const connMissing = connectionString.trim() === "";
  const contentMissing = op === "insert" && content.trim() === "";

  onError?.("connectionString", connMissing ? "Informe a connection string." : null);
  onError?.("content", contentMissing ? "Informe o conteúdo." : null);

  function set(patch: Record<string, unknown>) {
    onChange(patch);
  }

  return (
    <Sections sections={SECTIONS as unknown as SectionItem<SectionId>[]} value={section} onValueChange={setSection} ariaLabel="Seções do nó Vector Store">
      {section === "operation" && (
        <OperationSection op={op} values={values} onSet={set} contentMissing={contentMissing} />
      )}
      {section === "connection" && (
        <ConnectionSection values={values} onSet={set} connMissing={connMissing} />
      )}
      {section === "test" && (
        <TestSection workflowId={workflowId} nodeId={nodeId} values={values} />
      )}
      {section === "history" && (
        <HistorySection workflowId={workflowId} nodeId={nodeId} />
      )}
    </Sections>
  );
}

/* -------------------------------------------------------------------------- */
/* Operação                                                                   */
/* -------------------------------------------------------------------------- */

function OperationSection({
  op,
  values,
  onSet,
  contentMissing,
}: {
  op: Operation;
  values: Record<string, unknown>;
  onSet: (patch: Record<string, unknown>) => void;
  contentMissing: boolean;
}) {
  return (
    <div className="space-y-4">
      <SectionHeader title="Operação" hint="Insert escreve um documento; search busca os vizinhos mais próximos." />

      <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
        {OPERATIONS.map((o) => {
          const Icon = o.icon;
          const active = o.value === op;
          return (
            <button
              key={o.value}
              type="button"
              onClick={() => onSet({ operation: o.value })}
              className={cn(
                "flex items-start gap-2 rounded-md border px-2.5 py-2 text-left transition-colors",
                active
                  ? "border-primary bg-primary/10"
                  : "border-border bg-background hover:border-primary/40",
              )}
            >
              <Icon className={cn("mt-0.5 size-4 shrink-0", active ? "text-primary" : "text-muted-foreground")} />
              <div className="min-w-0">
                <p className={cn("text-[12px] font-medium", active && "text-primary")}>{o.label}</p>
                <p className="text-[10px] text-muted-foreground">{o.hint}</p>
              </div>
            </button>
          );
        })}
      </div>

      {op === "insert" ? (
        <>
          <FieldRow
            label="Conteúdo (content)"
            hint="Texto bruto do documento. Vai pra coluna `content`."
            error={contentMissing ? "Obrigatório." : null}
          >
            <Textarea
              rows={4}
              spellCheck={false}
              value={readString(values.content)}
              onChange={(e) => onSet({ content: e.target.value })}
              className="font-mono text-xs"
              placeholder="Documento a ser indexado…"
            />
          </FieldRow>

          <FieldRow
            label="Embedding"
            hint="Vetor de números — geralmente vem do nó embeddings: {{steps.embed.embedding}}."
          >
            <Input
              value={readString(values.embedding)}
              onChange={(e) => onSet({ embedding: e.target.value })}
              placeholder="{{steps.embed.embedding}}"
              className="font-mono text-xs"
            />
          </FieldRow>

          <FieldRow label="Metadata (JSON)" hint="Objeto livre — chave/valor que viram filtros no search.">
            <Textarea
              rows={3}
              spellCheck={false}
              value={typeof values.metadata === "string" ? values.metadata : safeStringify(values.metadata)}
              onChange={(e) => {
                try {
                  const parsed = e.target.value.trim() ? JSON.parse(e.target.value) : undefined;
                  onSet({ metadata: parsed });
                } catch {
                  onSet({ metadata: e.target.value });
                }
              }}
              className="font-mono text-xs"
              placeholder='{ "source": "manual", "tags": ["faq"] }'
            />
          </FieldRow>
        </>
      ) : (
        <>
          <FieldRow
            label="Embedding da query"
            hint="Vetor a comparar — geralmente {{steps.embed.embedding}} de um nó embeddings."
          >
            <Input
              value={readString(values.embedding)}
              onChange={(e) => onSet({ embedding: e.target.value })}
              placeholder="{{steps.embed.embedding}}"
              className="font-mono text-xs"
            />
          </FieldRow>

          <FieldRow label="Top K" hint="Quantos vizinhos retornar (1–100). Default 5.">
            <Input
              type="number"
              min={1}
              max={100}
              value={readNumber(values.topK) ?? ""}
              onChange={(e) => onSet({ topK: e.target.value === "" ? undefined : Number(e.target.value) })}
              className="font-mono text-xs"
              placeholder="5"
            />
          </FieldRow>

          <FieldRow label="Filtro por metadata (JSON)" hint="Match exato em metadata->>'chave'. Ex: { tags: 'faq' }.">
            <Textarea
              rows={2}
              spellCheck={false}
              value={typeof values.filter === "string" ? values.filter : safeStringify(values.filter)}
              onChange={(e) => {
                try {
                  const parsed = e.target.value.trim() ? JSON.parse(e.target.value) : undefined;
                  onSet({ filter: parsed });
                } catch {
                  onSet({ filter: e.target.value });
                }
              }}
              className="font-mono text-xs"
              placeholder='{ "source": "manual" }'
            />
          </FieldRow>
        </>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Conexão                                                                    */
/* -------------------------------------------------------------------------- */

function ConnectionSection({
  values,
  onSet,
  connMissing,
}: {
  values: Record<string, unknown>;
  onSet: (patch: Record<string, unknown>) => void;
  connMissing: boolean;
}) {
  const table = readString(values.table) || "documents";

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Conexão"
        hint="Aponte para um Postgres com a extensão pgvector instalada. Não pode ser o DB do app."
      />

      <FieldRow
        label="Connection string"
        hint="Recomendado usar {{env.DATABASE_VECTOR_STORE_URL}} pra não vazar credenciais na definition."
        error={connMissing ? "Obrigatório." : null}
      >
        <Input
          value={readString(values.connectionString)}
          onChange={(e) => onSet({ connectionString: e.target.value })}
          placeholder="{{env.DATABASE_VECTOR_STORE_URL}}"
          className="font-mono text-xs"
        />
      </FieldRow>

      <FieldRow label="Tabela" hint="Default `documents`. Nome deve ser identificador válido (letras/dígitos/_).">
        <Input
          value={readString(values.table)}
          onChange={(e) => onSet({ table: e.target.value })}
          placeholder="documents"
          className="font-mono text-xs"
        />
      </FieldRow>

      <div className="space-y-1.5 rounded-md border border-dashed border-border bg-muted/20 p-2.5">
        <p className="text-[11px] font-medium">Schema esperado da tabela</p>
        <pre className="overflow-x-auto rounded-md border border-border bg-background/60 p-2 font-mono text-[10px] leading-relaxed">
{`CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE "${table}" (
  id        bigserial PRIMARY KEY,
  content   text NOT NULL,
  embedding vector(1536) NOT NULL,   -- dim conforme o modelo (1536 = OpenAI ada-002)
  metadata  jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX ON "${table}" USING ivfflat (embedding vector_l2_ops) WITH (lists = 100);
CREATE INDEX ON "${table}" USING gin (metadata);`}
        </pre>
        <p className="text-[10px] text-muted-foreground">
          A dimensão (1536 acima) precisa bater com o modelo de embeddings — OpenAI ada-002 → 1536,
          BGE/MiniLM → 384, etc. Misturar dimensões causa erro no INSERT.
        </p>
      </div>
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
}: {
  workflowId: string;
  nodeId?: string;
  values: Record<string, unknown>;
}) {
  const [environmentId, setEnvironmentId] = useState<string | null>(null);
  const [inputText, setInputText] = useState('{\n  "embedding": []\n}');
  const [inputErr, setInputErr] = useState<string | null>(null);
  const [dim, setDim] = useState(1536);

  const envQuery = useQuery({
    queryKey: queryKeys.environments.list(),
    queryFn: () => environmentsApi.list(),
  });

  const mutation = useMutation({
    mutationFn: () => {
      let parsed: Record<string, unknown> = {};
      const t = inputText.trim();
      if (t) parsed = JSON.parse(t) as Record<string, unknown>;
      return nodesApi.dryRunVector(workflowId, nodeId!, {
        config: values,
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

  function fillRandomEmbedding() {
    const vec = Array.from({ length: dim }, () => Math.round((Math.random() * 2 - 1) * 10000) / 10000);
    const next = { ...(safeParse(inputText) ?? {}), embedding: vec };
    setInputText(JSON.stringify(next, null, 2));
  }

  const result = mutation.data;
  const op = readOperation(values.operation);

  return (
    <div className="space-y-3">
      <SectionHeader
        title="Disparar agora"
        hint="Executa o handler sem persistir step. Pra testar conectividade rápido, gere um embedding aleatório no dim correto."
      />

      <FieldRow label="Environment" hint="De onde vem DATABASE_VECTOR_STORE_URL. Sem environment → roda com env vazio.">
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

      <FieldRow label="Input simulado (JSON)" hint="Vira o {{input}} do template. Use embedding aqui se a config referenciar {{input.embedding}}.">
        <Textarea
          rows={5}
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

      <div className="flex items-center justify-between gap-2 rounded-md border border-dashed border-border bg-muted/20 p-2">
        <div className="flex items-center gap-1.5">
          <Label className="text-[10px] text-muted-foreground">Vetor aleatório dim</Label>
          <Input
            type="number"
            min={1}
            max={4096}
            value={dim}
            onChange={(e) => setDim(Math.max(1, Math.min(4096, Number(e.target.value) || 0)))}
            className="h-7 w-20 font-mono text-[11px]"
          />
        </div>
        <Button size="sm" variant="outline" onClick={fillRandomEmbedding} className="h-7 text-[11px]">
          Preencher embedding no input
        </Button>
      </div>

      <div className="flex justify-end">
        <Button size="sm" onClick={run} disabled={mutation.isPending}>
          {mutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          Executar
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

      {result && result.ok && <ResultView output={result.output} durationMs={result.durationMs} operation={op} />}
    </div>
  );
}

function ResultView({
  output,
  durationMs,
  operation,
}: {
  output: Record<string, unknown>;
  durationMs: number;
  operation: Operation;
}) {
  if (operation === "search") {
    const matches = Array.isArray(output.matches) ? (output.matches as Array<Record<string, unknown>>) : [];
    return (
      <div className="space-y-2 rounded-md border border-emerald-500/40 bg-emerald-500/5 p-2">
        <div className="flex items-center justify-between text-[11px]">
          <span className="font-medium text-emerald-600">{matches.length} vizinho(s)</span>
          <span className="text-[10px] tabular-nums text-muted-foreground">{durationMs}ms</span>
        </div>
        {matches.length === 0 ? (
          <p className="px-1 text-[10px] text-muted-foreground">(sem matches — tabela vazia ou filtro não bateu)</p>
        ) : (
          <div className="max-h-80 overflow-auto rounded-md border border-border bg-background">
            <table className="w-full text-[11px]">
              <thead className="bg-muted/40 text-[10px] uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-2 py-1 text-left">id</th>
                  <th className="px-2 py-1 text-right">distância</th>
                  <th className="px-2 py-1 text-left">content</th>
                  <th className="px-2 py-1 text-left">metadata</th>
                </tr>
              </thead>
              <tbody>
                {matches.map((m, i) => {
                  const content = typeof m.content === "string" ? m.content : "";
                  const meta = m.metadata;
                  return (
                    <tr key={i} className="border-t border-border/60 align-top">
                      <td className="px-2 py-1 font-mono text-[10px]">{String(m.id ?? "")}</td>
                      <td className="px-2 py-1 text-right tabular-nums text-muted-foreground">
                        {typeof m.distance === "number" ? m.distance.toFixed(4) : "—"}
                      </td>
                      <td className="px-2 py-1 max-w-[280px] truncate">{content}</td>
                      <td className="px-2 py-1 font-mono text-[10px] text-muted-foreground">
                        {meta && Object.keys(meta as object).length > 0 ? safeStringify(meta) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded-md border border-emerald-500/40 bg-emerald-500/5 p-2">
      <div className="flex items-center justify-between text-[11px]">
        <span className="font-medium text-emerald-600">
          Inserido {typeof output.id !== "undefined" && <>· id <code className="font-mono">{String(output.id)}</code></>}
        </span>
        <span className="text-[10px] tabular-nums text-muted-foreground">{durationMs}ms</span>
      </div>
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
      <div className="flex items-start justify-between gap-2">
        <SectionHeader title="Últimas execuções" hint={`As ${limit} chamadas mais recentes deste node em runs reais.`} />
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
      if (Array.isArray(out.matches)) return `${out.matches.length} match(es)`;
      if (out.inserted === true) return `inserted ${out.id ?? ""}`;
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

function safeParse(s: string): Record<string, unknown> | null {
  try {
    const v = JSON.parse(s);
    return v && typeof v === "object" ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}
