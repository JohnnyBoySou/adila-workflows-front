/**
 * Painel dedicado pro nó `date_time`. Seções:
 *
 *   Operação   — picker (now/parse/format/add/diff) + fields condicionais
 *   Preview    — resolve ao vivo (debounce manual via botão); mostra output formatado
 *   Histórico  — última execução
 *
 * Persiste em `values`: { operation, value?, format?, amount?, unit?, from?, to? }
 */
import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CalendarClock, Eye, History, Loader2, Send } from "lucide-react";

import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Sections, type SectionItem } from "~/components/ui/sections";
import { cn } from "~/lib/utils";
import { queryKeys } from "~/lib/query-keys";
import * as nodesApi from "~/services/workflow-nodes";
import type { NodeInvocation } from "~/services/workflow-nodes";

import { useWorkflowId } from "../workflow-context";
import type { CustomPanelProps } from "./types";

type Op = "now" | "parse" | "format" | "add" | "diff";

const OPS: { value: Op; label: string; description: string }[] = [
  { value: "now", label: "now", description: "Timestamp atual (ISO + epochMs)." },
  { value: "parse", label: "parse", description: "String → ISO/epochMs." },
  { value: "format", label: "format", description: "ISO → string formatada." },
  { value: "add", label: "add", description: "Soma duração a uma data." },
  { value: "diff", label: "diff", description: "Diferença entre 2 datas." },
];

const UNITS = [
  { value: "ms", label: "ms" },
  { value: "seconds", label: "segundos" },
  { value: "minutes", label: "minutos" },
  { value: "hours", label: "horas" },
  { value: "days", label: "dias" },
];

const FORMAT_PRESETS = [
  "YYYY-MM-DD",
  "YYYY-MM-DD HH:mm:ss",
  "DD/MM/YYYY",
  "DD/MM/YYYY HH:mm",
  "HH:mm:ss.SSS",
];

const SECTIONS = [
  { id: "operation", label: "Operação", icon: CalendarClock },
  { id: "preview", label: "Preview", icon: Eye },
  { id: "history", label: "Histórico", icon: History },
] as const satisfies ReadonlyArray<SectionItem>;

type SectionId = (typeof SECTIONS)[number]["id"];

