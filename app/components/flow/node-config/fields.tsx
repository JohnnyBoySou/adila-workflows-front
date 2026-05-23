/**
 * Renderizadores de campo do `NodeConfigDialog`. Cada componente recebe
 * um `value` opaco e um `onChange` — o dialog assume só `unknown` e
 * delega a normalização para o renderer.
 *
 * Princípio: aceitar input "frouxo" (string vazia, JSON inválido em
 * digitação, etc) e converter para o shape final no `onChange` quando
 * possível. Estados intermediários inválidos ficam em ref local.
 */
import { useEffect, useState } from "react";
import { Plus, X } from "lucide-react";

import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Textarea } from "~/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { cn } from "~/lib/utils";

import type { FieldDef } from "./types";
import { DEFAULT_SAMPLE_CONTEXT, hasTemplate, renderTemplate } from "./template";

interface FieldRendererProps {
  field: FieldDef;
  value: unknown;
  onChange: (next: unknown) => void;
  /** Erro externo (validação do dialog). Renderizado abaixo do campo. */
  error?: string | null;
  /**
   * Reporta erros internos do editor (ex: parse de JSON). O dialog
   * usa pra travar o Salvar. `null` limpa o erro anterior.
   */
  onParseError?: (msg: string | null) => void;
}

export function FieldRenderer({ field, value, onChange, error, onParseError }: FieldRendererProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={field.name} className="text-xs font-medium">
        {field.label}
        {field.required && <span className="ml-0.5 text-destructive">*</span>}
      </Label>
      {renderInput({ field, value, onChange, onParseError })}
      {error ? (
        <p className="text-[11px] text-destructive">{error}</p>
      ) : (
        field.description && (
          <p className="text-[11px] leading-snug text-muted-foreground">{field.description}</p>
        )
      )}
      <TemplatePreview field={field} value={value} />
    </div>
  );
}

