/**
 * Painel dedicado pro nó `if` — n8n-style com seletor de tipo de dado.
 *
 * UX: o usuário escolhe primeiro o **tipo** (string/number/dateTime/boolean/
 * array/object), depois o **operador** (operadores filtrados pelo tipo),
 * depois preenche os valores. Espelha exatamente o n8n.
 *
 * Shape salvo em `values`:
 *   left:     unknown (templatable)
 *   op:       string identificador do operador
 *   right:    unknown (templatable, ignorado em ops unárias)
 *   dataType: "string" | "number" | "dateTime" | "boolean" | "array" | "object"
 *             (opcional — usado só pela UI, runtime atual ignora)
 */
import { useEffect, useMemo } from "react";
import {
  ArrowRight,
  Braces,
  Brackets,
  Calendar,
  CheckCircle2,
  GitBranch,
  Hash,
  ToggleLeft,
  Type,
  XCircle,
} from "lucide-react";

import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { cn } from "~/lib/utils";

import type { CustomPanelProps } from "./types";
import { DEFAULT_SAMPLE_CONTEXT, hasTemplate, renderTemplate } from "./template";

type DataType = "string" | "number" | "dateTime" | "boolean" | "array" | "object";

type IfOp =
  // legados (compat com workflows já criados)
  | "eq"
  | "neq"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "contains"
  | "truthy"
  | "falsy"
  // n8n-style novos
  | "ncontains"
  | "startsWith"
  | "nstartsWith"
  | "endsWith"
  | "nendsWith"
  | "regex"
  | "nregex"
  | "isEmpty"
  | "isNotEmpty"
  | "exists"
  | "notExists"
  | "isAfter"
  | "isBefore"
  | "isAfterOrEqual"
  | "isBeforeOrEqual"
  | "isTrue"
  | "isFalse"
  | "lenEq"
  | "lenNeq"
  | "lenGt"
  | "lenGte"
  | "lenLt"
  | "lenLte";

interface OpDef {
  id: IfOp;
  label: string;
  short: string;
  /** Operador unário (não usa `right`). */
  unary: boolean;
  /** Tipos de dado em que esse operador faz sentido. */
  types: DataType[];
}

const OPS: OpDef[] = [
  // string
  { id: "eq", label: "é igual a", short: "=", unary: false, types: ["string", "number", "dateTime", "boolean"] },
  { id: "neq", label: "é diferente de", short: "≠", unary: false, types: ["string", "number", "dateTime", "boolean"] },
  { id: "contains", label: "contém", short: "⊃", unary: false, types: ["string", "array"] },
  { id: "ncontains", label: "não contém", short: "⊅", unary: false, types: ["string", "array"] },
  { id: "startsWith", label: "começa com", short: "⊳", unary: false, types: ["string"] },
  { id: "nstartsWith", label: "não começa com", short: "⋫", unary: false, types: ["string"] },
  { id: "endsWith", label: "termina com", short: "⊲", unary: false, types: ["string"] },
  { id: "nendsWith", label: "não termina com", short: "⋪", unary: false, types: ["string"] },
  { id: "regex", label: "casa com regex", short: "/.*/", unary: false, types: ["string"] },
  { id: "nregex", label: "não casa com regex", short: "/.*/̸", unary: false, types: ["string"] },
  // number
  { id: "gt", label: "maior que", short: ">", unary: false, types: ["number"] },
  { id: "gte", label: "maior ou igual", short: "≥", unary: false, types: ["number"] },
  { id: "lt", label: "menor que", short: "<", unary: false, types: ["number"] },
  { id: "lte", label: "menor ou igual", short: "≤", unary: false, types: ["number"] },
  // dateTime
  { id: "isAfter", label: "é depois de", short: "↗", unary: false, types: ["dateTime"] },
  { id: "isBefore", label: "é antes de", short: "↘", unary: false, types: ["dateTime"] },
  { id: "isAfterOrEqual", label: "é depois ou igual", short: "≥↗", unary: false, types: ["dateTime"] },
  { id: "isBeforeOrEqual", label: "é antes ou igual", short: "≤↘", unary: false, types: ["dateTime"] },
  // boolean
  { id: "isTrue", label: "é verdadeiro", short: "✓", unary: true, types: ["boolean"] },
  { id: "isFalse", label: "é falso", short: "✗", unary: true, types: ["boolean"] },
  // array length
  { id: "lenEq", label: "tamanho igual a", short: "#=", unary: false, types: ["array"] },
  { id: "lenNeq", label: "tamanho diferente de", short: "#≠", unary: false, types: ["array"] },
  { id: "lenGt", label: "tamanho maior que", short: "#>", unary: false, types: ["array"] },
  { id: "lenGte", label: "tamanho maior ou igual", short: "#≥", unary: false, types: ["array"] },
  { id: "lenLt", label: "tamanho menor que", short: "#<", unary: false, types: ["array"] },
  { id: "lenLte", label: "tamanho menor ou igual", short: "#≤", unary: false, types: ["array"] },
  // presença universal
  { id: "isEmpty", label: "está vazio", short: "∅", unary: true, types: ["string", "number", "dateTime", "boolean", "array", "object"] },
  { id: "isNotEmpty", label: "não está vazio", short: "≠∅", unary: true, types: ["string", "number", "dateTime", "boolean", "array", "object"] },
  { id: "exists", label: "existe", short: "∃", unary: true, types: ["string", "number", "dateTime", "boolean", "array", "object"] },
  { id: "notExists", label: "não existe", short: "∄", unary: true, types: ["string", "number", "dateTime", "boolean", "array", "object"] },
  // legados (truthy/falsy)
  { id: "truthy", label: "é truthy (legado)", short: "✓?", unary: true, types: ["boolean"] },
  { id: "falsy", label: "é falsy (legado)", short: "✗?", unary: true, types: ["boolean"] },
];

