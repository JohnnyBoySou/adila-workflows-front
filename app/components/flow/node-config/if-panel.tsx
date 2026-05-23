/**
 * Painel dedicado pro nó `if` — substitui o renderer genérico.
 *
 * Estrutura visual igual à condição do n8n: uma "regra" composta por
 * `left | operador | right`, com preview ao vivo do que será avaliado
 * (usa pinned data + DEFAULT_SAMPLE_CONTEXT como fallback) e dois cards
 * mostrando os dois ramos (`true` / `false`) — lembrando o usuário que
 * o canvas precisa de duas edges com esses labels.
 *
 * Shape escrito em `values` (compatível com o handler atual):
 *   left:  unknown (templatable)
 *   op:    "eq"|"neq"|"gt"|"gte"|"lt"|"lte"|"contains"|"truthy"|"falsy"
 *   right: unknown (templatable, ignorado em truthy/falsy)
 */
import { useEffect, useMemo } from "react";
import {
  ArrowRight,
  CheckCircle2,
  Equal,
  EqualNot,
  GitBranch,
  Search,
  Sigma,
  XCircle,
} from "lucide-react";

import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { cn } from "~/lib/utils";

import type { CustomPanelProps } from "./types";
import { DEFAULT_SAMPLE_CONTEXT, hasTemplate, renderTemplate } from "./template";

type IfOp =
  | "eq"
  | "neq"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "contains"
  | "truthy"
  | "falsy";

interface OpDef {
  id: IfOp;
  label: string;
  short: string;
  hint: string;
  unary: boolean;
  group: "comparison" | "numeric" | "search" | "presence";
}

// Ordenados de cima pra baixo na ordem em que a maioria dos usuários pensa.
const OPS: OpDef[] = [
  { id: "eq", label: "é igual a", short: "=", hint: "Estrita (===)", unary: false, group: "comparison" },
  { id: "neq", label: "é diferente de", short: "≠", hint: "Estrita (!==)", unary: false, group: "comparison" },
  { id: "gt", label: "maior que", short: ">", hint: "Numérico", unary: false, group: "numeric" },
  { id: "gte", label: "maior ou igual", short: "≥", hint: "Numérico", unary: false, group: "numeric" },
  { id: "lt", label: "menor que", short: "<", hint: "Numérico", unary: false, group: "numeric" },
  { id: "lte", label: "menor ou igual", short: "≤", hint: "Numérico", unary: false, group: "numeric" },
  { id: "contains", label: "contém", short: "⊃", hint: "String ou array", unary: false, group: "search" },
  { id: "truthy", label: "é truthy", short: "✓", hint: "Boolean(value) === true", unary: true, group: "presence" },
  { id: "falsy", label: "é falsy", short: "✗", hint: "!value === true", unary: true, group: "presence" },
];

const OPS_BY_ID: Record<IfOp, OpDef> = Object.fromEntries(OPS.map((o) => [o.id, o])) as Record<
  IfOp,
  OpDef
>;

const GROUP_META: Record<OpDef["group"], { label: string; icon: React.ComponentType<{ className?: string }> }> = {
  comparison: { label: "Comparação", icon: Equal },
  numeric: { label: "Numérico", icon: Sigma },
  search: { label: "Pesquisa", icon: Search },
  presence: { label: "Presença", icon: EqualNot },
};

/* -------------------------------------------------------------------------- */
/* Painel                                                                      */
/* -------------------------------------------------------------------------- */

