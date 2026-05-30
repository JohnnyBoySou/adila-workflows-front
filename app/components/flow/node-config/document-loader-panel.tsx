/**
 * Painel dedicado pro nó `document_loader`. Seções:
 *
 *   Entrada     — texto a chunkar (direto ou via template)
 *   Chunking    — chunkSize / chunkOverlap com preview visual + heurísticas
 *   Metadata    — KV anexado a cada chunk
 *   Teste       — dispara dry-run e mostra preview real dos chunks com gradient
 *   Histórico   — últimas execuções do node em runs reais
 *
 * Persiste em `values`:
 *   text: string                       — templatable
 *   chunkSize?: number                  — default 1000, máx aplicado pelo handler
 *   chunkOverlap?: number               — default 200, < chunkSize
 *   metadata?: Record<string, unknown>
 */
import { useMemo, useState } from "react";
import { useFieldError } from "./use-field-error";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Eye,
  FileText,
  History,
  Loader2,
  Scissors,
  Send,
  Tag,
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

const DEFAULT_CHUNK_SIZE = 1000;
const DEFAULT_OVERLAP = 200;

const SECTIONS = [
  { id: "input", label: "Entrada", icon: FileText },
  { id: "chunking", label: "Chunking", icon: Scissors },
  { id: "metadata", label: "Metadata", icon: Tag },
  { id: "test", label: "Preview", icon: Eye },
  { id: "history", label: "Histórico", icon: History },
] as const satisfies ReadonlyArray<SectionItem>;

type SectionId = (typeof SECTIONS)[number]["id"];

