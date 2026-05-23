/**
 * Painel dedicado pro nó `switch`. Substitui o renderer genérico:
 *
 *   - Campo `value` (o que avaliar) com suporte a template.
 *   - Lista editável de cases — cada linha tem `match` + `label`,
 *     com botão pra remover e setas pra reordenar. Sem JSON cru.
 *   - Campo `default` (label da aresta default).
 *   - Preview ao vivo: avalia o `value` contra os cases (com pinned/sample
 *     context) e marca qual ramo seria escolhido.
 *
 * O shape persistido em `values` é exatamente o mesmo que o handler atual
 * lê: `{ value, cases: SwitchCase[], default? }`. Cases tem `match`
 * como `unknown` — aceitamos string e tentamos converter pra `number`,
 * `boolean` ou `null` se o usuário digitar literais (preserva o `===`
 * do backend).
 */
import { useEffect, useMemo } from "react";
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  CheckCircle2,
  GitBranch,
  Hash,
  Plus,
  ShieldQuestion,
  Trash2,
} from "lucide-react";

import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { cn } from "~/lib/utils";

import type { CustomPanelProps } from "./types";
import { DEFAULT_SAMPLE_CONTEXT, hasTemplate, renderTemplate } from "./template";

interface SwitchCase {
  match: unknown;
  label: string;
}

interface DraftCase {
  /** Form do match — string crua que o usuário digitou. */
  raw: string;
  /** Mesmo valor "coerced" para o `match` final (number, bool, null, etc). */
  match: unknown;
  label: string;
}

/* -------------------------------------------------------------------------- */
/* Painel                                                                      */
/* -------------------------------------------------------------------------- */

