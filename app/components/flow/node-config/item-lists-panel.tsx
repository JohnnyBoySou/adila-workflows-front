/**
 * Painel dedicado pro nó `item_lists`. Seções:
 *
 *   Operação   — picker (filter/sort/slice/distinct/length/reverse) + fields condicionais
 *   Teste      — items mockáveis, mostra antes/depois (count + amostra)
 *   Histórico  — resumo curto (length de saída)
 *
 * Persiste em `values`:
 *   { operation, items, field?, op?, value?, order?, start?, end? }
 *
 * `items` é template — resolvido em runtime; no painel de teste substituímos por array literal.
 */
import { useMemo, useState } from "react";
import { useFieldError } from "./use-field-error";
import { useMutation, useQuery } from "@tanstack/react-query";
import { History, ListFilter, Loader2, Send } from "lucide-react";

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

type Op = "filter" | "sort" | "slice" | "distinct" | "length" | "reverse";

const OPS: { value: Op; label: string; description: string }[] = [
  { value: "filter", label: "filter", description: "Mantém items que passam num comparador." },
  { value: "sort", label: "sort", description: "Ordena por field (asc/desc)." },
  { value: "slice", label: "slice", description: "Recorta por índice." },
  { value: "distinct", label: "distinct", description: "Remove duplicatas por field (ou item inteiro)." },
  { value: "length", label: "length", description: "Só devolve o tamanho." },
  { value: "reverse", label: "reverse", description: "Inverte a ordem." },
];

const FILTER_OPS = [
  { value: "eq", label: "= igual" },
  { value: "neq", label: "≠ diferente" },
  { value: "gt", label: "> maior" },
  { value: "gte", label: "≥ maior ou igual" },
  { value: "lt", label: "< menor" },
  { value: "lte", label: "≤ menor ou igual" },
  { value: "contains", label: "contém" },
  { value: "truthy", label: "truthy" },
  { value: "falsy", label: "falsy" },
];

const SECTIONS = [
  { id: "operation", label: "Operação", icon: ListFilter },
  { id: "test", label: "Teste", icon: Send },
  { id: "history", label: "Histórico", icon: History },
] as const satisfies ReadonlyArray<SectionItem>;

type SectionId = (typeof SECTIONS)[number]["id"];