const OPS_BY_ID: Record<IfOp, OpDef> = Object.fromEntries(OPS.map((o) => [o.id, o])) as Record<IfOp, OpDef>;

const TYPE_META: Record<
  DataType,
  { label: string; icon: React.ComponentType<{ className?: string }>; color: string }
> = {
  string: { label: "String", icon: Type, color: "text-emerald-500" },
  number: { label: "Número", icon: Hash, color: "text-blue-500" },
  dateTime: { label: "Data & Hora", icon: Calendar, color: "text-violet-500" },
  boolean: { label: "Booleano", icon: ToggleLeft, color: "text-amber-500" },
  array: { label: "Array", icon: Brackets, color: "text-fuchsia-500" },
  object: { label: "Objeto", icon: Braces, color: "text-sky-500" },
};

const DATA_TYPES: DataType[] = ["string", "number", "dateTime", "boolean", "array", "object"];

/** Inferência do tipo a partir do operador legado salvo — pra workflows antigos
 *  que não têm `dataType` ainda, mostramos a melhor opção no dropdown. */
function inferDataType(op: IfOp): DataType {
  if (["gt", "gte", "lt", "lte"].includes(op)) return "number";
  if (["isAfter", "isBefore", "isAfterOrEqual", "isBeforeOrEqual"].includes(op)) return "dateTime";
  if (["isTrue", "isFalse", "truthy", "falsy"].includes(op)) return "boolean";
  if (op.startsWith("len")) return "array";
  return "string";
}

/* -------------------------------------------------------------------------- */
/* Painel                                                                      */
/* -------------------------------------------------------------------------- */

