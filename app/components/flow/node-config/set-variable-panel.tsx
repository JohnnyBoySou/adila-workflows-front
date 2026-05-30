/**
 * Painel dedicado pro nó `set_variable`. Seções:
 *
 *   Modo       — single (name+value) ou multi (variables: {})
 *   Teste      — preview do merge em ctx.vars (input/vars/steps mockáveis)
 *   Histórico  — últimas execuções
 *
 * Persiste em `values`:
 *   single: { name: string, value: any }
 *   multi:  { variables: Record<string, any> }
 */
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { History, Layers, Loader2, Send, Variable } from "lucide-react";

import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Sections, type SectionItem } from "~/components/ui/sections";
import { Textarea } from "~/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { cn } from "~/lib/utils";
import { queryKeys } from "~/lib/query-keys";
import * as nodesApi from "~/services/workflow-nodes";
import type { NodeInvocation } from "~/services/workflow-nodes";

import { useWorkflowId } from "../workflow-context";
import type { CustomPanelProps } from "./types";

type Mode = "single" | "multi";

const SECTIONS = [
  { id: "mode", label: "Variáveis", icon: Variable },
  { id: "test", label: "Teste", icon: Send },
  { id: "history", label: "Histórico", icon: History },
] as const satisfies ReadonlyArray<SectionItem>;

type SectionId = (typeof SECTIONS)[number]["id"];

