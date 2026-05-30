/**
 * Painel dedicado pro nó `aggregate`. Seções:
 *
 *   Operação   — picker (count/sum/avg/min/max/group_by) + fields condicionais
 *   Teste      — items mockáveis, mostra output (count/sum/groups…)
 *   Histórico  — resumo curto da última execução
 *
 * Persiste em `values`:
 *   { operation, items, field?, by?, aggs? }
 *
 * `items` é uma string-template — em runtime resolve pra array; aqui no editor
 * o usuário pode digitar `{{ steps.X.rows }}` ou colar um literal JSON.
 */
import { useMemo, useState } from "react";
import { useFieldError } from "./use-field-error";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Calculator, History, Loader2, Send } from "lucide-react";

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

type Op = "count" | "sum" | "avg" | "min" | "max" | "group_by";

const OPS: { value: Op; label: string; needsField: boolean; description: string }[] = [
  { value: "count", label: "count", needsField: false, description: "Quantos items na lista." },
  { value: "sum", label: "sum", needsField: true, description: "Soma de field numérico." },
  { value: "avg", label: "avg", needsField: true, description: "Média + count + sum." },
  { value: "min", label: "min", needsField: true, description: "Menor valor de field." },
  { value: "max", label: "max", needsField: true, description: "Maior valor de field." },
  { value: "group_by", label: "group_by", needsField: false, description: "Buckets + aggs por grupo." },
];

const SECTIONS = [
  { id: "operation", label: "Operação", icon: Calculator },
  { id: "test", label: "Teste", icon: Send },
  { id: "history", label: "Histórico", icon: History },
] as const satisfies ReadonlyArray<SectionItem>;

type SectionId = (typeof SECTIONS)[number]["id"];