export function IfPanel({ values, onChange, onError, sampleContext }: CustomPanelProps) {
  const left = typeof values.left === "string" ? values.left : "";
  const right = typeof values.right === "string" ? values.right : "";
  const op = (typeof values.op === "string" ? values.op : "eq") as IfOp;
  const opDef = OPS_BY_ID[op] ?? OPS_BY_ID.eq;
  const dataType =
    (typeof values.dataType === "string" ? (values.dataType as DataType) : null) ??
    inferDataType(op);

  // Operadores disponíveis pro tipo escolhido.
  const availableOps = useMemo(
    () => OPS.filter((o) => o.types.includes(dataType)),
    [dataType],
  );

  // Se o op atual não pertence ao tipo selecionado, faz um reset suave pro
  // primeiro op disponível (mantém o left/right). Só roda quando dataType muda.
  useEffect(() => {
    if (!availableOps.some((o) => o.id === op) && availableOps.length > 0) {
      onChange({ op: availableOps[0].id });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataType]);

  // Validação
  useEffect(() => {
    onError?.("left", left.trim() === "" ? "Defina o valor à esquerda." : null);
  }, [left, onError]);
  useEffect(() => {
    const needsRight = !opDef.unary;
    onError?.(
      "right",
      needsRight && right.trim() === "" ? "Operador requer um valor à direita." : null,
    );
  }, [right, opDef.unary, onError]);

  // Usa o contexto real (upstream/pin) quando disponível. Cai pro sample
  // default só quando NÃO há run focado nem pin — assim o preview reflete
  // exatamente o que vai acontecer em runtime.
  const ctx = useMemo(
    () => ({
      input: sampleContext?.input ?? DEFAULT_SAMPLE_CONTEXT.input ?? {},
      vars: sampleContext?.vars ?? DEFAULT_SAMPLE_CONTEXT.vars ?? {},
      env: sampleContext?.env ?? DEFAULT_SAMPLE_CONTEXT.env ?? {},
      steps: sampleContext?.steps ?? DEFAULT_SAMPLE_CONTEXT.steps ?? {},
    }),
    [sampleContext],
  );
  const usingRealData = sampleContext !== undefined && sampleContext !== null;

  const evaluation = useMemo(() => {
    try {
      const l = hasTemplate(left) ? renderTemplate(left, ctx) : left;
      const r = hasTemplate(right) ? renderTemplate(right, ctx) : right;
      // Marca "noData" quando o lado esquerdo não resolveu (undefined/null/"")
      // — branco no preview pra usuário saber que falta dado.
      const leftIsEmpty =
        l === undefined ||
        l === null ||
        (typeof l === "string" && (l === "" || l === "undefined" || l === "null"));
      if (leftIsEmpty && !opDef.unary) {
        return { ok: true as const, l, r, result: false, state: "noData" as const };
      }
      const result = evaluate(op, l, r, dataType);
      return { ok: true as const, l, r, result, state: "resolved" as const };
    } catch (e) {
      return { ok: false as const, error: (e as Error).message, state: "error" as const };
    }
  }, [left, right, op, dataType, ctx, opDef.unary]);

  return (
    <div className="flex flex-col gap-6">
      <ConditionRow
        left={left}
        op={op}
        right={right}
        dataType={dataType}
        availableOps={availableOps}
        onChange={onChange}
      />
      <PreviewBox evaluation={evaluation} op={op} usingRealData={usingRealData} />
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
  dataType,
  availableOps,
  onChange,
}: {
  left: string;
  op: IfOp;
  right: string;
  dataType: DataType;
  availableOps: OpDef[];
  onChange: (patch: Record<string, unknown>) => void;
}) {
  const opDef = OPS_BY_ID[op];
  const typeMeta = TYPE_META[dataType];
  const TypeIcon = typeMeta.icon;
  return (
    <div className="rounded-lg border border-border bg-muted/30 p-4">
      <div className="mb-3 flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <GitBranch className="size-3.5" />
        <span>Condição</span>
      </div>

      <div className="mb-3 flex flex-col gap-1.5">
        <Label className="text-xs">Tipo de dado</Label>
        <Select
          value={dataType}
          onValueChange={(v) => onChange({ dataType: v as DataType })}
        >
          <SelectTrigger className="w-fit min-w-[12rem]">
            <SelectValue>
              <span className="flex items-center gap-1.5">
                <TypeIcon className={cn("size-3.5", typeMeta.color)} />
                {typeMeta.label}
              </span>
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {DATA_TYPES.map((dt) => {
              const m = TYPE_META[dt];
              const Icon = m.icon;
              return (
                <SelectItem key={dt} value={dt}>
                  <span className="flex items-center gap-1.5">
                    <Icon className={cn("size-3.5", m.color)} />
                    {m.label}
                  </span>
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
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
            placeholder={placeholderForType(dataType, "left")}
            spellCheck={false}
            className="font-mono text-xs"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">Operador</Label>
          <Select value={op} onValueChange={(v) => onChange({ op: v })}>
            <SelectTrigger className="min-w-[12rem]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {availableOps.map((o) => (
                <SelectItem key={o.id} value={o.id}>
                  <span className="mr-2 inline-block w-6 text-center font-mono text-xs text-muted-foreground">
                    {o.short}
                  </span>
                  {o.label}
                </SelectItem>
              ))}
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
            placeholder={opDef.unary ? "— não usado —" : placeholderForType(dataType, "right")}
            spellCheck={false}
            disabled={opDef.unary}
            className="font-mono text-xs"
          />
        </div>
      </div>

      <p className="mt-2 text-[11px] text-muted-foreground">
        Aceita templates <code className="font-mono">{"{{ ... }}"}</code> contra{" "}
        <code className="font-mono">input</code>, <code className="font-mono">vars</code>,{" "}
        <code className="font-mono">env</code> e <code className="font-mono">steps</code>.
      </p>
    </div>
  );
}

function placeholderForType(t: DataType, side: "left" | "right"): string {
  const refs = {
    left: {
      string: "{{ input.body.message.content }}",
      number: "{{ steps.fetch.body.count }}",
      dateTime: "{{ input.timestamp }}",
      boolean: "{{ input.ai_enabled }}",
      array: "{{ input.items }}",
      object: "{{ input.body }}",
    },
    right: {
      string: '"hello" ou {{ vars.target }}',
      number: "10 ou {{ vars.threshold }}",
      dateTime: "2026-01-01T00:00:00Z",
      boolean: "true",
      array: "5 (tamanho)",
      object: "—",
    },
  } as const;
  return refs[side][t];
}

/* -------------------------------------------------------------------------- */
/* Preview                                                                     */
/* -------------------------------------------------------------------------- */

type PreviewState =
  | { ok: true; l: unknown; r: unknown; result: boolean; state: "resolved" | "noData" }
  | { ok: false; error: string; state: "error" };

function PreviewBox({
  evaluation,
  op,
  usingRealData,
}: {
  evaluation: PreviewState;
  op: IfOp;
  usingRealData: boolean;
}) {
  const opDef = OPS_BY_ID[op];

  // 3 estados visuais — borda/fundo mudam:
  //   "error"     vermelho — não consegui avaliar
  //   "noData"    branco/cinza — left resolveu pra undefined/vazio
  //   "resolved"  verde — avaliou contra dados de verdade, mostra resultado
  if (evaluation.state === "error") {
    return (
      <div className="rounded-lg border-2 border-rose-500/40 bg-rose-500/5 p-3 text-xs">
        <div className="mb-1 flex items-center gap-2 font-medium text-rose-700 dark:text-rose-400">
          <XCircle className="size-3.5" />
          Erro de avaliação
        </div>
        <p className="font-mono text-[11px] text-muted-foreground">
          {"error" in evaluation ? evaluation.error : "Sem detalhes"}
        </p>
      </div>
    );
  }

  if (evaluation.state === "noData") {
    return (
      <div className="rounded-lg border-2 border-border bg-muted/20 p-3">
        <div className="mb-2 flex items-center gap-2 text-[11px] uppercase tracking-wide text-muted-foreground">
          <span>Sem dados pra avaliar</span>
          <span className="ml-auto rounded bg-muted px-1.5 py-0.5 text-[10px] normal-case tracking-normal">
            {usingRealData ? "Path não existe no input" : "Sem run focado"}
          </span>
        </div>
        <p className="text-[11px] text-muted-foreground">
          O lado esquerdo resolveu como <code className="font-mono">undefined</code>. Verifique se
          o caminho está correto (ex.: <code className="font-mono">input.body.X</code>) ou execute
          o workflow uma vez pra popular os dados.
        </p>
      </div>
    );
  }

  // resolved → verde com resultado destacado
  const { l, r, result } = evaluation;
  return (
    <div
      className={cn(
        "rounded-lg border-2 p-3 transition-colors",
        result
          ? "border-emerald-500/40 bg-emerald-500/5"
          : "border-amber-500/40 bg-amber-500/5",
      )}
    >
      <div className="mb-2 flex items-center gap-2 text-[11px] uppercase tracking-wide text-muted-foreground">
        <span>Avaliação contra dados {usingRealData ? "do upstream" : "de exemplo"}</span>
        <span
          className={cn(
            "ml-auto rounded px-1.5 py-0.5 text-[10px] normal-case tracking-normal",
            usingRealData
              ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
              : "bg-muted text-muted-foreground",
          )}
        >
          {usingRealData ? "DADOS REAIS" : "DEFAULT_SAMPLE_CONTEXT"}
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
          {result ? <CheckCircle2 className="size-3" /> : <XCircle className="size-3" />}
          {String(result)}
        </span>
      </div>

      <p className="mt-2 text-[11px] text-muted-foreground">
        Em runtime, o nó vai seguir a aresta label <code>{String(result)}</code>.
      </p>

      {/* Resultado expandido quando true — mostra valor resolvido por extenso */}
      {result && (
        <div className="mt-3 rounded-md border border-emerald-500/30 bg-emerald-500/10 p-2">
          <div className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
            <CheckCircle2 className="size-3" />
            Resultado encontrado
          </div>
          <pre className="overflow-x-auto whitespace-pre-wrap font-mono text-[11px] text-foreground">
            {JSON.stringify(l, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

function ValueChip({ value }: { value: unknown }) {
  const display = typeof value === "string" ? `"${value}"` : String(value);
  const tone =
    typeof value === "string"
      ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
      : typeof value === "number"
        ? "bg-blue-500/10 text-blue-700 dark:text-blue-400"
        : typeof value === "boolean"
          ? "bg-amber-500/10 text-amber-700 dark:text-amber-400"
          : "bg-muted text-muted-foreground";
  return (
    <span
      className={cn(
        "inline-flex max-w-[14rem] items-center rounded px-2 py-0.5 truncate",
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
/* Avaliação (espelha back/src/lib/engine/nodes/if.ts + n8n-style)             */
/* -------------------------------------------------------------------------- */

function evaluate(op: IfOp, left: unknown, right: unknown, dataType: DataType): boolean {
  // Coerção por tipo pra preview reflectir o que o handler faria.
  const lc = coerce(left, dataType);
  const rc = coerce(right, dataType);

  switch (op) {
    // legados
    case "eq":
      return lc === rc;
    case "neq":
      return lc !== rc;
    case "truthy":
      return Boolean(left);
    case "falsy":
      return !left;
    case "gt":
      return Number(lc) > Number(rc);
    case "gte":
      return Number(lc) >= Number(rc);
    case "lt":
      return Number(lc) < Number(rc);
    case "lte":
      return Number(lc) <= Number(rc);
    case "contains":
      if (Array.isArray(left)) return left.includes(rc);
      if (typeof left === "string") return left.includes(String(rc));
      return false;
    // novos
    case "ncontains":
      if (Array.isArray(left)) return !left.includes(rc);
      if (typeof left === "string") return !left.includes(String(rc));
      return true;
    case "startsWith":
      return String(lc).startsWith(String(rc));
    case "nstartsWith":
      return !String(lc).startsWith(String(rc));
    case "endsWith":
      return String(lc).endsWith(String(rc));
    case "nendsWith":
      return !String(lc).endsWith(String(rc));
    case "regex":
      try {
        return new RegExp(String(rc)).test(String(lc));
      } catch {
        return false;
      }
    case "nregex":
      try {
        return !new RegExp(String(rc)).test(String(lc));
      } catch {
        return true;
      }
    case "isEmpty":
      return isEmpty(left);
    case "isNotEmpty":
      return !isEmpty(left);
    case "exists":
      return left !== undefined && left !== null;
    case "notExists":
      return left === undefined || left === null;
    case "isAfter": {
      const a = new Date(String(lc)).getTime();
      const b = new Date(String(rc)).getTime();
      return Number.isFinite(a) && Number.isFinite(b) && a > b;
    }
    case "isBefore": {
      const a = new Date(String(lc)).getTime();
      const b = new Date(String(rc)).getTime();
      return Number.isFinite(a) && Number.isFinite(b) && a < b;
    }
    case "isAfterOrEqual": {
      const a = new Date(String(lc)).getTime();
      const b = new Date(String(rc)).getTime();
      return Number.isFinite(a) && Number.isFinite(b) && a >= b;
    }
    case "isBeforeOrEqual": {
      const a = new Date(String(lc)).getTime();
      const b = new Date(String(rc)).getTime();
      return Number.isFinite(a) && Number.isFinite(b) && a <= b;
    }
    case "isTrue":
      return left === true || String(left).toLowerCase() === "true";
    case "isFalse":
      return left === false || String(left).toLowerCase() === "false";
    case "lenEq":
      return arrLen(left) === Number(rc);
    case "lenNeq":
      return arrLen(left) !== Number(rc);
    case "lenGt":
      return arrLen(left) > Number(rc);
    case "lenGte":
      return arrLen(left) >= Number(rc);
    case "lenLt":
      return arrLen(left) < Number(rc);
    case "lenLte":
      return arrLen(left) <= Number(rc);
  }
}

function coerce(v: unknown, t: DataType): unknown {
  if (t === "string") {
    // Crítico pra `eq`/`neq` em modo String: usuário digita `true` no Valor 2
    // e o left vem como boolean true do upstream. Sem coerção, `true === "true"`
    // dá false e o ramo TRUE nunca dispara. n8n stringifica os dois lados.
    if (v == null) return "";
    return typeof v === "string" ? v : String(v);
  }
  if (t === "number") return typeof v === "number" ? v : Number(v);
  if (t === "boolean") {
    if (typeof v === "boolean") return v;
    if (typeof v === "string") return v.toLowerCase() === "true";
    return Boolean(v);
  }
  return v;
}

function isEmpty(v: unknown): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v === "string") return v.length === 0;
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === "object") return Object.keys(v as object).length === 0;
  return false;
}

function arrLen(v: unknown): number {
  if (Array.isArray(v)) return v.length;
  if (typeof v === "string") return v.length;
  if (v && typeof v === "object") return Object.keys(v).length;
  return 0;
}