function readString(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

function inferMode(values: Record<string, unknown>): Mode {
  if (values.variables && typeof values.variables === "object") return "multi";
  return "single";
}

export function SetVariablePanel({ values, onChange, onError, nodeId }: CustomPanelProps) {
  const [section, setSection] = useState<SectionId>("mode");
  const workflowId = useWorkflowId() ?? "";

  const mode = inferMode(values);
  const name = readString(values.name);

  const nameMissing = mode === "single" && name.trim() === "";
  const variablesEmpty =
    mode === "multi" &&
    (typeof values.variables !== "object" ||
      !values.variables ||
      Object.keys(values.variables as Record<string, unknown>).length === 0);

  // CRÍTICO: onError direto no render dispara setState no parent → re-render →
  // onError de novo → loop infinito (Chrome trava). Tem que ser em useEffect.
  useEffect(() => {
    onError?.("name", nameMissing ? "Informe o nome." : null);
  }, [nameMissing, onError]);
  useEffect(() => {
    onError?.("variables", variablesEmpty ? "Adicione ao menos 1 variável." : null);
  }, [variablesEmpty, onError]);

  return (
    <Sections
      sections={SECTIONS as unknown as SectionItem<SectionId>[]}
      value={section}
      onValueChange={setSection}
      ariaLabel="Seções do nó Set Variable"
    >
      {section === "mode" && (
        <ModeSection
          mode={mode}
          values={values}
          onChange={onChange}
          nameMissing={nameMissing}
          variablesEmpty={variablesEmpty}
        />
      )}
      {section === "test" && <TestSection workflowId={workflowId} nodeId={nodeId} values={values} />}
      {section === "history" && <HistorySection workflowId={workflowId} nodeId={nodeId} />}
    </Sections>
  );
}

/* -------------------------------------------------------------------------- */
/* Modo                                                                       */
/* -------------------------------------------------------------------------- */

function ModeSection({
  mode,
  values,
  onChange,
  nameMissing,
  variablesEmpty,
}: {
  mode: Mode;
  values: Record<string, unknown>;
  onChange: (patch: Record<string, unknown>) => void;
  nameMissing: boolean;
  variablesEmpty: boolean;
}) {
  return (
    <div className="space-y-4">
      <SectionHeader title="Modo" hint="Single define UMA variável; multi define várias de uma vez (importer n8n usa multi)." />

      <div className="grid grid-cols-2 gap-1.5">
        {(["single", "multi"] as const).map((m) => {
          const active = m === mode;
          const Icon = m === "multi" ? Layers : Variable;
          return (
            <button
              key={m}
              type="button"
              onClick={() => {
                if (m === "single") onChange({ variables: undefined, name: readString(values.name) || "myVar", value: values.value });
                else onChange({ name: undefined, value: undefined, variables: (values.variables as Record<string, unknown>) ?? { myVar: "" } });
              }}
              className={cn(
                "flex items-center gap-2 rounded-md border px-2.5 py-2 text-left transition-colors",
                active ? "border-primary bg-primary/10" : "border-border bg-background hover:border-primary/40",
              )}
            >
              <Icon className={cn("size-4 shrink-0", active ? "text-primary" : "text-muted-foreground")} />
              <div className="min-w-0">
                <p className={cn("text-[12px] font-medium", active && "text-primary")}>
                  {m === "single" ? "Single (name + value)" : "Multi (variables: {})"}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  {m === "single" ? "Para uma variável." : "Para várias num bloco só."}
                </p>
              </div>
            </button>
          );
        })}
      </div>

      {mode === "single" ? (
        <>
          <FieldRow label="Nome" hint="Identificador. Acessível depois via vars.<nome>." error={nameMissing ? "Obrigatório." : null}>
            <Input
              value={readString(values.name)}
              onChange={(e) => onChange({ name: e.target.value })}
              placeholder="totalCount"
              className="font-mono text-xs"
            />
          </FieldRow>
          <FieldRow
            label="Valor"
            hint="Pode ser literal ou template — strings com {{}} são resolvidas, tipos primitivos passam direto."
          >
            <Textarea
              rows={3}
              spellCheck={false}
              value={
                typeof values.value === "string"
                  ? values.value
                  : values.value === undefined
                    ? ""
                    : JSON.stringify(values.value)
              }
              onChange={(e) => {
                // Tenta como JSON pra capturar number/bool/array/object; falha → guarda como string.
                const t = e.target.value;
                try {
                  const parsed = t.trim() === "" ? undefined : JSON.parse(t);
                  onChange({ value: parsed });
                } catch {
                  onChange({ value: t });
                }
              }}
              className="font-mono text-xs"
              placeholder="{{steps.fetch.body.total}}"
            />
          </FieldRow>
        </>
      ) : (
        <MultiEditor
          variables={(values.variables as Record<string, unknown>) ?? {}}
          types={(values._types as Record<string, VarType>) ?? {}}
          onChange={(next) =>
            onChange({
              variables: next.variables,
              _types: Object.keys(next.types).length > 0 ? next.types : undefined,
            })
          }
          empty={variablesEmpty}
        />
      )}

      <div className="rounded-md border border-dashed border-border bg-muted/20 p-2 text-[10px] text-muted-foreground">
        💡 As variáveis são <strong>merged</strong> no <code className="font-mono">ctx.vars</code> e ficam
        disponíveis pra todos os nós downstream via <code className="font-mono">{`{{vars.X}}`}</code> ou
        no nó <code className="font-mono">code</code> via <code className="font-mono">vars.X</code>.
      </div>
    </div>
  );
}

type VarType = "string" | "number" | "boolean" | "array" | "object";
const VAR_TYPES: VarType[] = ["string", "number", "boolean", "array", "object"];
const TYPE_LABELS: Record<VarType, string> = {
  string: "Texto",
  number: "Número",
  boolean: "Bool",
  array: "Array",
  object: "Objeto",
};

function MultiEditor({
  variables,
  types,
  onChange,
  empty,
}: {
  variables: Record<string, unknown>;
  types: Record<string, VarType>;
  onChange: (next: { variables: Record<string, unknown>; types: Record<string, VarType> }) => void;
  empty: boolean;
}) {
  const entries = Object.entries(variables);

  function setKey(oldKey: string, newKey: string) {
    if (oldKey === newKey) return;
    const nextVars: Record<string, unknown> = {};
    const nextTypes: Record<string, VarType> = {};
    for (const [k, v] of Object.entries(variables)) nextVars[k === oldKey ? newKey : k] = v;
    for (const [k, t] of Object.entries(types)) nextTypes[k === oldKey ? newKey : k] = t;
    onChange({ variables: nextVars, types: nextTypes });
  }
  function setValue(key: string, raw: string) {
    let parsed: unknown = raw;
    try {
      parsed = raw.trim() === "" ? "" : JSON.parse(raw);
    } catch {
      parsed = raw;
    }
    onChange({ variables: { ...variables, [key]: parsed }, types });
  }
  function setType(key: string, t: VarType) {
    onChange({ variables, types: { ...types, [key]: t } });
  }
  function remove(key: string) {
    const nextVars = { ...variables };
    const nextTypes = { ...types };
    delete nextVars[key];
    delete nextTypes[key];
    onChange({ variables: nextVars, types: nextTypes });
  }
  function add() {
    let i = 1;
    let k = "newVar";
    while (k in variables) {
      i++;
      k = `newVar${i}`;
    }
    onChange({
      variables: { ...variables, [k]: "" },
      types: { ...types, [k]: "string" },
    });
  }

  return (
    <div className="space-y-2">
      <Label className="text-[11px] font-medium">
        Variáveis {empty && <span className="text-destructive">(adicione ao menos 1)</span>}
      </Label>
      {entries.length === 0 ? (
        <EmptyHint>Use o botão abaixo pra criar a primeira.</EmptyHint>
      ) : (
        <div className="space-y-1.5">
          {entries.map(([k, v]) => {
            const t = types[k] ?? "string";
            return (
              <div key={k} className="flex items-start gap-1.5">
                <Input
                  value={k}
                  onChange={(e) => setKey(k, e.target.value)}
                  className="h-7 max-w-[140px] font-mono text-xs"
                  placeholder="nome"
                />
                <Select value={t} onValueChange={(v) => setType(k, v as VarType)}>
                  <SelectTrigger className="h-7 w-[90px] text-[11px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {VAR_TYPES.map((vt) => (
                      <SelectItem key={vt} value={vt} className="text-xs">
                        {TYPE_LABELS[vt]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <span className="pt-1.5 text-muted-foreground">=</span>
                <Textarea
                  rows={1}
                  value={typeof v === "string" ? v : JSON.stringify(v)}
                  onChange={(e) => setValue(k, e.target.value)}
                  className="min-h-[28px] flex-1 resize-y font-mono text-xs"
                  placeholder={
                    t === "number"
                      ? "42 ou {{ steps.x.count }}"
                      : t === "boolean"
                        ? "true / false / {{ ... }}"
                        : t === "array"
                          ? '[1, 2, 3]'
                          : t === "object"
                            ? '{"key": "val"}'
                            : "texto ou {{ ... }}"
                  }
                />
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => remove(k)}
                  className="h-7 px-2 text-[11px]"
                >
                  ×
                </Button>
              </div>
            );
          })}
        </div>
      )}
      <Button size="sm" variant="outline" onClick={add} className="h-7 text-[11px]">
        + adicionar variável
      </Button>
      <p className="text-[10px] text-muted-foreground">
        O <strong>tipo</strong> coage o valor após resolver template (`{`{{ … }}`}` → string vira number, etc.) — útil quando o downstream <code>if</code> compara <code>=== true</code>.
      </p>
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
  const [varsText, setVarsText] = useState("{}");
  const [stepsText, setStepsText] = useState("{}");
  const [parseErr, setParseErr] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () =>
      nodesApi.dryRunSetVariable(workflowId, nodeId!, {
        config: values,
        input: JSON.parse(inputText || "{}"),
        vars: JSON.parse(varsText || "{}"),
        steps: JSON.parse(stepsText || "{}"),
      }),
  });

  if (!workflowId || !nodeId) return <EmptyHint>Salve o workflow antes de testar.</EmptyHint>;

  function run() {
    setParseErr(null);
    try {
      JSON.parse(inputText || "{}");
      JSON.parse(varsText || "{}");
      JSON.parse(stepsText || "{}");
    } catch (err) {
      setParseErr((err as Error).message);
      return;
    }
    mutation.mutate();
  }

  const result = mutation.data;
  const initialVars = useMemo(() => {
    try { return JSON.parse(varsText || "{}") as Record<string, unknown>; } catch { return {}; }
  }, [varsText]);

  return (
    <div className="space-y-3">
      <SectionHeader title="Preview do merge" hint="Mostra o vars resultante a partir do estado simulado." />

      <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
        <FieldRow label="input (JSON)">
          <Textarea rows={4} spellCheck={false} className="font-mono text-[11px]" value={inputText} onChange={(e) => { setInputText(e.target.value); if (parseErr) setParseErr(null); }} />
        </FieldRow>
        <FieldRow label="vars atual (JSON)" hint="Variáveis acumuladas antes deste nó.">
          <Textarea rows={4} spellCheck={false} className="font-mono text-[11px]" value={varsText} onChange={(e) => { setVarsText(e.target.value); if (parseErr) setParseErr(null); }} />
        </FieldRow>
        <FieldRow label="steps (JSON)" hint="Mocks de upstream.">
          <Textarea rows={4} spellCheck={false} className="font-mono text-[11px]" value={stepsText} onChange={(e) => { setStepsText(e.target.value); if (parseErr) setParseErr(null); }} />
        </FieldRow>
      </div>

      {parseErr && <p className="text-[10px] text-destructive">JSON inválido: {parseErr}</p>}

      <div className="flex justify-end">
        <Button size="sm" onClick={run} disabled={mutation.isPending}>
          {mutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          Resolver templates
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
          <div className="rounded-md border border-emerald-500/40 bg-emerald-500/5 p-2">
            <p className="mb-1 text-[11px] font-medium text-emerald-600">vars adicionadas/sobrescritas</p>
            <pre className="max-h-48 overflow-auto rounded-md border border-border bg-background p-2 font-mono text-[10px] leading-relaxed">
              {safeStringify(result.vars ?? {})}
            </pre>
          </div>
          <div className="rounded-md border border-border bg-muted/20 p-2">
            <p className="mb-1 text-[11px] font-medium">vars resultante (merge)</p>
            <pre className="max-h-48 overflow-auto rounded-md border border-border bg-background p-2 font-mono text-[10px] leading-relaxed">
              {safeStringify({ ...initialVars, ...(result.vars ?? {}) })}
            </pre>
          </div>
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
                <th className="px-2 py-1.5 text-left">vars merged</th>
              </tr>
            </thead>
            <tbody>
              {query.data.map((inv) => (
                <SetVarRow key={inv.id} inv={inv} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function SetVarRow({ inv }: { inv: NodeInvocation }) {
  const summary = useMemo(() => {
    if (inv.status === "failed" && inv.error) {
      const msg = (inv.error as Record<string, unknown>).message;
      return typeof msg === "string" ? msg : safeStringify(inv.error);
    }
    if (inv.output) {
      const out = inv.output as Record<string, unknown>;
      // single mode: {name, value}; multi: as variáveis direto
      if (typeof out.name === "string") return `${out.name} = ${shortVal(out.value)}`;
      const keys = Object.keys(out);
      return keys.slice(0, 4).map((k) => `${k}=${shortVal(out[k])}`).join(" · ") + (keys.length > 4 ? " …" : "");
    }
    return "—";
  }, [inv]);

  return (
    <tr className="border-t border-border/60">
      <td className="px-2 py-1.5 text-muted-foreground">{new Date(inv.createdAt).toLocaleString("pt-BR")}</td>
      <td className="px-2 py-1.5"><StatusBadge status={inv.status} /></td>
      <td className="px-2 py-1.5 font-mono text-[10px] text-muted-foreground">{summary}</td>
    </tr>
  );
}

function shortVal(v: unknown): string {
  if (v === null || v === undefined) return String(v);
  if (typeof v === "string") return v.length > 20 ? `"${v.slice(0, 20)}…"` : `"${v}"`;
  if (typeof v === "object") return Array.isArray(v) ? `[${v.length}]` : `{${Object.keys(v).length}}`;
  return String(v);
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
function safeStringify(v: unknown): string {
  try { return JSON.stringify(v, null, 2); } catch { return String(v); }
}