function readString(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}
function readNumber(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

export function DocumentLoaderPanel({ values, onChange, onError, nodeId }: CustomPanelProps) {
  const [section, setSection] = useState<SectionId>("input");
  const workflowId = useWorkflowId() ?? "";

  const text = readString(values.text);
  const chunkSize = readNumber(values.chunkSize, DEFAULT_CHUNK_SIZE);
  const overlap = readNumber(values.chunkOverlap, DEFAULT_OVERLAP);

  const textMissing = text.trim() === "";
  const overlapInvalid = overlap >= chunkSize;

  useFieldError(onError, "text", textMissing ? "Informe o texto." : null);
  useFieldError(onError, "chunkOverlap", overlapInvalid ? "Overlap precisa ser menor que chunkSize." : null);

  function set(patch: Record<string, unknown>) {
    onChange(patch);
  }

  return (
    <Sections
      sections={SECTIONS as unknown as SectionItem<SectionId>[]}
      value={section}
      onValueChange={setSection}
      ariaLabel="Seções do nó Document Loader"
    >
      {section === "input" && <InputSection values={values} onSet={set} textMissing={textMissing} />}
      {section === "chunking" && (
        <ChunkingSection values={values} onSet={set} chunkSize={chunkSize} overlap={overlap} overlapInvalid={overlapInvalid} text={text} />
      )}
      {section === "metadata" && <MetadataSection values={values} onSet={set} />}
      {section === "test" && <TestSection workflowId={workflowId} nodeId={nodeId} values={values} />}
      {section === "history" && <HistorySection workflowId={workflowId} nodeId={nodeId} />}
    </Sections>
  );
}

/* -------------------------------------------------------------------------- */
/* Entrada                                                                    */
/* -------------------------------------------------------------------------- */

function InputSection({
  values,
  onSet,
  textMissing,
}: {
  values: Record<string, unknown>;
  onSet: (patch: Record<string, unknown>) => void;
  textMissing: boolean;
}) {
  const text = readString(values.text);
  const charCount = text.length;
  // Aproximação grosseira: ~4 chars por token (válida pra inglês/português curto).
  const approxTokens = Math.round(charCount / 4);

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Entrada"
        hint="Texto bruto a chunkar. Para PDFs/Office, pré-extraia o texto num nó `code` antes."
      />

      <FieldRow
        label="Texto"
        hint="Direto ou via template — ex: {{steps.fetch.body}}, {{input.transcript}}, {{steps.code.text}}."
        error={textMissing ? "Obrigatório." : null}
      >
        <Textarea
          rows={10}
          spellCheck={false}
          value={text}
          onChange={(e) => onSet({ text: e.target.value })}
          className="font-mono text-xs"
          placeholder="{{steps.fetch.body}}"
        />
        <div className="flex justify-between text-[10px] tabular-nums text-muted-foreground">
          <span>{charCount.toLocaleString("pt-BR")} chars</span>
          <span>~{approxTokens.toLocaleString("pt-BR")} tokens (estimado, 4 chars/token)</span>
        </div>
      </FieldRow>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Chunking                                                                   */
/* -------------------------------------------------------------------------- */

const PRESETS: { label: string; size: number; overlap: number; note: string }[] = [
  { label: "RAG genérico", size: 1000, overlap: 200, note: "Padrão LangChain. Bom default." },
  { label: "RAG fino", size: 500, overlap: 100, note: "Trechos curtos, busca mais precisa." },
  { label: "RAG longo", size: 2000, overlap: 400, note: "Contextos grandes, menos chunks." },
  { label: "Código", size: 1500, overlap: 0, note: "Sem overlap pra preservar bordas." },
];

function ChunkingSection({
  values,
  onSet,
  chunkSize,
  overlap,
  overlapInvalid,
  text,
}: {
  values: Record<string, unknown>;
  onSet: (patch: Record<string, unknown>) => void;
  chunkSize: number;
  overlap: number;
  overlapInvalid: boolean;
  text: string;
}) {
  const stride = Math.max(1, chunkSize - overlap);
  const projected = text.length === 0 ? 0 : Math.ceil(text.length / stride);
  const overlapPct = chunkSize > 0 ? Math.round((overlap / chunkSize) * 100) : 0;

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Chunking"
        hint="Tamanho do chunk em chars + overlap (sobreposição entre chunks adjacentes pra preservar contexto entre fronteiras)."
      />

      <div className="grid grid-cols-2 gap-3">
        <FieldRow label="Chunk size (chars)" hint="Tamanho do pedaço.">
          <Input
            type="number"
            min={1}
            value={readNumber(values.chunkSize, DEFAULT_CHUNK_SIZE)}
            onChange={(e) => onSet({ chunkSize: Number(e.target.value) || DEFAULT_CHUNK_SIZE })}
            className="font-mono text-xs"
          />
        </FieldRow>
        <FieldRow
          label="Overlap (chars)"
          hint="Quantos chars do chunk N aparecem também no N+1."
          error={overlapInvalid ? "Precisa ser < chunkSize." : null}
        >
          <Input
            type="number"
            min={0}
            value={readNumber(values.chunkOverlap, DEFAULT_OVERLAP)}
            onChange={(e) => onSet({ chunkOverlap: Number(e.target.value) || 0 })}
            className="font-mono text-xs"
          />
        </FieldRow>
      </div>

      <div className="space-y-1.5 rounded-md border border-dashed border-border bg-muted/20 p-2.5">
        <p className="text-[11px] font-medium">Projeção</p>
        <div className="grid grid-cols-3 gap-2 text-center">
          <Stat label="Chunks previstos" value={projected.toLocaleString("pt-BR")} />
          <Stat label="Stride efetivo" value={`${stride} chars`} />
          <Stat label="Overlap %" value={`${overlapPct}%`} />
        </div>
        <OverlapDiagram chunkSize={chunkSize} overlap={overlap} />
      </div>

      <div className="space-y-1.5">
        <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Presets</Label>
        <div className="grid grid-cols-2 gap-1.5 md:grid-cols-4">
          {PRESETS.map((p) => {
            const active = p.size === chunkSize && p.overlap === overlap;
            return (
              <button
                key={p.label}
                type="button"
                onClick={() => onSet({ chunkSize: p.size, chunkOverlap: p.overlap })}
                className={cn(
                  "rounded-md border px-2 py-1.5 text-left transition-colors",
                  active ? "border-primary bg-primary/10" : "border-border bg-background hover:border-primary/40",
                )}
              >
                <p className={cn("text-[11px] font-medium", active && "text-primary")}>{p.label}</p>
                <p className="font-mono text-[10px] text-muted-foreground">
                  {p.size} / {p.overlap}
                </p>
                <p className="mt-0.5 text-[10px] text-muted-foreground">{p.note}</p>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-background px-1 py-1.5">
      <p className="font-mono text-[13px] tabular-nums">{value}</p>
      <p className="text-[9px] uppercase tracking-wide text-muted-foreground">{label}</p>
    </div>
  );
}

function OverlapDiagram({ chunkSize, overlap }: { chunkSize: number; overlap: number }) {
  if (chunkSize <= 0) return null;
  const overlapPct = Math.min(100, Math.max(0, (overlap / chunkSize) * 100));
  return (
    <div className="space-y-1 pt-1">
      <p className="text-[10px] text-muted-foreground">Sobreposição entre chunks adjacentes:</p>
      <div className="relative h-5 rounded border border-border bg-background">
        <div className="absolute inset-y-0 left-0 w-1/2 rounded-l bg-sky-500/30" />
        <div className="absolute inset-y-0 right-0 w-1/2 rounded-r bg-emerald-500/30" />
        <div
          className="absolute inset-y-0 left-1/2 -translate-x-1/2 rounded bg-amber-500/60"
          style={{ width: `${overlapPct / 2}%` }}
        />
        <div className="absolute inset-0 flex items-center justify-between px-1.5 font-mono text-[9px]">
          <span className="text-sky-700 dark:text-sky-300">chunk N</span>
          <span className="text-emerald-700 dark:text-emerald-300">chunk N+1</span>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Metadata                                                                   */
/* -------------------------------------------------------------------------- */

function MetadataSection({
  values,
  onSet,
}: {
  values: Record<string, unknown>;
  onSet: (patch: Record<string, unknown>) => void;
}) {
  const meta =
    typeof values.metadata === "object" && values.metadata !== null
      ? (values.metadata as Record<string, unknown>)
      : {};
  const entries = Object.entries(meta);

  function setKey(oldKey: string, newKey: string) {
    const next: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(meta)) next[k === oldKey ? newKey : k] = v;
    onSet({ metadata: next });
  }
  function setValue(key: string, val: string) {
    onSet({ metadata: { ...meta, [key]: val } });
  }
  function remove(key: string) {
    const next = { ...meta };
    delete next[key];
    onSet({ metadata: next });
  }
  function add() {
    let i = 1;
    let k = "key";
    while (k in meta) {
      i++;
      k = `key${i}`;
    }
    onSet({ metadata: { ...meta, [k]: "" } });
  }

  return (
    <div className="space-y-3">
      <SectionHeader
        title="Metadata por chunk"
        hint="Cada chunk gerado vai conter este objeto. Suporta templates ({{input.source}}, etc) que são resolvidos por chunk."
      />

      {entries.length === 0 ? (
        <EmptyHint>Nenhum metadado. Use o botão abaixo pra adicionar.</EmptyHint>
      ) : (
        <div className="space-y-1.5">
          {entries.map(([k, v]) => (
            <div key={k} className="flex items-center gap-1.5">
              <Input
                value={k}
                onChange={(e) => setKey(k, e.target.value)}
                className="h-7 max-w-[140px] font-mono text-xs"
                placeholder="source"
              />
              <span className="text-muted-foreground">:</span>
              <Input
                value={typeof v === "string" ? v : JSON.stringify(v)}
                onChange={(e) => setValue(k, e.target.value)}
                className="h-7 flex-1 font-mono text-xs"
                placeholder='"meu-doc"'
              />
              <Button size="sm" variant="ghost" onClick={() => remove(k)} className="h-7 px-2 text-[11px]">
                ×
              </Button>
            </div>
          ))}
        </div>
      )}

      <Button size="sm" variant="outline" onClick={add} className="h-7 text-[11px]">
        + adicionar campo
      </Button>

      <p className="rounded-md border border-dashed border-border bg-muted/20 px-2 py-1.5 text-[10px] text-muted-foreground">
        Dica: anexe <code className="font-mono">source</code> e <code className="font-mono">chunkIndex</code> pra
        depois filtrar no vector_store via <code className="font-mono">filter: {`{ source: "X" }`}</code>.
      </p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Preview / Teste                                                            */
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
  const [inputText, setInputText] = useState("{}");
  const [inputErr, setInputErr] = useState<string | null>(null);

  const envQuery = useQuery({
    queryKey: queryKeys.environments.list(),
    queryFn: () => environmentsApi.list(),
  });

  const mutation = useMutation({
    mutationFn: () => {
      let parsed: Record<string, unknown> = {};
      const t = inputText.trim();
      if (t) parsed = JSON.parse(t) as Record<string, unknown>;
      return nodesApi.dryRunDocumentLoader(workflowId, nodeId!, {
        config: values,
        input: parsed,
        environmentId,
      });
    },
  });

  if (!workflowId || !nodeId) {
    return <EmptyHint>Salve o workflow antes de rodar preview — depende do nodeId.</EmptyHint>;
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
        title="Preview do chunking"
        hint="Roda o handler de verdade com o texto/template configurado e mostra os chunks resultantes."
      />

      <FieldRow label="Environment (opcional)" hint="Só importa se o texto usar {{env.X}}. Para texto fixo, deixe em branco.">
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

      <FieldRow label="Input simulado (JSON)" hint="Útil se o texto vier via {{input.X}}.">
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
          Gerar chunks
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

      {result && result.ok && <ChunksView output={result.output} durationMs={result.durationMs} />}
    </div>
  );
}

type Chunk = { content: string; index: number; metadata: Record<string, unknown> };

function ChunksView({ output, durationMs }: { output: Record<string, unknown>; durationMs: number }) {
  const chunks = (Array.isArray(output.chunks) ? output.chunks : []) as Chunk[];
  const sizes = chunks.map((c) => c.content.length);
  const total = sizes.reduce((s, n) => s + n, 0);
  const avg = sizes.length ? Math.round(total / sizes.length) : 0;
  const min = sizes.length ? Math.min(...sizes) : 0;
  const max = sizes.length ? Math.max(...sizes) : 0;

  return (
    <div className="space-y-2 rounded-md border border-emerald-500/40 bg-emerald-500/5 p-2">
      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium text-emerald-600">{chunks.length} chunk(s)</span>
          <span className="text-[10px] text-muted-foreground">avg {avg} · min {min} · max {max} chars</span>
        </div>
        <span className="text-[10px] tabular-nums text-muted-foreground">{durationMs}ms</span>
      </div>

      {chunks.length === 0 ? (
        <p className="px-1 text-[10px] text-muted-foreground">(0 chunks — texto vazio?)</p>
      ) : (
        <>
          <SizeBars sizes={sizes} />
          <div className="max-h-80 space-y-1.5 overflow-auto pr-1">
            {chunks.slice(0, 20).map((c) => (
              <ChunkCard key={c.index} chunk={c} />
            ))}
            {chunks.length > 20 && (
              <p className="px-1 text-[10px] text-muted-foreground">
                … +{chunks.length - 20} chunk(s) não exibido(s)
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function SizeBars({ sizes }: { sizes: number[] }) {
  const max = Math.max(...sizes, 1);
  return (
    <div className="flex h-8 items-end gap-px overflow-x-auto rounded border border-border bg-background p-1">
      {sizes.map((s, i) => (
        <div
          key={i}
          title={`#${i}: ${s} chars`}
          className="w-1 shrink-0 rounded-sm bg-primary/60"
          style={{ height: `${(s / max) * 100}%` }}
        />
      ))}
    </div>
  );
}

function ChunkCard({ chunk }: { chunk: Chunk }) {
  const preview =
    chunk.content.length > 240 ? chunk.content.slice(0, 240) + "…" : chunk.content;
  const metaEntries = Object.entries(chunk.metadata ?? {});
  return (
    <div className="rounded-md border border-border bg-background p-1.5">
      <div className="flex items-center justify-between gap-2 text-[10px]">
        <span className="font-mono font-medium">#{chunk.index}</span>
        <span className="tabular-nums text-muted-foreground">{chunk.content.length} chars</span>
      </div>
      <p className="mt-1 whitespace-pre-wrap break-words font-mono text-[10px] leading-snug">{preview}</p>
      {metaEntries.length > 0 && (
        <p className="mt-1 font-mono text-[9px] text-muted-foreground">
          {metaEntries.map(([k, v]) => `${k}=${typeof v === "string" ? v : JSON.stringify(v)}`).join(" · ")}
        </p>
      )}
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
      return typeof msg === "string" ? msg : JSON.stringify(inv.error);
    }
    if (inv.output) {
      const out = inv.output as Record<string, unknown>;
      if (Array.isArray(out.chunks)) return `${out.chunks.length} chunk(s)`;
      return JSON.stringify(out).slice(0, 90);
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