// ── TemplatePreview ───────────────────────────────────────────────────────
// Quando o valor de um campo text/textarea/json contém `{{ … }}`, mostramos
// uma linha resolvida contra `DEFAULT_SAMPLE_CONTEXT`. É sempre informativo,
// nunca bloqueia o save. Code blocks (JS) não passam por renderTemplate no
// engine, então skipa.
function TemplatePreview({ field, value }: { field: FieldDef; value: unknown }) {
  if (field.type !== "text" && field.type !== "textarea" && field.type !== "json") return null;

  // Pra json, o `value` já é objeto/array. Templatamos recursivamente e
  // serializamos. Pra strings (text/textarea), basta o renderTemplate
  // direto. Detecta presença de `{{ ... }}` antes pra não poluir.
  const stringified =
    typeof value === "string"
      ? value
      : value && typeof value === "object"
        ? safeStringify(value)
        : "";
  if (!hasTemplate(stringified)) return null;

  let rendered: unknown;
  try {
    rendered = renderTemplate(value, DEFAULT_SAMPLE_CONTEXT);
  } catch {
    return null;
  }

  const out =
    typeof rendered === "string"
      ? rendered
      : rendered === undefined
        ? "undefined"
        : safeStringify(rendered);

  return (
    <div className="rounded-md border border-dashed border-border bg-muted/40 px-2 py-1.5">
      <p className="mb-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        Preview
      </p>
      <pre className="overflow-x-auto whitespace-pre-wrap break-words font-mono text-[11px] text-foreground">
        {out}
      </pre>
    </div>
  );
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function renderInput({ field, value, onChange, onParseError }: Omit<FieldRendererProps, "error">) {
  switch (field.type) {
    case "text":
      return (
        <Input
          id={field.name}
          value={value == null ? "" : String(value)}
          placeholder={field.placeholder}
          onChange={(e) => onChange(e.target.value)}
          className="h-9"
        />
      );
    case "textarea":
      return (
        <Textarea
          id={field.name}
          value={value == null ? "" : String(value)}
          placeholder={field.placeholder}
          rows={field.rows ?? 4}
          onChange={(e) => onChange(e.target.value)}
          className="text-sm"
        />
      );
    case "number":
      return (
        <Input
          id={field.name}
          type="number"
          value={value == null || value === "" ? "" : Number(value)}
          placeholder={field.placeholder}
          min={field.min}
          max={field.max}
          step={field.step}
          onChange={(e) => {
            const v = e.target.value;
            onChange(v === "" ? undefined : Number(v));
          }}
          className="h-9"
        />
      );
    case "boolean": {
      const caption = field.description ?? "Ativar";
      return (
        <label className="inline-flex cursor-pointer items-center gap-2 text-sm">
          <input
            id={field.name}
            type="checkbox"
            className="size-4 rounded border-input"
            checked={value === true}
            onChange={(e) => onChange(e.target.checked)}
            aria-label={`${field.label}: ${caption}`}
          />
          <span className="text-muted-foreground">{caption}</span>
        </label>
      );
    }
    case "select":
      return (
        <Select value={value == null ? "" : String(value)} onValueChange={(v) => onChange(v)}>
          <SelectTrigger id={field.name} className="h-9">
            <SelectValue placeholder={field.placeholder ?? "Selecione…"} />
          </SelectTrigger>
          <SelectContent>
            {field.options.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    case "kv":
      return <KeyValueEditor value={value} onChange={onChange} />;
    case "stringList":
      return <StringListEditor value={value} onChange={onChange} />;
    case "json":
      return (
        <JsonEditor
          value={value}
          onChange={onChange}
          placeholder={field.placeholder}
          onParseError={onParseError}
        />
      );
    case "code":
      return (
        <Textarea
          id={field.name}
          value={value == null ? "" : String(value)}
          placeholder={field.placeholder}
          rows={10}
          onChange={(e) => onChange(e.target.value)}
          className="font-mono text-xs"
          spellCheck={false}
        />
      );
  }
}

// ── KeyValueEditor ────────────────────────────────────────────────────────
// Edita um Record<string, unknown>. Mantém ordem inserida via lista local;
// vazias são filtradas no commit. Valores que parecem JSON são preservados
// como objeto/array; o resto fica como string crua (templates `{{ … }}`).
type KvRow = { id: string; k: string; v: string };

function newKvRow(k: string, v: string): KvRow {
  return { id: crypto.randomUUID(), k, v };
}

export function KeyValueEditor({
  value,
  onChange,
}: {
  value: unknown;
  onChange: (next: unknown) => void;
}) {
  const initial = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const [pairs, setPairs] = useState<KvRow[]>(() =>
    Object.entries(initial).map(([k, v]) =>
      newKvRow(k, typeof v === "string" ? v : JSON.stringify(v)),
    ),
  );

  // Re-sincroniza quando o nó muda (chave externa) — caso o dialog reabra.
  useEffect(() => {
    const obj = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
    setPairs(
      Object.entries(obj).map(([k, v]) =>
        newKvRow(k, typeof v === "string" ? v : JSON.stringify(v)),
      ),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value === undefined]);

  function commit(next: KvRow[]) {
    setPairs(next);
    const obj: Record<string, unknown> = {};
    for (const { k, v } of next) {
      if (!k) continue;
      // Tenta parsear como JSON; cai em string crua se falhar.
      let parsed: unknown = v;
      const trimmed = v.trim();
      if (
        trimmed.startsWith("{") ||
        trimmed.startsWith("[") ||
        trimmed === "true" ||
        trimmed === "false" ||
        trimmed === "null" ||
        /^-?\d+(\.\d+)?$/.test(trimmed)
      ) {
        try {
          parsed = JSON.parse(trimmed);
        } catch {
          parsed = v;
        }
      }
      obj[k] = parsed;
    }
    onChange(obj);
  }

  return (
    <div className="flex flex-col gap-1.5">
      {pairs.map((pair) => (
        <div key={pair.id} className="flex items-center gap-1.5">
          <Input
            value={pair.k}
            placeholder="chave"
            onChange={(e) => {
              const next = pairs.map((p) => (p.id === pair.id ? { ...p, k: e.target.value } : p));
              commit(next);
            }}
            className="h-8 flex-1"
          />
          <Input
            value={pair.v}
            placeholder="valor"
            onChange={(e) => {
              const next = pairs.map((p) => (p.id === pair.id ? { ...p, v: e.target.value } : p));
              commit(next);
            }}
            className="h-8 flex-[2]"
          />
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={() => commit(pairs.filter((p) => p.id !== pair.id))}
            aria-label="Remover par"
          >
            <X className="size-3.5" />
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-7 w-fit gap-1 px-2 text-xs"
        onClick={() => commit([...pairs, newKvRow("", "")])}
      >
        <Plus className="size-3" /> Adicionar
      </Button>
    </div>
  );
}

// ── StringListEditor ──────────────────────────────────────────────────────
type StrRow = { id: string; value: string };

function newStrRow(value: string): StrRow {
  return { id: crypto.randomUUID(), value };
}

function StringListEditor({
  value,
  onChange,
}: {
  value: unknown;
  onChange: (next: unknown) => void;
}) {
  const initial = Array.isArray(value) ? value.map((v) => (v == null ? "" : String(v))) : [];
  const [items, setItems] = useState<StrRow[]>(() => initial.map((v) => newStrRow(v)));

  useEffect(() => {
    setItems(Array.isArray(value) ? value.map((v) => newStrRow(v == null ? "" : String(v))) : []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value === undefined]);

  function commit(next: StrRow[]) {
    setItems(next);
    onChange(next.map((r) => r.value).filter((v) => v !== ""));
  }

  return (
    <div className="flex flex-col gap-1.5">
      {items.map((it, idx) => (
        <div key={it.id} className="flex items-center gap-1.5">
          <Input
            value={it.value}
            placeholder={`item #${idx + 1}`}
            onChange={(e) => {
              const next = items.map((row) =>
                row.id === it.id ? { ...row, value: e.target.value } : row,
              );
              commit(next);
            }}
            className="h-8 flex-1"
          />
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={() => commit(items.filter((row) => row.id !== it.id))}
            aria-label="Remover item"
          >
            <X className="size-3.5" />
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-7 w-fit gap-1 px-2 text-xs"
        onClick={() => commit([...items, newStrRow("")])}
      >
        <Plus className="size-3" /> Adicionar
      </Button>
    </div>
  );
}

// ── JsonEditor ────────────────────────────────────────────────────────────
// Edita JSON arbitrário como string; quando válido, propaga o objeto.
// Erro de parse fica visível mas não bloqueia digitação.
function JsonEditor({
  value,
  onChange,
  placeholder,
  onParseError,
}: {
  value: unknown;
  onChange: (next: unknown) => void;
  placeholder?: string;
  onParseError?: (msg: string | null) => void;
}) {
  const [text, setText] = useState<string>(() => formatInitial(value));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setText(formatInitial(value));
    setError(null);
    onParseError?.(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value === undefined]);

  function setErr(msg: string | null) {
    setError(msg);
    onParseError?.(msg);
  }

  function handleChange(next: string) {
    setText(next);
    if (next.trim() === "") {
      setErr(null);
      onChange(undefined);
      return;
    }
    try {
      const parsed = JSON.parse(next);
      setErr(null);
      onChange(parsed);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "JSON inválido");
    }
  }

  // O erro renderizado em texto vem do FieldRenderer (via onParseError);
  // aqui só destacamos a borda quando inválido.
  return (
    <Textarea
      value={text}
      rows={6}
      placeholder={placeholder ?? '{ "foo": "bar" }'}
      spellCheck={false}
      onChange={(e) => handleChange(e.target.value)}
      className={cn(
        "font-mono text-xs",
        error && "border-destructive focus-visible:ring-destructive/30",
      )}
    />
  );
}

function formatInitial(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return "";
  }
}