function readString(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

export function DateTimePanel({ values, onChange, onError, nodeId }: CustomPanelProps) {
  const [section, setSection] = useState<SectionId>("operation");
  const workflowId = useWorkflowId() ?? "";

  const op = readString(values.operation, "now") as Op;
  const valueMissing = (op === "parse" || op === "format" || op === "add") && !readString(values.value);
  const amountMissing = op === "add" && typeof values.amount !== "number";
  const diffMissing = op === "diff" && (!readString(values.from) || !readString(values.to));

  onError?.("value", valueMissing ? "Valor obrigatório." : null);
  onError?.("amount", amountMissing ? "Amount obrigatório." : null);
  onError?.("from", diffMissing ? "from/to obrigatórios." : null);

  return (
    <Sections
      sections={SECTIONS as unknown as SectionItem<SectionId>[]}
      value={section}
      onValueChange={setSection}
      ariaLabel="Seções do nó Date Time"
    >
      {section === "operation" && <OperationSection values={values} onChange={onChange} op={op} />}
      {section === "preview" && <PreviewSection workflowId={workflowId} nodeId={nodeId} values={values} op={op} />}
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
}: {
  values: Record<string, unknown>;
  onChange: (patch: Record<string, unknown>) => void;
  op: Op;
}) {
  const meta = OPS.find((o) => o.value === op)!;

  return (
    <div className="space-y-4">
      <SectionHeader title="Operação" hint={meta.description} />

      <div className="grid grid-cols-5 gap-1.5">
        {OPS.map((o) => {
          const active = o.value === op;
          return (
            <button
              key={o.value}
              type="button"
              onClick={() => {
                // Limpa campos irrelevantes pra próxima op.
                const next: Record<string, unknown> = { operation: o.value };
                if (o.value === "now") {
                  Object.assign(next, { value: undefined, format: undefined, amount: undefined, unit: undefined, from: undefined, to: undefined });
                }
                if (o.value === "parse") {
                  Object.assign(next, { format: undefined, amount: undefined, unit: undefined, from: undefined, to: undefined });
                }
                if (o.value === "format") {
                  Object.assign(next, { amount: undefined, unit: undefined, from: undefined, to: undefined });
                }
                if (o.value === "add") {
                  Object.assign(next, { format: undefined, from: undefined, to: undefined });
                }
                if (o.value === "diff") {
                  Object.assign(next, { value: undefined, format: undefined, amount: undefined });
                  if (!values.unit) next.unit = "seconds";
                }
                onChange(next);
              }}
              className={cn(
                "rounded-md border px-2 py-1.5 text-center transition-colors",
                active ? "border-primary bg-primary/10 text-primary" : "border-border bg-background hover:border-primary/40",
              )}
            >
              <p className="font-mono text-[11px] font-medium">{o.label}</p>
            </button>
          );
        })}
      </div>

      {op === "now" && (
        <div className="rounded-md border border-dashed border-border bg-muted/20 p-2 text-[10px] text-muted-foreground">
          Sem configuração — output sempre <code className="font-mono">{`{iso, epochMs}`}</code> do momento da execução.
        </div>
      )}

      {(op === "parse" || op === "format" || op === "add") && (
        <FieldRow
          label="Valor (ISO ou template)"
          hint='Aceita ISO 8601 ("2026-06-01T10:00:00Z") ou {{ steps.X.date }}.'
        >
          <Input
            value={readString(values.value)}
            onChange={(e) => onChange({ value: e.target.value })}
            placeholder="2026-06-01T10:00:00Z"
            className="font-mono text-xs"
          />
        </FieldRow>
      )}

      {op === "format" && (
        <FieldRow label="Formato" hint="Tokens: YYYY, MM, DD, HH, mm, ss, SSS.">
          <Input
            value={readString(values.format, "YYYY-MM-DD HH:mm:ss")}
            onChange={(e) => onChange({ format: e.target.value })}
            className="font-mono text-xs"
          />
          <div className="mt-1 flex flex-wrap gap-1">
            {FORMAT_PRESETS.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => onChange({ format: f })}
                className={cn(
                  "rounded-md border px-1.5 py-0.5 font-mono text-[10px]",
                  f === values.format ? "border-primary bg-primary/10 text-primary" : "border-border bg-background text-muted-foreground hover:border-primary/40",
                )}
              >
                {f}
              </button>
            ))}
          </div>
        </FieldRow>
      )}

      {op === "add" && (
        <div className="grid grid-cols-2 gap-2">
          <FieldRow label="Quantidade">
            <Input
              type="number"
              value={typeof values.amount === "number" ? values.amount : ""}
              onChange={(e) => onChange({ amount: e.target.value === "" ? undefined : Number(e.target.value) })}
              placeholder="30"
              className="font-mono text-xs"
            />
          </FieldRow>
          <FieldRow label="Unidade">
            <select
              value={readString(values.unit, "seconds")}
              onChange={(e) => onChange({ unit: e.target.value })}
              className="h-8 w-full rounded-md border border-input bg-background px-2 font-mono text-xs"
            >
              {UNITS.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}
            </select>
          </FieldRow>
        </div>
      )}

      {op === "diff" && (
        <div className="grid grid-cols-2 gap-2">
          <FieldRow label="from (ISO)">
            <Input
              value={readString(values.from)}
              onChange={(e) => onChange({ from: e.target.value })}
              placeholder="{{ steps.start.iso }}"
              className="font-mono text-xs"
            />
          </FieldRow>
          <FieldRow label="to (ISO)">
            <Input
              value={readString(values.to)}
              onChange={(e) => onChange({ to: e.target.value })}
              placeholder="{{ steps.end.iso }}"
              className="font-mono text-xs"
            />
          </FieldRow>
        </div>
      )}

      <div className="rounded-md border border-dashed border-border bg-muted/20 p-2 text-[10px] text-muted-foreground">
        💡 Output por operação:
        <ul className="mt-1 list-disc pl-4 space-y-0.5">
          <li><code className="font-mono">now / parse / add</code> → <code>{`{iso, epochMs}`}</code></li>
          <li><code className="font-mono">format</code> → <code>{`{formatted}`}</code></li>
          <li><code className="font-mono">diff</code> → <code>{`{ms, seconds, minutes, hours, days}`}</code></li>
        </ul>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Preview                                                                    */
/* -------------------------------------------------------------------------- */