export function SwitchPanel({ values, onChange, onError }: CustomPanelProps) {
  const value = typeof values.value === "string" ? values.value : "";
  const defaultLabel = typeof values.default === "string" ? values.default : "";
  const cases = useMemo(() => readCases(values.cases), [values.cases]);

  // Sincroniza erros: `value` obrigatório; cada `label` obrigatório.
  useEffect(() => {
    onError?.("value", value.trim() === "" ? "Defina o valor a comparar." : null);
  }, [value, onError]);

  useEffect(() => {
    const emptyIdx = cases.findIndex((c) => c.label.trim() === "");
    onError?.(
      "cases",
      cases.length === 0
        ? "Adicione pelo menos um caso."
        : emptyIdx >= 0
          ? `Case #${emptyIdx + 1} sem label.`
          : null,
    );
  }, [cases, onError]);

  function updateCases(next: DraftCase[]) {
    onChange({ cases: writeCases(next) });
  }

  function addCase() {
    updateCases([...cases, { raw: "", match: "", label: "" }]);
  }

  function removeCase(index: number) {
    updateCases(cases.filter((_, i) => i !== index));
  }

  function patchCase(index: number, patch: Partial<DraftCase>) {
    updateCases(cases.map((c, i) => (i === index ? { ...c, ...patch } : c)));
  }

  function moveCase(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= cases.length) return;
    const next = cases.slice();
    [next[index], next[target]] = [next[target]!, next[index]!];
    updateCases(next);
  }

  // Preview: resolve o template do `value` e procura match.
  const preview = useMemo(() => {
    try {
      const resolved = hasTemplate(value)
        ? renderTemplate(value, DEFAULT_SAMPLE_CONTEXT)
        : value;
      const hit = cases.findIndex((c) => resolved === c.match);
      const matched =
        hit >= 0 ? cases[hit]!.label : defaultLabel.trim() || "default";
      return { ok: true as const, resolved, hit, matched };
    } catch (e) {
      return { ok: false as const, error: (e as Error).message };
    }
  }, [value, cases, defaultLabel]);

  return (
    <div className="flex flex-col gap-6">
      <ValueRow value={value} onChange={(v) => onChange({ value: v })} />
      <CasesEditor
        cases={cases}
        activeIndex={preview.ok ? preview.hit : -1}
        onAdd={addCase}
        onRemove={removeCase}
        onPatch={patchCase}
        onMove={moveCase}
      />
      <DefaultRow
        value={defaultLabel}
        activeWhenNoMatch={preview.ok && preview.hit < 0}
        onChange={(v) => onChange({ default: v })}
      />
      <PreviewBox preview={preview} />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Value row                                                                   */
/* -------------------------------------------------------------------------- */

function ValueRow({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 p-4">
      <div className="mb-3 flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <GitBranch className="size-3.5" />
        <span>Valor a comparar</span>
      </div>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="{{ steps.fetch.body.status }}"
        spellCheck={false}
        className="font-mono text-xs"
      />
      <p className="mt-2 text-[11px] text-muted-foreground">
        Aceita templates contra <code className="font-mono">input</code>,{" "}
        <code className="font-mono">vars</code>, <code className="font-mono">env</code> e{" "}
        <code className="font-mono">steps</code>. Comparação é estrita (<code className="font-mono">===</code>) — números e strings <em>não</em> coincidem.
      </p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Cases editor                                                                */
/* -------------------------------------------------------------------------- */

function CasesEditor({
  cases,
  activeIndex,
  onAdd,
  onRemove,
  onPatch,
  onMove,
}: {
  cases: DraftCase[];
  activeIndex: number;
  onAdd: () => void;
  onRemove: (index: number) => void;
  onPatch: (index: number, patch: Partial<DraftCase>) => void;
  onMove: (index: number, direction: -1 | 1) => void;
}) {
  return (
    <div>
      <div className="mb-2 flex items-end justify-between">
        <div>
          <Label className="text-xs font-medium">Casos</Label>
          <p className="text-[11px] text-muted-foreground">
            Avaliados em ordem; o primeiro match define o ramo escolhido.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={onAdd} className="gap-1.5">
          <Plus className="size-3.5" />
          Adicionar caso
        </Button>
      </div>

      {cases.length === 0 ? (
        <div className="rounded-md border border-dashed border-border bg-muted/30 px-3 py-4 text-center text-xs text-muted-foreground">
          Nenhum caso ainda. Adicione pelo menos um, ou o switch sempre cai no default.
        </div>
      ) : (
        <div className="overflow-hidden rounded-md border border-border">
          <div className="grid grid-cols-[auto_2fr_2fr_auto] items-center gap-2 border-b border-border bg-muted/50 px-2 py-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
            <span className="w-6 text-center">#</span>
            <span>Quando o valor for</span>
            <span>Seguir aresta com label</span>
            <span className="w-20 text-right">Ações</span>
          </div>

          {cases.map((c, i) => {
            const active = i === activeIndex;
            return (
              <div
                key={i}
                className={cn(
                  "grid grid-cols-[auto_2fr_2fr_auto] items-center gap-2 px-2 py-1.5",
                  i % 2 === 1 && "bg-muted/20",
                  active && "bg-emerald-500/10",
                )}
              >
                <span
                  className={cn(
                    "grid size-6 place-items-center rounded-full text-[10px] font-medium",
                    active
                      ? "bg-emerald-500 text-white"
                      : "bg-muted text-muted-foreground",
                  )}
                  title={active ? "Match no preview" : undefined}
                >
                  {i + 1}
                </span>
                <MatchInput
                  raw={c.raw}
                  onChange={(raw) => onPatch(i, { raw, match: coerce(raw) })}
                />
                <Input
                  value={c.label}
                  onChange={(e) => onPatch(i, { label: e.target.value })}
                  placeholder="ex.: ativo"
                  spellCheck={false}
                  className="h-8 font-mono text-xs"
                />
                <div className="flex items-center justify-end gap-0.5">
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    onClick={() => onMove(i, -1)}
                    disabled={i === 0}
                    aria-label="Mover pra cima"
                    title="Mover pra cima"
                  >
                    <ArrowUp className="size-3.5" />
                  </Button>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    onClick={() => onMove(i, 1)}
                    disabled={i === cases.length - 1}
                    aria-label="Mover pra baixo"
                    title="Mover pra baixo"
                  >
                    <ArrowDown className="size-3.5" />
                  </Button>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    onClick={() => onRemove(i)}
                    aria-label="Remover caso"
                    title="Remover"
                    className="text-destructive hover:!bg-destructive/10 hover:!text-destructive"
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function MatchInput({ raw, onChange }: { raw: string; onChange: (v: string) => void }) {
  const kind = inferKind(raw);
  return (
    <div className="relative">
      <Input
        value={raw}
        onChange={(e) => onChange(e.target.value)}
        placeholder='"active" ou 42 ou true'
        spellCheck={false}
        className="h-8 pr-12 font-mono text-xs"
      />
      <span
        className={cn(
          "pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 rounded px-1 text-[9px] font-medium uppercase",
          kind.tone,
        )}
        title={kind.title}
      >
        <Hash className="mr-0.5 inline size-2.5 align-[-2px]" />
        {kind.label}
      </span>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Default row                                                                 */
/* -------------------------------------------------------------------------- */

function DefaultRow({
  value,
  activeWhenNoMatch,
  onChange,
}: {
  value: string;
  activeWhenNoMatch: boolean;
  onChange: (v: string) => void;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border border-dashed border-border p-3",
        activeWhenNoMatch && "border-amber-500/50 bg-amber-500/5",
      )}
    >
      <div className="mb-2 flex items-center gap-2 text-xs font-medium">
        <ShieldQuestion className="size-3.5" />
        Default
        {activeWhenNoMatch && (
          <span className="ml-auto rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] text-amber-700 dark:text-amber-400">
            ramo ativo no preview
          </span>
        )}
      </div>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder='default (vazio = "default")'
        spellCheck={false}
        className="h-8 font-mono text-xs"
      />
      <p className="mt-2 text-[11px] text-muted-foreground">
        Label da aresta seguida quando nenhum caso bater. Se em branco, o engine usa{" "}
        <code className="font-mono">default</code>.
      </p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Preview                                                                     */
/* -------------------------------------------------------------------------- */

type PreviewState =
  | { ok: true; resolved: unknown; hit: number; matched: string }
  | { ok: false; error: string };

function PreviewBox({ preview }: { preview: PreviewState }) {
  if (!preview.ok) {
    return (
      <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
        Não consegui avaliar: {preview.error}
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-border bg-background p-3">
      <div className="mb-2 flex items-center gap-2 text-[11px] uppercase tracking-wide text-muted-foreground">
        <span>Avaliação contra dados-exemplo</span>
        <span className="ml-auto rounded bg-muted px-1.5 py-0.5 text-[10px] normal-case tracking-normal text-muted-foreground">
          DEFAULT_SAMPLE_CONTEXT
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2 font-mono text-xs">
        <span className="rounded border border-border bg-muted/40 px-2 py-0.5">
          {formatValue(preview.resolved)}
        </span>
        <ArrowRight className="size-3.5 text-muted-foreground" />
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded px-2 py-0.5 font-medium",
            preview.hit >= 0
              ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
              : "bg-amber-500/15 text-amber-700 dark:text-amber-400",
          )}
        >
          <CheckCircle2 className="size-3.5" />
          {preview.matched}
        </span>
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">
        {preview.hit >= 0
          ? `Em runtime, o nó vai seguir a aresta com label `
          : `Nenhum caso bateu — em runtime o nó vai cair no `}
        <code className="font-mono">{preview.matched}</code>.
      </p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

function readCases(raw: unknown): DraftCase[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((c): c is SwitchCase => !!c && typeof c === "object" && "label" in c)
    .map((c) => {
      const m = (c as SwitchCase).match;
      return {
        raw: m === undefined ? "" : typeof m === "string" ? m : JSON.stringify(m),
        match: m,
        label: typeof (c as SwitchCase).label === "string" ? (c as SwitchCase).label : "",
      };
    });
}

function writeCases(drafts: DraftCase[]): SwitchCase[] {
  return drafts.map((d) => ({ match: d.match, label: d.label }));
}

/**
 * Coerção tipada do `match` cru. Mantém compatível com `===` do handler:
 *   - "42"      → 42
 *   - "true"    → true
 *   - "null"    → null
 *   - 'foo'/'\"foo\"' → "foo" (string)
 *   - JSON arr/obj → parsed
 *   - default   → string como está
 */
function coerce(raw: string): unknown {
  const trimmed = raw.trim();
  if (trimmed === "") return "";
  if (trimmed === "null") return null;
  if (trimmed === "undefined") return undefined;
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("[") && trimmed.endsWith("]")) ||
    (trimmed.startsWith("{") && trimmed.endsWith("}"))
  ) {
    try {
      return JSON.parse(trimmed);
    } catch {
      /* mantém como string */
    }
  }
  return raw;
}

function inferKind(raw: string): { label: string; tone: string; title: string } {
  const v = coerce(raw);
  if (raw.trim() === "")
    return { label: "str", tone: "bg-muted text-muted-foreground", title: "string vazia" };
  if (v === null) return { label: "null", tone: "bg-muted text-muted-foreground", title: "null" };
  if (typeof v === "number")
    return { label: "num", tone: "bg-sky-500/15 text-sky-700 dark:text-sky-400", title: "number" };
  if (typeof v === "boolean")
    return {
      label: "bool",
      tone: "bg-violet-500/15 text-violet-700 dark:text-violet-400",
      title: "boolean",
    };
  if (Array.isArray(v) || typeof v === "object")
    return {
      label: "json",
      tone: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
      title: "JSON parsado",
    };
  return { label: "str", tone: "bg-muted text-muted-foreground", title: "string" };
}

function formatValue(v: unknown): string {
  if (v === undefined) return "undefined";
  if (v === null) return "null";
  if (typeof v === "string") return JSON.stringify(v);
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}
