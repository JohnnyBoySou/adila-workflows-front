/**
 * Painel do nó `switch` — estilo n8n.
 *
 * Cada regra é INDEPENDENTE: tem seu próprio leftValue (template), tipo de
 * dado, operador (== / != / > / < / contém / regex / vazio…), rightValue e
 * label da aresta que será seguida quando aquela regra for verdadeira.
 *
 * Avaliação em ordem — primeira regra verdadeira ganha. Se nenhuma casar,
 * cai no Default (aresta com label "default").
 *
 * Persistido em `values`:
 *   {
 *     rules: Array<{
 *       left: string,          // template
 *       op: OperatorId,        // eq / neq / gt / contains / regex / isEmpty…
 *       dataType: "string"|"number"|"boolean"|"dateTime",
 *       right: string,         // template (vazio em ops unárias)
 *       label: string,         // label da aresta de saída
 *     }>,
 *     default?: string,        // label da aresta default. Padrão "default".
 *   }
 *
 * O handler do backend (switch.ts) recebe esse shape via `_n8n` agora, mas
 * vamos passar uma forma achatada que ele consome direto — sem _n8n.
 */
import { useEffect, useMemo } from "react";
import { GitBranch, Plus, ShieldQuestion, Trash2, ChevronDown, ChevronUp } from "lucide-react";

import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { cn } from "~/lib/utils";

import type { CustomPanelProps } from "./types";

const OPERATORS = [
  { id: "eq",         label: "é igual a",       unary: false, types: ["string","number","boolean","dateTime"] as const },
  { id: "neq",        label: "é diferente de",  unary: false, types: ["string","number","boolean","dateTime"] as const },
  { id: "gt",         label: "maior que",       unary: false, types: ["number","dateTime"] as const },
  { id: "gte",        label: "maior ou igual",  unary: false, types: ["number","dateTime"] as const },
  { id: "lt",         label: "menor que",       unary: false, types: ["number","dateTime"] as const },
  { id: "lte",        label: "menor ou igual",  unary: false, types: ["number","dateTime"] as const },
  { id: "contains",   label: "contém",          unary: false, types: ["string"] as const },
  { id: "ncontains",  label: "não contém",      unary: false, types: ["string"] as const },
  { id: "startsWith", label: "começa com",      unary: false, types: ["string"] as const },
  { id: "endsWith",   label: "termina com",     unary: false, types: ["string"] as const },
  { id: "regex",      label: "regex casa",      unary: false, types: ["string"] as const },
  { id: "isEmpty",    label: "está vazio",      unary: true,  types: ["string","number","boolean","dateTime"] as const },
  { id: "notEmpty",   label: "não está vazio",  unary: true,  types: ["string","number","boolean","dateTime"] as const },
] as const;

type OperatorId = (typeof OPERATORS)[number]["id"];
type DataType = "string" | "number" | "boolean" | "dateTime";

interface Rule {
  left: string;
  op: OperatorId;
  dataType: DataType;
  right: string;
  label: string;
}

function readRules(raw: unknown): Rule[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((r) => {
    if (!r || typeof r !== "object") return [];
    const rr = r as Record<string, unknown>;
    const op = typeof rr.op === "string" ? rr.op : "eq";
    return [
      {
        left: typeof rr.left === "string" ? rr.left : "",
        op: (OPERATORS.find((o) => o.id === op)?.id ?? "eq") as OperatorId,
        dataType:
          rr.dataType === "number" || rr.dataType === "boolean" || rr.dataType === "dateTime"
            ? rr.dataType
            : "string",
        right: typeof rr.right === "string" ? rr.right : "",
        label: typeof rr.label === "string" ? rr.label : "",
      },
    ];
  });
}

export function SwitchPanel({ values, onChange, onError }: CustomPanelProps) {
  const rules = useMemo(() => readRules(values.rules), [values.rules]);
  const defaultLabel = typeof values.default === "string" ? values.default : "default";

  useEffect(() => {
    const missingLabel = rules.findIndex((r) => r.label.trim() === "");
    onError?.(
      "rules",
      rules.length === 0
        ? "Adicione pelo menos uma regra."
        : missingLabel >= 0
          ? `Regra #${missingLabel + 1}: defina o label da aresta de saída.`
          : null,
    );
  }, [rules, onError]);

  function update(next: Rule[]) {
    onChange({ rules: next });
  }

  function addRule() {
    update([
      ...rules,
      {
        left: "{{ prev.body.X }}",
        op: "eq",
        dataType: "string",
        right: "",
        label: rules.length === 0 ? "match1" : `match${rules.length + 1}`,
      },
    ]);
  }

  function patchRule(i: number, patch: Partial<Rule>) {
    update(rules.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  function removeRule(i: number) {
    update(rules.filter((_, idx) => idx !== i));
  }

  function move(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= rules.length) return;
    const next = rules.slice();
    [next[i], next[j]] = [next[j]!, next[i]!];
    update(next);
  }

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-start gap-2 rounded-md border border-border bg-muted/30 px-3 py-2">
        <GitBranch className="mt-0.5 size-4 text-muted-foreground" />
        <div className="text-[11px] text-muted-foreground">
          Cada regra é avaliada em ordem. <strong className="text-foreground">A primeira que casar</strong>{" "}
          escolhe o ramo seguido. Se nenhuma casar, segue pelo <strong className="text-foreground">Default</strong>.
        </div>
      </header>

      <div className="flex items-center justify-between">
        <Label className="text-xs font-medium">Regras</Label>
        <Button size="sm" variant="outline" onClick={addRule} className="gap-1.5">
          <Plus className="size-3.5" />
          Adicionar regra
        </Button>
      </div>

      {rules.length === 0 ? (
        <div className="rounded-md border border-dashed border-border bg-muted/30 px-3 py-6 text-center text-xs text-muted-foreground">
          Nenhuma regra. Clique em <strong>Adicionar regra</strong> pra criar a primeira condição.
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {rules.map((rule, i) => (
            <RuleEditor
              key={i}
              index={i}
              rule={rule}
              isFirst={i === 0}
              isLast={i === rules.length - 1}
              onPatch={(p) => patchRule(i, p)}
              onRemove={() => removeRule(i)}
              onMoveUp={() => move(i, -1)}
              onMoveDown={() => move(i, 1)}
            />
          ))}
        </div>
      )}

      <DefaultRow
        value={defaultLabel}
        onChange={(v) => onChange({ default: v })}
      />
    </div>
  );
}