function readString(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

export function AggregatePanel({ values, onChange, onError, nodeId }: CustomPanelProps) {
  const [section, setSection] = useState<SectionId>("operation");
  const workflowId = useWorkflowId() ?? "";

  const op = (readString(values.operation, "count") as Op);
  const itemsMissing = !values.items;
  const fieldMissing =
    OPS.find((o) => o.value === op)?.needsField && !readString(values.field);
  const byMissing = op === "group_by" && !readString(values.by);

  useFieldError(onError, "items", itemsMissing ? "Informe a coleção." : null);
  useFieldError(onError, "field", fieldMissing ? "Field obrigatório." : null);
  useFieldError(onError, "by", byMissing ? "by obrigatório." : null);

  return (
    <Sections
      sections={SECTIONS as unknown as SectionItem<SectionId>[]}
      value={section}
      onValueChange={setSection}
      ariaLabel="Seções do nó Aggregate"
    >
      {section === "operation" && (
        <OperationSection values={values} onChange={onChange} op={op} itemsMissing={itemsMissing} fieldMissing={!!fieldMissing} byMissing={byMissing} />
      )}
      {section === "test" && <TestSection workflowId={workflowId} nodeId={nodeId} values={values} op={op} />}
      {section === "history" && <HistorySection workflowId={workflowId} nodeId={nodeId} />}
    </Sections>
  );
}

/* -------------------------------------------------------------------------- */
/* Operação                                                                   */
/* -------------------------------------------------------------------------- */

function OperationSection({
  values,
  onChange,
  op,
  itemsMissing,
  fieldMissing,
  byMissing,
}: {
  values: Record<string, unknown>;
  onChange: (patch: Record<string, unknown>) => void;
  op: Op;
  itemsMissing: boolean;
  fieldMissing: boolean;
  byMissing: boolean;
}) {
  const meta = OPS.find((o) => o.value === op)!;

  return (
    <div className="space-y-4">
      <SectionHeader title="Operação" hint={meta.description} />

      <div className="grid grid-cols-3 gap-1.5">
        {OPS.map((o) => {
          const active = o.value === op;
          return (
            <button
              key={o.value}
              type="button"
              onClick={() => {
                // Limpa campos que não fazem sentido pra próxima operação.
                const next: Record<string, unknown> = { operation: o.value };
                if (!o.needsField && o.value !== "group_by") next.field = undefined;
                if (o.value !== "group_by") {
                  next.by = undefined;
                  next.aggs = undefined;
                }
                onChange(next);
              }}
              className={cn(
                "rounded-md border px-2 py-1.5 text-left transition-colors",
                active ? "border-primary bg-primary/10 text-primary" : "border-border bg-background hover:border-primary/40",
              )}
            >
              <p className="font-mono text-[11px] font-medium">{o.label}</p>
            </button>
          );
        })}
      </div>

      <FieldRow
        label="Coleção (items)"
        hint="Template que resolva pra array — ex.: {{ steps.fetch.rows }}"
        error={itemsMissing ? "Obrigatório." : null}
      >
        <Input
          value={readString(values.items)}
          onChange={(e) => onChange({ items: e.target.value })}
          placeholder="{{ steps.fetch.rows }}"
          className="font-mono text-xs"
        />
      </FieldRow>

      {meta.needsField && (
        <FieldRow
          label="Field"
          hint="Caminho dentro de cada item (suporta `a.b.c`). Vazio = item inteiro."
          error={fieldMissing ? "Obrigatório pra esta operação." : null}
        >
          <Input
            value={readString(values.field)}
            onChange={(e) => onChange({ field: e.target.value })}
            placeholder="amount"
            className="font-mono text-xs"
          />
        </FieldRow>
      )}

      {op === "group_by" && (
        <>
          <FieldRow label="by" hint="Field usado pra agrupar." error={byMissing ? "Obrigatório." : null}>
            <Input
              value={readString(values.by)}
              onChange={(e) => onChange({ by: e.target.value })}
              placeholder="category"
              className="font-mono text-xs"
            />
          </FieldRow>
          <AggsEditor aggs={(values.aggs as Record<string, { op: string; field?: string }>) ?? {}} onChange={(a) => onChange({ aggs: a })} />
        </>
      )}

      <div className="rounded-md border border-dashed border-border bg-muted/20 p-2 text-[10px] text-muted-foreground">
        💡 O output muda por operação:
        <ul className="mt-1 list-disc pl-4 space-y-0.5">
          <li><code className="font-mono">count</code> → <code>{`{count}`}</code></li>
          <li><code className="font-mono">sum/min/max</code> → <code>{`{sum}/{min}/{max}`}</code></li>
          <li><code className="font-mono">avg</code> → <code>{`{avg, count, sum}`}</code></li>
          <li><code className="font-mono">group_by</code> → <code>{`{groups:[{key,count,...aggs}], length}`}</code></li>
        </ul>
      </div>
    </div>
  );
}

function AggsEditor({
  aggs,
  onChange,
}: {
  aggs: Record<string, { op: string; field?: string }>;
  onChange: (v: Record<string, { op: string; field?: string }>) => void;
}) {
  const entries = Object.entries(aggs);
  function setKey(oldKey: string, newKey: string) {
    const next: Record<string, { op: string; field?: string }> = {};
    for (const [k, v] of Object.entries(aggs)) next[k === oldKey ? newKey : k] = v;
    onChange(next);
  }
  function setOp(k: string, op: string) {
    onChange({ ...aggs, [k]: { ...aggs[k], op } });
  }
  function setField(k: string, field: string) {
    onChange({ ...aggs, [k]: { ...aggs[k], field: field || undefined } });
  }
  function remove(k: string) {
    const next = { ...aggs };
    delete next[k];
    onChange(next);
  }
  function add() {
    let i = 1;
    let k = "total";
    while (k in aggs) {
      i++;
      k = `agg${i}`;
    }
    onChange({ ...aggs, [k]: { op: "sum", field: "" } });
  }

  return (
    <div className="space-y-2">
      <Label className="text-[11px] font-medium">aggs (alias → op/field por grupo)</Label>
      {entries.length === 0 ? (
        <EmptyHint>Sem aggs adicionais — cada grupo terá só <code className="font-mono">key</code> e <code className="font-mono">count</code>.</EmptyHint>
      ) : (
        <div className="space-y-1.5">
          {entries.map(([k, spec]) => (
            <div key={k} className="flex items-start gap-1.5">
              <Input value={k} onChange={(e) => setKey(k, e.target.value)} className="h-7 max-w-[120px] font-mono text-xs" placeholder="alias" />
              <select
                value={spec.op}
                onChange={(e) => setOp(k, e.target.value)}
                className="h-7 rounded-md border border-input bg-background px-1.5 font-mono text-[11px]"
              >
                {["count", "sum", "avg", "min", "max"].map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
              <Input
                value={spec.field ?? ""}
                onChange={(e) => setField(k, e.target.value)}
                placeholder={spec.op === "count" ? "(ignorado)" : "field"}
                disabled={spec.op === "count"}
                className="h-7 flex-1 font-mono text-xs"
              />
              <Button size="sm" variant="ghost" onClick={() => remove(k)} className="h-7 px-2 text-[11px]">×</Button>
            </div>
          ))}
        </div>
      )}
      <Button size="sm" variant="outline" onClick={add} className="h-7 text-[11px]">+ adicionar agg</Button>
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
  op,
}: {
  workflowId: string;
  nodeId?: string;
  values: Record<string, unknown>;
  op: Op;
}) {
  const [itemsText, setItemsText] = useState(
    '[{"category":"a","amount":10},{"category":"a","amount":20},{"category":"b","amount":5}]',
  );
  const [parseErr, setParseErr] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () => {
      // Substitui `config.items` pela array literal pra o handler ter algo concreto.
      const items = JSON.parse(itemsText || "[]");
      return nodesApi.dryRunAggregate(workflowId, nodeId!, {
        config: { ...values, items },
        input: {},
        steps: {},
      });
    },
  });

  if (!workflowId || !nodeId) return <EmptyHint>Salve o workflow antes de testar.</EmptyHint>;

  function run() {
    setParseErr(null);
    try {
      const v = JSON.parse(itemsText || "[]");
      if (!Array.isArray(v)) throw new Error("items precisa ser array");
    } catch (err) {
      setParseErr((err as Error).message);
      return;
    }
    mutation.mutate();
  }

  const itemCount = useMemo(() => {
    try { const v = JSON.parse(itemsText || "[]"); return Array.isArray(v) ? v.length : 0; } catch { return 0; }
  }, [itemsText]);

  return (
    <div className="space-y-3">
      <SectionHeader title={`Preview do ${op}`} hint="Substitui o template de `items` pelo array literal abaixo." />

      <FieldRow label={`items (JSON · ${itemCount} elementos)`}>
        <Textarea
          rows={6}
          spellCheck={false}
          className="font-mono text-[11px]"
          value={itemsText}
          onChange={(e) => { setItemsText(e.target.value); if (parseErr) setParseErr(null); }}
        />
      </FieldRow>

      {parseErr && <p className="text-[10px] text-destructive">JSON inválido: {parseErr}</p>}

      <div className="flex justify-end">
        <Button size="sm" onClick={run} disabled={mutation.isPending}>
          {mutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          Calcular
        </Button>
      </div>

      {mutation.data && !mutation.data.ok && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-2 py-1.5">
          <p className="text-[10px] font-medium text-destructive">Handler falhou</p>
          <p className="mt-0.5 break-words font-mono text-[11px] text-destructive/90">{mutation.data.error}</p>
        </div>
      )}

      {mutation.data && mutation.data.ok && (
        <ResultPreview output={mutation.data.output} op={op} />
      )}
    </div>
  );
}

