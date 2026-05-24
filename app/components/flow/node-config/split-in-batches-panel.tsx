/**
 * Painel dedicado pro nó `split_in_batches`. Seções:
 *
 *   Coleção    — items (template ou array literal) + batchSize
 *   Fluxo      — explicação visual das arestas `loop` e `done`
 *   Teste      — simula UMA iteração (cursor=0) mostrando batch corrente
 *   Histórico  — últimas execuções no run real
 *
 * Persiste em `values`:
 *   items: unknown[] | string (template)
 *   batchSize?: number  — default 1
 */
import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowRight, History, Layers, Loader2, Repeat, Send, Workflow } from "lucide-react";

import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Sections, type SectionItem } from "~/components/ui/sections";
import { Textarea } from "~/components/ui/textarea";
import { cn } from "~/lib/utils";
import { queryKeys } from "~/lib/query-keys";
import * as nodesApi from "~/services/workflow-nodes";
import type { NodeInvocation } from "~/services/workflow-nodes";

import { useWorkflowId } from "../workflow-context";
import type { CustomPanelProps } from "./types";

const SECTIONS = [
  { id: "items", label: "Coleção", icon: Layers },
  { id: "flow", label: "Fluxo", icon: Workflow },
  { id: "test", label: "Teste", icon: Send },
  { id: "history", label: "Histórico", icon: History },
] as const satisfies ReadonlyArray<SectionItem>;

type SectionId = (typeof SECTIONS)[number]["id"];