function readString(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

export function ItemListsPanel({ values, onChange, onError, nodeId }: CustomPanelProps) {
  const [section, setSection] = useState<SectionId>("operation");
  const workflowId = useWorkflowId() ?? "";

  const op = (readString(values.operation, "filter") as Op);
  const itemsMissing = !values.items;
  const filterOpMissing = op === "filter" && !readString(values.op);

  useFieldError(onError, "items", itemsMissing ? "Informe a coleção." : null);
  useFieldError(onError, "op", filterOpMissing ? "Escolha o comparador." : null);

  return (
    <Sections
      sections={SECTIONS as unknown as SectionItem<SectionId>[]}
      value={section}
      onValueChange={setSection}
      ariaLabel="Seções do nó Item Lists"
    >
      {section === "operation" && (
        <OperationSection values={values} onChange={onChange} op={op} itemsMissing={itemsMissing} />
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
}: {
  values: Record<string, unknown>;
  onChange: (patch: Record<string, unknown>) => void;
  op: Op;
  itemsMissing: boolean;
}) {
  const meta = OPS.find((o) => o.value === op)!;
  const needsValue = op === "filter" && values.op !== "truthy" && values.op !== "falsy";

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
                const next: Record<string, unknown> = { operation: o.value };
                if (o.value !== "filter") Object.assign(next, { op: undefined, value: undefined });
                if (o.value !== "filter" && o.value !== "sort" && o.value !== "distinct") next.field = undefined;
                if (o.value !== "sort") next.order = undefined;
                if (o.value !== "slice") Object.assign(next, { start: undefined, end: undefined });
                if (o.value === "filter" && !values.op) next.op = "eq";
                if (o.value === "sort" && !values.order) next.order = "asc";
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

      {op === "filter" && (
        <>
          <FieldRow label="Field" hint="Dot-path dentro de cada item. Vazio = item inteiro (útil pra truthy/falsy).">
            <Input
              value={readString(values.field)}
              onChange={(e) => onChange({ field: e.target.value })}
              placeholder="status"
              className="font-mono text-xs"
            />
          </FieldRow>
          <FieldRow label="Comparador">
            <select
              value={readString(values.op, "eq")}
              onChange={(e) => onChange({ op: e.target.value })}
              className="h-8 w-full rounded-md border border-input bg-background px-2 font-mono text-xs"
            >
              {FILTER_OPS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </FieldRow>
          {needsValue && (
            <FieldRow label="Valor de comparação" hint="String ou número. Aceita templates.">
              <Input
                value={values.value === undefined ? "" : String(values.value)}
                onChange={(e) => {
                  const t = e.target.value;
                  // Tenta number; se vazio, undefined.
                  if (t === "") onChange({ value: undefined });
                  else if (/^-?\d+(\.\d+)?$/.test(t)) onChange({ value: Number(t) });
                  else onChange({ value: t });
                }}
                placeholder="active"
                className="font-mono text-xs"
              />
            </FieldRow>
          )}
        </>
      )}

      {op === "sort" && (
        <div className="grid grid-cols-2 gap-2">
          <FieldRow label="Field" hint="Vazio = ordena os items diretos.">
            <Input
              value={readString(values.field)}
              onChange={(e) => onChange({ field: e.target.value })}
              placeholder="amount"
              className="font-mono text-xs"
            />
          </FieldRow>
          <FieldRow label="Ordem">
            <div className="flex gap-1">
              {(["asc", "desc"] as const).map((o) => {
                const active = (values.order ?? "asc") === o;
                return (
                  <button
                    key={o}
                    type="button"
                    onClick={() => onChange({ order: o })}
                    className={cn(
                      "flex-1 rounded-md border px-2 py-1.5 font-mono text-[11px]",
                      active ? "border-primary bg-primary/10 text-primary" : "border-border bg-background text-muted-foreground hover:border-primary/40",
                    )}
                  >
                    {o === "asc" ? "↑ asc" : "↓ desc"}
                  </button>
                );
              })}
            </div>
          </FieldRow>
        </div>
      )}

      {op === "slice" && (
        <div className="grid grid-cols-2 gap-2">
          <FieldRow label="start" hint="Default 0. Negativo conta do fim.">
            <Input
              type="number"
              value={typeof values.start === "number" ? values.start : ""}
              onChange={(e) => onChange({ start: e.target.value === "" ? undefined : Number(e.target.value) })}
              placeholder="0"
              className="font-mono text-xs"
            />
          </FieldRow>
          <FieldRow label="end" hint="Exclusivo. Vazio = até o fim.">
            <Input
              type="number"
              value={typeof values.end === "number" ? values.end : ""}
              onChange={(e) => onChange({ end: e.target.value === "" ? undefined : Number(e.target.value) })}
              placeholder="10"
              className="font-mono text-xs"
            />
          </FieldRow>
        </div>
      )}

      {op === "distinct" && (
        <FieldRow label="Field" hint="Vazio = compara items inteiros (por shape JSON).">
          <Input
            value={readString(values.field)}
            onChange={(e) => onChange({ field: e.target.value })}
            placeholder="user.id"
            className="font-mono text-xs"
          />
        </FieldRow>
      )}

      <div className="rounded-md border border-dashed border-border bg-muted/20 p-2 text-[10px] text-muted-foreground">
        💡 Output:
        <ul className="mt-1 list-disc pl-4 space-y-0.5">
          <li><code className="font-mono">length</code> → <code>{`{length}`}</code></li>
          <li><code className="font-mono">filter/slice/distinct</code> → <code>{`{items, length}`}</code></li>
          <li><code className="font-mono">sort/reverse</code> → <code>{`{items}`}</code></li>
        </ul>
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
  op,
}: {
  workflowId: string;
  nodeId?: string;
  values: Record<string, unknown>;
  op: Op;
}) {
  const [itemsText, setItemsText] = useState(
    '[{"id":1,"status":"active","amount":10},{"id":2,"status":"draft","amount":50},{"id":3,"status":"active","amount":20}]',
  );
  const [parseErr, setParseErr] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () => {
      const items = JSON.parse(itemsText || "[]");
      return nodesApi.dryRunItemLists(workflowId, nodeId!, {
        config: { ...values, items },
        input: {},
        steps: {},
      });
    },
  });

  if (!workflowId || !nodeId) return <EmptyHint>Salve o workflow antes de testar.</EmptyHint>;

  const itemCount = useMemo(() => {
    try { const v = JSON.parse(itemsText || "[]"); return Array.isArray(v) ? v.length : 0; } catch { return 0; }
  }, [itemsText]);

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

  const result = mutation.data;
  const resultItems = useMemo(() => {
    if (!result || !result.ok) return null;
    const out = result.output as Record<string, unknown>;
    if (Array.isArray(out.items)) return out.items as unknown[];
    return null;
  }, [result]);

  return (
    <div className="space-y-3">
      <SectionHeader title={`Preview do ${op}`} hint="Substitui o template de `items` pelo array literal abaixo." />

      <FieldRow label={`items (JSON · ${itemCount} elementos)`}>
        <Textarea
          rows={5}
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
          Aplicar
        </Button>
      </div>

      {result && !result.ok && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-2 py-1.5">
          <p className="text-[10px] font-medium text-destructive">Handler falhou</p>
          <p className="mt-0.5 break-words font-mono text-[11px] text-destructive/90">{result.error}</p>
        </div>
      )}

      {result && result.ok && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2 text-[11px]">
            <span className="rounded-md border border-border bg-muted/40 px-2 py-0.5 font-mono">
              entrada: {itemCount}
            </span>
            <span>→</span>
            <span className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 font-mono text-emerald-700 dark:text-emerald-400">
              saída: {String(resultItems?.length ?? (result.output as Record<string, unknown>).length ?? "—")}
            </span>
            <span className="ml-auto text-muted-foreground">{result.durationMs}ms</span>
          </div>

          {resultItems ? (
            <div>
              <p className="mb-1 text-[10px] font-medium text-muted-foreground">items (primeiros 20)</p>
              <pre className="max-h-64 overflow-auto rounded-md border border-border bg-background p-2 font-mono text-[10px] leading-relaxed">
                {JSON.stringify(resultItems.slice(0, 20), null, 2)}
                {resultItems.length > 20 && `\n… (+ ${resultItems.length - 20} ocultos)`}
              </pre>
            </div>
          ) : (
            <pre className="max-h-48 overflow-auto rounded-md border border-border bg-background p-2 font-mono text-[10px] leading-relaxed">
              {JSON.stringify(result.output, null, 2)}
            </pre>
          )}
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
              {query.data.map((inv) => <ItemRow key={inv.id} inv={inv} />)}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ItemRow({ inv }: { inv: NodeInvocation }) {
  const summary = useMemo(() => {
    if (inv.status === "failed" && inv.error) {
      const msg = (inv.error as Record<string, unknown>).message;
      return typeof msg === "string" ? msg : "—";
    }
    const out = inv.output as Record<string, unknown> | null;
    if (!out) return "—";
    if (Array.isArray(out.items)) return `${(out.items as unknown[]).length} item(s)`;
    if (typeof out.length === "number") return `length=${out.length}`;
    return JSON.stringify(out);
  }, [inv]);

  return (
    <tr className="border-t border-border/60">
      <td className="px-2 py-1.5 text-muted-foreground">{new Date(inv.createdAt).toLocaleString("pt-BR")}</td>
      <td className="px-2 py-1.5 font-mono text-[10px]">{summary}</td>
    </tr>
  );
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