function RuleEditor({
  index,
  rule,
  isFirst,
  isLast,
  onPatch,
  onRemove,
  onMoveUp,
  onMoveDown,
}: {
  index: number;
  rule: Rule;
  isFirst: boolean;
  isLast: boolean;
  onPatch: (p: Partial<Rule>) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const opMeta = OPERATORS.find((o) => o.id === rule.op) ?? OPERATORS[0];
  const allowedTypes = opMeta.types;
  const validDataType = (allowedTypes as readonly DataType[]).includes(rule.dataType)
    ? rule.dataType
    : (allowedTypes[0] as DataType);

  return (
    <div className="rounded-lg border border-border bg-background p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="rounded-full bg-primary/10 px-2 py-0.5 font-mono text-[10px] text-primary">
          #{index + 1}
        </span>
        <div className="flex items-center gap-0.5">
          <Button
            size="icon-sm"
            variant="ghost"
            disabled={isFirst}
            onClick={onMoveUp}
            title="Mover pra cima"
            className="size-6"
          >
            <ChevronUp className="size-3.5" />
          </Button>
          <Button
            size="icon-sm"
            variant="ghost"
            disabled={isLast}
            onClick={onMoveDown}
            title="Mover pra baixo"
            className="size-6"
          >
            <ChevronDown className="size-3.5" />
          </Button>
          <Button
            size="icon-sm"
            variant="ghost"
            onClick={onRemove}
            title="Remover regra"
            className="size-6 text-rose-500 hover:bg-rose-500/10 hover:text-rose-500"
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
        <div>
          <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Valor (esquerdo)</Label>
          <Input
            value={rule.left}
            onChange={(e) => onPatch({ left: e.target.value })}
            placeholder="{{ prev.body.status }}"
            spellCheck={false}
            className="mt-1 font-mono text-xs"
          />
        </div>

        <div className="flex flex-col gap-1">
          <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Tipo</Label>
          <select
            value={validDataType}
            onChange={(e) => onPatch({ dataType: e.target.value as DataType })}
            className="rounded-md border border-border bg-background px-2 py-1.5 text-xs"
          >
            {(allowedTypes as readonly DataType[]).map((t) => (
              <option key={t} value={t}>
                {t === "dateTime" ? "data" : t}
              </option>
            ))}
          </select>
          <Label className="mt-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">Operador</Label>
          <select
            value={rule.op}
            onChange={(e) => onPatch({ op: e.target.value as OperatorId })}
            className="rounded-md border border-border bg-background px-2 py-1.5 text-xs"
          >
            {OPERATORS.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
            {opMeta.unary ? "—" : "Valor (direito)"}
          </Label>
          <Input
            value={rule.right}
            onChange={(e) => onPatch({ right: e.target.value })}
            disabled={opMeta.unary}
            placeholder={
              opMeta.unary
                ? "(não usado neste operador)"
                : validDataType === "number"
                  ? "42"
                  : validDataType === "boolean"
                    ? "true"
                    : "POST"
            }
            spellCheck={false}
            className="mt-1 font-mono text-xs"
          />
        </div>
      </div>

      <div className="mt-3 grid grid-cols-[auto_1fr] items-center gap-2 border-t border-border pt-3">
        <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
          → Aresta
        </Label>
        <Input
          value={rule.label}
          onChange={(e) => onPatch({ label: e.target.value })}
          placeholder="ex: match1, ok, premium"
          spellCheck={false}
          className={cn("font-mono text-xs", !rule.label.trim() && "border-rose-500/60")}
        />
      </div>
    </div>
  );
}

function DefaultRow({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
      <div className="mb-2 flex items-center gap-2 text-xs font-medium text-amber-700 dark:text-amber-400">
        <ShieldQuestion className="size-3.5" />
        <span>Default (quando nenhuma regra casar)</span>
      </div>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="default"
        spellCheck={false}
        className="font-mono text-xs"
      />
      <p className="mt-1.5 text-[10px] text-amber-700/80 dark:text-amber-400/70">
        Conecte uma aresta saindo deste nó com EXATAMENTE este label pra capturar os casos não-matched.
      </p>
    </div>
  );
}