function ResultPreview({ output, op }: { output: Record<string, unknown>; op: Op }) {
  if (op === "group_by") {
    const groups = (output.groups as Array<Record<string, unknown>>) ?? [];
    return (
      <div className="space-y-2">
        <p className="text-[11px] font-medium">{groups.length} grupo(s)</p>
        {groups.length === 0 ? (
          <EmptyHint>Nenhum grupo gerado.</EmptyHint>
        ) : (
          <div className="overflow-hidden rounded-md border border-border bg-background">
            <table className="w-full text-[11px]">
              <thead className="bg-muted/40 text-[10px] uppercase tracking-wide text-muted-foreground">
                <tr>
                  {Object.keys(groups[0]).map((k) => (
                    <th key={k} className="px-2 py-1 text-left font-mono">{k}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {groups.map((g, idx) => (
                  <tr key={idx} className="border-t border-border/60">
                    {Object.keys(groups[0]).map((k) => (
                      <td key={k} className="px-2 py-1 font-mono text-[10px]">{shortVal(g[k])}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-md border border-emerald-500/40 bg-emerald-500/5 p-2">
      <div className="flex flex-wrap gap-2">
        {Object.entries(output).map(([k, v]) => (
          <div key={k} className="rounded-md border border-border bg-background px-2 py-1">
            <p className="text-[9px] uppercase tracking-wide text-muted-foreground">{k}</p>
            <p className="font-mono text-sm font-semibold">{shortVal(v)}</p>
          </div>
        ))}
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

  if (!workflowId || !nodeId) return <EmptyHint>Salve o workflow antes de ver histórico.</EmptyHint>;

  return (
    <div className="space-y-2">
      <SectionHeader title="Últimas execuções" />
      {query.isPending && <div className="flex items-center gap-2 px-2 py-4 text-[11px] text-muted-foreground"><Loader2 className="size-3.5 animate-spin" /> Carregando…</div>}
      {query.data && query.data.length === 0 && <EmptyHint>Nenhuma execução registrada ainda.</EmptyHint>}
      {query.data && query.data.length > 0 && (
        <div className="overflow-hidden rounded-md border border-border bg-background">
          <table className="w-full text-[11px]">
            <thead className="bg-muted/40 text-[10px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-2 py-1.5 text-left">Quando</th>
                <th className="px-2 py-1.5 text-left">Resultado</th>
              </tr>
            </thead>
            <tbody>
              {query.data.map((inv) => <AggRow key={inv.id} inv={inv} />)}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function AggRow({ inv }: { inv: NodeInvocation }) {
  const summary = useMemo(() => {
    if (inv.status === "failed" && inv.error) {
      const msg = (inv.error as Record<string, unknown>).message;
      return typeof msg === "string" ? msg : "—";
    }
    if (inv.output) {
      const out = inv.output as Record<string, unknown>;
      if (Array.isArray(out.groups)) return `${(out.groups as unknown[]).length} grupo(s)`;
      return Object.entries(out).slice(0, 3).map(([k, v]) => `${k}=${shortVal(v)}`).join(" · ");
    }
    return "—";
  }, [inv]);

  return (
    <tr className="border-t border-border/60">
      <td className="px-2 py-1.5 text-muted-foreground">{new Date(inv.createdAt).toLocaleString("pt-BR")}</td>
      <td className="px-2 py-1.5 font-mono text-[10px]">{summary}</td>
    </tr>
  );
}

function shortVal(v: unknown): string {
  if (v === null || v === undefined) return String(v);
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : v.toFixed(3);
  if (typeof v === "string") return v.length > 24 ? `"${v.slice(0, 24)}…"` : `"${v}"`;
  if (Array.isArray(v)) return `[${v.length}]`;
  if (typeof v === "object") return `{${Object.keys(v).length}}`;
  return String(v);
}

/* helpers */
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