function readString(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}
function readNumber(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

export function SplitInBatchesPanel({ values, onChange, onError, nodeId }: CustomPanelProps) {
  const [section, setSection] = useState<SectionId>("items");
  const workflowId = useWorkflowId() ?? "";

  const itemsRaw = values.items;
  const itemsMissing =
    (typeof itemsRaw === "string" ? itemsRaw.trim() === "" : !Array.isArray(itemsRaw) || itemsRaw.length === 0) &&
    !Array.isArray(itemsRaw);

  onError?.("items", itemsMissing ? "Informe a coleção." : null);

  function set(patch: Record<string, unknown>) {
    onChange(patch);
  }

  return (
    <Sections
      sections={SECTIONS as unknown as SectionItem<SectionId>[]}
      value={section}
      onValueChange={setSection}
      ariaLabel="Seções do nó Split in Batches"
    >
      {section === "items" && <ItemsSection values={values} onSet={set} itemsMissing={itemsMissing} />}
      {section === "flow" && <FlowSection batchSize={readNumber(values.batchSize, 1)} />}
      {section === "test" && <TestSection workflowId={workflowId} nodeId={nodeId} values={values} />}
      {section === "history" && <HistorySection workflowId={workflowId} nodeId={nodeId} />}
    </Sections>
  );
}

/* -------------------------------------------------------------------------- */
/* Items                                                                      */
/* -------------------------------------------------------------------------- */

function ItemsSection({
  values,
  onSet,
  itemsMissing,
}: {
  values: Record<string, unknown>;
  onSet: (patch: Record<string, unknown>) => void;
  itemsMissing: boolean;
}) {
  const items = values.items;
  const isTemplate = typeof items === "string";
  const mode: "template" | "literal" = isTemplate ? "template" : "literal";

  return (
    <div className="space-y-4">
      <SectionHeader title="Coleção a iterar" hint="Pode ser um template ({{steps.X.rows}}) ou um array literal." />

      <div className="grid grid-cols-2 gap-1.5">
        {(["template", "literal"] as const).map((m) => {
          const active = m === mode;
          return (
            <button
              key={m}
              type="button"
              onClick={() => onSet({ items: m === "template" ? "{{steps.fetch.rows}}" : [] })}
              className={cn(
                "rounded-md border px-2.5 py-1.5 text-[12px] font-medium transition-colors",
                active ? "border-primary bg-primary/10 text-primary" : "border-border bg-background text-muted-foreground hover:border-primary/40",
              )}
            >
              {m === "template" ? "Template ({{…}})" : "Array literal (JSON)"}
            </button>
          );
        })}
      </div>

      {isTemplate ? (
        <FieldRow
          label="Template de items"
          hint="Tem que resolver pra array. Ex: {{steps.queryDb.rows}}, {{input.batch}}, {{vars.todo}}."
          error={itemsMissing ? "Obrigatório." : null}
        >
          <Input
            value={readString(values.items)}
            onChange={(e) => onSet({ items: e.target.value })}
            placeholder="{{steps.fetch.rows}}"
            className="font-mono text-xs"
          />
        </FieldRow>
      ) : (
        <FieldRow label="Array literal (JSON)" hint="Útil pra desenvolver/testar com dados fixos.">
          <Textarea
            rows={6}
            spellCheck={false}
            value={Array.isArray(items) ? JSON.stringify(items, null, 2) : "[]"}
            onChange={(e) => {
              try {
                const parsed = JSON.parse(e.target.value);
                if (Array.isArray(parsed)) onSet({ items: parsed });
              } catch {
                /* deixa o textarea local — não persiste até virar JSON válido */
              }
            }}
            className="font-mono text-xs"
            placeholder='["a", "b", "c"]'
          />
        </FieldRow>
      )}

      <FieldRow
        label="Batch size"
        hint="Quantos items por iteração. Default 1 = um por vez. Limite do array: 10.000."
      >
        <Input
          type="number"
          min={1}
          value={readNumber(values.batchSize, 1)}
          onChange={(e) => onSet({ batchSize: Number(e.target.value) || 1 })}
          className="font-mono text-xs"
        />
      </FieldRow>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Fluxo (visualização)                                                       */
/* -------------------------------------------------------------------------- */

function FlowSection({ batchSize }: { batchSize: number }) {
  return (
    <div className="space-y-3">
      <SectionHeader
        title="Como o nó se comporta"
        hint="Cada visita ao nó emite UMA aresta: `loop` enquanto há items, `done` no fim."
      />

      <div className="space-y-2 rounded-md border border-dashed border-border bg-muted/20 p-3">
        <div className="flex items-center gap-2 text-[11px]">
          <div className="rounded border border-border bg-background px-2 py-1 font-mono">split_in_batches</div>
          <ArrowRight className="size-3.5 text-emerald-600" />
          <span className="rounded border border-emerald-500/40 bg-emerald-500/10 px-1.5 py-0.5 font-mono text-emerald-700 dark:text-emerald-400">
            loop
          </span>
          <span className="text-muted-foreground">→ processa batch (size {batchSize})</span>
        </div>
        <div className="flex items-center gap-2 text-[11px]">
          <div className="rounded border border-border bg-background px-2 py-1 font-mono">split_in_batches</div>
          <ArrowRight className="size-3.5 text-sky-600" />
          <span className="rounded border border-sky-500/40 bg-sky-500/10 px-1.5 py-0.5 font-mono text-sky-700 dark:text-sky-400">
            done
          </span>
          <span className="text-muted-foreground">→ saída final do loop</span>
        </div>
      </div>

      <div className="space-y-1.5 rounded-md border border-dashed border-border bg-muted/20 p-3">
        <p className="text-[11px] font-medium">Pattern de uso</p>
        <pre className="overflow-x-auto rounded-md border border-border bg-background/60 p-2 font-mono text-[10px] leading-relaxed">
{`fetch  →  split_in_batches  ──loop──→  process_item  ──→  back_to_split
                       │
                       └──done──→  finalize`}
        </pre>
        <p className="text-[10px] text-muted-foreground">
          A aresta `loop` deve voltar pra trás (criar ciclo) — o engine reativa o
          <code className="mx-0.5 font-mono">split_in_batches</code> com o cursor já avançado.
          O array é resolvido <strong>uma vez só</strong> na primeira visita.
        </p>
      </div>

      <div className="space-y-1 rounded-md border border-amber-500/40 bg-amber-500/5 p-2 text-[10px]">
        <p className="font-medium text-amber-700 dark:text-amber-400">⚠️ Output por iteração</p>
        <pre className="font-mono leading-relaxed text-muted-foreground">
{`{
  batch:      [...],      // os items desta iteração
  batchIndex: 0,          // índice do batch (0, 1, 2, ...)
  cursor:     ${batchSize}, // próximo cursor
  total:      N,          // tamanho total do array original
  done:       false       // true só na última (aresta "done")
}`}
        </pre>
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
  const [inputText, setInputText] = useState("{}");
  const [stepsText, setStepsText] = useState("{}");
  const [parseErr, setParseErr] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () => {
      const input = JSON.parse(inputText || "{}");
      const steps = JSON.parse(stepsText || "{}");
      return nodesApi.dryRunSplit(workflowId, nodeId!, { config: values, input, steps });
    },
  });

  if (!workflowId || !nodeId) {
    return <EmptyHint>Salve o workflow antes de testar.</EmptyHint>;
  }

  function run() {
    setParseErr(null);
    try {
      JSON.parse(inputText || "{}");
      JSON.parse(stepsText || "{}");
    } catch (err) {
      setParseErr((err as Error).message);
      return;
    }
    mutation.mutate();
  }

  const result = mutation.data;

  return (
    <div className="space-y-3">
      <SectionHeader
        title="Simular 1 iteração"
        hint="Dry-run começa do cursor=0 — você vê só o primeiro batch. Pra simular o loop inteiro use o run real."
      />

      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        <FieldRow label="input (JSON)" hint="Se items vier de {{input.X}}.">
          <Textarea
            rows={5}
            spellCheck={false}
            className="font-mono text-[11px]"
            value={inputText}
            onChange={(e) => {
              setInputText(e.target.value);
              if (parseErr) setParseErr(null);
            }}
          />
        </FieldRow>
        <FieldRow label="steps (JSON)" hint="Mocks de upstream — { nodeId: { rows: [...] } }.">
          <Textarea
            rows={5}
            spellCheck={false}
            className="font-mono text-[11px]"
            value={stepsText}
            onChange={(e) => {
              setStepsText(e.target.value);
              if (parseErr) setParseErr(null);
            }}
          />
        </FieldRow>
      </div>

      {parseErr && <p className="text-[10px] text-destructive">JSON inválido: {parseErr}</p>}

      <div className="flex justify-end">
        <Button size="sm" onClick={run} disabled={mutation.isPending}>
          {mutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          Executar 1 iteração
        </Button>
      </div>

      {result && !result.ok && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-2 py-1.5">
          <p className="text-[10px] font-medium text-destructive">Handler falhou</p>
          <p className="mt-0.5 break-words font-mono text-[11px] text-destructive/90">{result.error}</p>
        </div>
      )}

      {result && result.ok && (
        <div className="space-y-1 rounded-md border border-emerald-500/40 bg-emerald-500/5 p-2">
          <div className="flex items-center justify-between text-[11px]">
            <span className="font-medium text-emerald-600">
              <Repeat className="mr-1 inline size-3" />
              {result.nextLabel === "done" ? "Aresta: done" : "Aresta: loop"}
            </span>
            <span className="text-[10px] tabular-nums text-muted-foreground">{result.durationMs}ms</span>
          </div>
          <pre className="max-h-64 overflow-auto rounded-md border border-border bg-background p-2 font-mono text-[10px] leading-relaxed">
            {safeStringify(result.output)}
          </pre>
        </div>
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

  if (!workflowId || !nodeId) return <EmptyHint>Salve o workflow antes de ver histórico.</EmptyHint>;

  return (
    <div className="space-y-2">
      <SectionHeader title="Últimas iterações" hint="Cada visita ao nó vira um step. Reconstrói o loop completo." />

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
                <th className="px-2 py-1.5 text-right">Cursor</th>
                <th className="px-2 py-1.5 text-left">Resumo</th>
              </tr>
            </thead>
            <tbody>
              {query.data.map((inv) => (
                <SplitRow key={inv.id} inv={inv} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function SplitRow({ inv }: { inv: NodeInvocation }) {
  const summary = useMemo(() => {
    if (inv.status === "failed" && inv.error) {
      const msg = (inv.error as Record<string, unknown>).message;
      return { txt: typeof msg === "string" ? msg : safeStringify(inv.error), cursor: "—" };
    }
    if (inv.output) {
      const out = inv.output as Record<string, unknown>;
      if (out.done === true) return { txt: `done · total ${out.total}`, cursor: String(out.total ?? "—") };
      const batch = Array.isArray(out.batch) ? out.batch.length : 0;
      return {
        txt: `batch #${out.batchIndex ?? "—"} · ${batch} item(s)`,
        cursor: `${out.cursor ?? "—"}/${out.total ?? "—"}`,
      };
    }
    return { txt: "—", cursor: "—" };
  }, [inv]);

  return (
    <tr className="border-t border-border/60">
      <td className="px-2 py-1.5 text-muted-foreground">{new Date(inv.createdAt).toLocaleString("pt-BR")}</td>
      <td className="px-2 py-1.5"><StatusBadge status={inv.status} /></td>
      <td className="px-2 py-1.5 text-right font-mono tabular-nums text-muted-foreground">{summary.cursor}</td>
      <td className="px-2 py-1.5 font-mono text-[10px] text-muted-foreground">{summary.txt}</td>
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
  return <span className={cn("rounded-md border px-1.5 py-0.5 font-mono text-[10px] uppercase", map[status])}>{status}</span>;
}

/* helpers visuais */
function SectionHeader({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="mb-3">
      <h3 className="text-sm font-semibold">{title}</h3>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
function FieldRow({ label, hint, error, children }: { label: string; hint?: string; error?: string | null; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-[11px] font-medium">{label}</Label>
      {children}
      {error ? <p className="text-[10px] text-destructive">{error}</p> : hint ? <p className="text-[10px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
function EmptyHint({ children }: { children: React.ReactNode }) {
  return <div className="rounded-md border border-dashed border-border bg-background/40 px-3 py-4 text-center text-[11px] text-muted-foreground">{children}</div>;
}
function safeStringify(v: unknown): string {
  try { return JSON.stringify(v, null, 2); } catch { return String(v); }
}