export function IfPanel({ values, onChange, onError }: CustomPanelProps) {
  const left = typeof values.left === "string" ? values.left : "";
  const right = typeof values.right === "string" ? values.right : "";
  const op = (typeof values.op === "string" ? values.op : "truthy") as IfOp;
  const opDef = OPS_BY_ID[op] ?? OPS_BY_ID.truthy;

  // Validação: precisa de `left`. Para ops binárias, precisa de `right`.
  useEffect(() => {
    onError?.("left", left.trim() === "" ? "Defina o lado esquerdo." : null);
  }, [left, onError]);
  useEffect(() => {
    const needsRight = !opDef.unary;
    onError?.(
      "right",
      needsRight && right.trim() === "" ? "Operador requer um valor à direita." : null,
    );
  }, [right, opDef.unary, onError]);

  // Resolve o template usando o sample context — preview, sem efeitos.
  const evaluation = useMemo(() => {
    try {
      const l = hasTemplate(left) ? renderTemplate(left, DEFAULT_SAMPLE_CONTEXT) : left;
      const r = hasTemplate(right) ? renderTemplate(right, DEFAULT_SAMPLE_CONTEXT) : right;
      const result = evaluate(op, l, r);
      return { ok: true as const, l, r, result };
    } catch (e) {
      return { ok: false as const, error: (e as Error).message };
    }
  }, [left, right, op]);

  return (
    <div className="flex flex-col gap-6">
      <ConditionRow
        left={left}
        op={op}
        right={right}
        onChange={(patch) => onChange(patch)}
      />
      <PreviewBox evaluation={evaluation} op={op} />
      <BranchHelp />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Condition row                                                               */
/* -------------------------------------------------------------------------- */

function ConditionRow({
  left,
  op,
  right,
  onChange,
}: {
  left: string;
  op: IfOp;
  right: string;
  onChange: (patch: Record<string, unknown>) => void;
}) {
  const opDef = OPS_BY_ID[op];
  return (
    <div className="rounded-lg border border-border bg-muted/30 p-4">
      <div className="mb-3 flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <GitBranch className="size-3.5" />
        <span>Condição</span>
      </div>

      <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="if-left" className="text-xs">
            Valor 1
          </Label>
          <Input
            id="if-left"
            value={left}
            onChange={(e) => onChange({ left: e.target.value })}
            placeholder="{{ steps.fetch.body.status }}"
            spellCheck={false}
            className="font-mono text-xs"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">Operador</Label>
          <Select value={op} onValueChange={(v) => onChange({ op: v })}>
            <SelectTrigger className="min-w-[10rem]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(["comparison", "numeric", "search", "presence"] as const).map((g) => {
                const items = OPS.filter((o) => o.group === g);
                const GroupIcon = GROUP_META[g].icon;
                return (
                  <SelectGroup key={g}>
                    <SelectLabel className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                      <GroupIcon className="size-3" />
                      {GROUP_META[g].label}
                    </SelectLabel>
                    {items.map((o) => (
                      <SelectItem key={o.id} value={o.id}>
                        <span className="mr-2 inline-block w-4 text-center font-mono text-xs text-muted-foreground">
                          {o.short}
                        </span>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                );
              })}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="if-right" className={cn("text-xs", opDef.unary && "opacity-40")}>
            Valor 2
          </Label>
          <Input
            id="if-right"
            value={right}
            onChange={(e) => onChange({ right: e.target.value })}
            placeholder={opDef.unary ? "— não usado —" : "200 ou {{ vars.threshold }}"}
            spellCheck={false}
            disabled={opDef.unary}
            className="font-mono text-xs"
          />
        </div>
      </div>

      <p className="mt-2 text-[11px] text-muted-foreground">
        {opDef.hint}. Os dois lados aceitam <code className="font-mono">{"{{ ... }}"}</code> contra <code className="font-mono">input</code>, <code className="font-mono">vars</code>, <code className="font-mono">env</code> e <code className="font-mono">steps</code>.
      </p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Preview                                                                     */
/* -------------------------------------------------------------------------- */

type PreviewState =
  | { ok: true; l: unknown; r: unknown; result: boolean }
  | { ok: false; error: string };

function PreviewBox({ evaluation, op }: { evaluation: PreviewState; op: IfOp }) {
  const opDef = OPS_BY_ID[op];

  if (!evaluation.ok) {
    return (
      <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
        Não consegui avaliar: {evaluation.error}
      </div>
    );
  }

  const { l, r, result } = evaluation;

  return (
    <div className="rounded-lg border border-border bg-background p-3">
      <div className="mb-2 flex items-center gap-2 text-[11px] uppercase tracking-wide text-muted-foreground">
        <span>Avaliação contra dados-exemplo</span>
        <span className="ml-auto rounded bg-muted px-1.5 py-0.5 text-[10px] normal-case tracking-normal text-muted-foreground">
          DEFAULT_SAMPLE_CONTEXT
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2 font-mono text-xs">
        <ValueChip value={l} />
        <span className="rounded bg-muted px-2 py-0.5 text-muted-foreground">{opDef.short}</span>
        {!opDef.unary && <ValueChip value={r} />}
        <ArrowRight className="size-3.5 text-muted-foreground" />
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium",
            result
              ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
              : "bg-rose-500/15 text-rose-700 dark:text-rose-400",
          )}
        >
          {result ? (
            <>
              <CheckCircle2 className="size-3.5" /> true
            </>
          ) : (
            <>
              <XCircle className="size-3.5" /> false
            </>
          )}
        </span>
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">
        Em runtime, o nó vai seguir a aresta com label{" "}
        <code className="font-mono">{result ? "true" : "false"}</code>.
      </p>
    </div>
  );
}

function ValueChip({ value }: { value: unknown }) {
  const display =
    value === undefined
      ? "undefined"
      : value === null
        ? "null"
        : typeof value === "string"
          ? JSON.stringify(value)
          : typeof value === "object"
            ? JSON.stringify(value)
            : String(value);
  const tone =
    value === undefined || value === null
      ? "text-muted-foreground"
      : typeof value === "number" || typeof value === "boolean"
        ? "text-sky-700 dark:text-sky-400"
        : "text-foreground";
  return (
    <span
      className={cn(
        "max-w-[14rem] truncate rounded border border-border bg-muted/40 px-2 py-0.5",
        tone,
      )}
      title={display}
    >
      {display}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* Branch help                                                                 */
/* -------------------------------------------------------------------------- */

function BranchHelp() {
  return (
    <div className="rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">
      <div className="mb-2 font-medium text-foreground">Saídas esperadas no canvas</div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-emerald-700 dark:text-emerald-400">
          <CheckCircle2 className="size-3" /> true
        </span>
        <span className="inline-flex items-center gap-1 rounded-full border border-rose-500/40 bg-rose-500/10 px-2 py-0.5 text-rose-700 dark:text-rose-400">
          <XCircle className="size-3" /> false
        </span>
      </div>
      <p className="mt-2">
        Conecte dois nós a partir deste — o engine escolhe a aresta cujo label bate com o resultado. Se faltar alguma, o fluxo termina nesse ramo.
      </p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Avaliação (espelha back/src/lib/engine/nodes/if.ts)                          */
/* -------------------------------------------------------------------------- */

function evaluate(op: IfOp, left: unknown, right: unknown): boolean {
  switch (op) {
    case "eq":
      return left === right;
    case "neq":
      return left !== right;
    case "truthy":
      return Boolean(left);
    case "falsy":
      return !left;
    case "gt":
      return Number(left) > Number(right);
    case "gte":
      return Number(left) >= Number(right);
    case "lt":
      return Number(left) < Number(right);
    case "lte":
      return Number(left) <= Number(right);
    case "contains":
      if (Array.isArray(left)) return left.includes(right);
      if (typeof left === "string") return left.includes(String(right));
      return false;
  }
}