function PreviewSection({
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
  const mutation = useMutation({
    mutationFn: () => nodesApi.dryRunDate(workflowId, nodeId!, { config: values, input: {}, steps: {} }),
  });

  if (!workflowId || !nodeId) return <EmptyHint>Salve o workflow antes de testar.</EmptyHint>;

  const result = mutation.data;

  return (
    <div className="space-y-3">
      <SectionHeader title={`Preview: ${op}`} hint="Resolve com input/steps vazios — útil pra validar literais e tokens." />

      <div className="flex justify-end">
        <Button size="sm" onClick={() => mutation.mutate()} disabled={mutation.isPending}>
          {mutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          Resolver
        </Button>
      </div>

      {result && !result.ok && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-2 py-1.5">
          <p className="text-[10px] font-medium text-destructive">Handler falhou</p>
          <p className="mt-0.5 break-words font-mono text-[11px] text-destructive/90">{result.error}</p>
        </div>
      )}

      {result && result.ok && <OutputCard output={result.output} op={op} />}
    </div>
  );
}

function OutputCard({ output, op }: { output: Record<string, unknown>; op: Op }) {
  const main = useMemo(() => {
    if (op === "format") return readString(output.formatted);
    if (op === "diff") {
      const s = Number(output.seconds);
      return Number.isFinite(s) ? humanDuration(s * 1000) : "—";
    }
    return readString(output.iso);
  }, [op, output]);

  return (
    <div className="space-y-2">
      <div className="rounded-md border border-emerald-500/40 bg-emerald-500/5 p-3">
        <p className="text-[10px] uppercase tracking-wide text-emerald-700 dark:text-emerald-400">{op === "format" ? "Formatado" : op === "diff" ? "Diferença" : "ISO"}</p>
        <p className="break-all font-mono text-base font-semibold">{main || "—"}</p>
      </div>
      <div className="rounded-md border border-border bg-muted/20 p-2">
        <p className="mb-1 text-[10px] font-medium text-muted-foreground">Output completo</p>
        <pre className="max-h-48 overflow-auto rounded-md border border-border bg-background p-2 font-mono text-[10px] leading-relaxed">
          {JSON.stringify(output, null, 2)}
        </pre>
      </div>
    </div>
  );
}

function humanDuration(ms: number): string {
  const abs = Math.abs(ms);
  const sign = ms < 0 ? "-" : "";
  if (abs < 1000) return `${sign}${abs}ms`;
  if (abs < 60_000) return `${sign}${(abs / 1000).toFixed(1)}s`;
  if (abs < 3_600_000) return `${sign}${(abs / 60_000).toFixed(1)}min`;
  if (abs < 86_400_000) return `${sign}${(abs / 3_600_000).toFixed(1)}h`;
  return `${sign}${(abs / 86_400_000).toFixed(1)}d`;
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
                <th className="px-2 py-1.5 text-left">Output</th>
              </tr>
            </thead>
            <tbody>
              {query.data.map((inv) => <DateRow key={inv.id} inv={inv} />)}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function DateRow({ inv }: { inv: NodeInvocation }) {
  const summary = useMemo(() => {
    if (inv.status === "failed" && inv.error) {
      const msg = (inv.error as Record<string, unknown>).message;
      return typeof msg === "string" ? msg : "—";
    }
    const out = inv.output as Record<string, unknown> | null;
    if (!out) return "—";
    if (typeof out.formatted === "string") return out.formatted;
    if (typeof out.iso === "string") return out.iso;
    if (typeof out.seconds === "number") return humanDuration(Number(out.ms ?? 0));
    return JSON.stringify(out);
  }, [inv]);

  return (
    <tr className="border-t border-border/60">
      <td className="px-2 py-1.5 text-muted-foreground">{new Date(inv.createdAt).toLocaleString("pt-BR")}</td>
      <td className="px-2 py-1.5 font-mono text-[10px] break-all">{summary}</td>
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
function FieldRow({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-[11px] font-medium">{label}</Label>
      {children}
      {hint && <p className="text-[10px] text-muted-foreground">{hint}</p>}
    </div>
  );
}
function EmptyHint({ children }: { children: React.ReactNode }) {
  return <div className="rounded-md border border-dashed border-border bg-background/40 px-3 py-4 text-center text-[11px] text-muted-foreground">{children}</div>;
}
