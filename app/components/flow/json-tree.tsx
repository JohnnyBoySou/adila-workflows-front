/**
 * Árvore JSON arrastável usada no `NodeConfigDialog` (coluna de input/output).
 *
 * Cada nó (folha ou ramo) é `draggable`: ao arrastar, grava em `text/plain` a
 * expressão de template construída por `buildExpression(path)` — formato que os
 * campos dos painéis aceitam via `onDrop` (ex.: `{{ steps.<nodeId>.body.x }}`).
 *
 * Ramos (objeto/array) são colapsáveis. A raiz já vem expandida; níveis mais
 * profundos começam fechados pra não criar parede de JSON em payloads grandes.
 */
import { useState, type DragEvent } from "react";
import { ChevronDown, ChevronRight, GripVertical } from "lucide-react";

import { cn } from "~/lib/utils";

type Path = Array<string | number>;

interface JsonTreeProps {
  data: unknown;
  /** Constrói a expressão de template a partir do caminho até o nó arrastado. */
  buildExpression: (path: Path) => string;
}

function isContainer(v: unknown): v is Record<string, unknown> | unknown[] {
  return v !== null && typeof v === "object";
}

function previewScalar(v: unknown): string {
  if (typeof v === "string") return `"${v}"`;
  if (v === null) return "null";
  return String(v);
}

function scalarClass(v: unknown): string {
  if (typeof v === "string") return "text-emerald-600 dark:text-emerald-400";
  if (typeof v === "number") return "text-sky-600 dark:text-sky-400";
  if (typeof v === "boolean") return "text-amber-600 dark:text-amber-400";
  return "text-muted-foreground";
}

function entriesOf(v: Record<string, unknown> | unknown[]): Array<[string | number, unknown]> {
  return Array.isArray(v)
    ? v.map((item, i) => [i, item] as [number, unknown])
    : Object.entries(v);
}

function TreeRow({
  label,
  value,
  path,
  depth,
  buildExpression,
}: {
  label: string;
  value: unknown;
  path: Path;
  depth: number;
  buildExpression: (path: Path) => string;
}) {
  const container = isContainer(value);
  const [open, setOpen] = useState(depth < 1);

  const handleDragStart = (e: DragEvent) => {
    e.stopPropagation();
    e.dataTransfer.setData("text/plain", buildExpression(path));
    e.dataTransfer.effectAllowed = "copy";
  };

  const count = container ? entriesOf(value as never).length : 0;
  const isArray = Array.isArray(value);

  return (
    <div>
      <div
        draggable
        onDragStart={handleDragStart}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
        className={cn(
          "group flex cursor-grab items-center gap-1 py-0.5 pr-2 text-[11px] leading-tight",
          "hover:bg-muted/60 active:cursor-grabbing",
        )}
        title={`Arraste pra inserir: ${buildExpression(path)}`}
      >
        {container ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setOpen((v) => !v);
            }}
            className="shrink-0 text-muted-foreground"
            aria-label={open ? "Colapsar" : "Expandir"}
          >
            {open ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
          </button>
        ) : (
          <GripVertical className="size-3 shrink-0 text-muted-foreground/40 opacity-0 group-hover:opacity-100" />
        )}
        <span className="font-medium text-foreground/80">{label}</span>
        {container ? (
          <span className="text-muted-foreground">
            {isArray ? `[${count}]` : `{${count}}`}
          </span>
        ) : (
          <span className={cn("truncate", scalarClass(value))}>{previewScalar(value)}</span>
        )}
      </div>
      {container && open && (
        <div>
          {entriesOf(value as never).map(([k, v]) => (
            <TreeRow
              key={String(k)}
              label={String(k)}
              value={v}
              path={[...path, k]}
              depth={depth + 1}
              buildExpression={buildExpression}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function JsonTree({ data, buildExpression }: JsonTreeProps) {
  if (!isContainer(data)) {
    return (
      <div className="px-3 py-2 text-[11px] text-muted-foreground">
        {data === undefined ? "Sem dados." : previewScalar(data)}
      </div>
    );
  }

  const entries = entriesOf(data);
  if (entries.length === 0) {
    return (
      <div className="px-3 py-2 text-[11px] text-muted-foreground">
        {Array.isArray(data) ? "Array vazio." : "Objeto vazio."}
      </div>
    );
  }

  return (
    <div className="select-none font-mono">
      {entries.map(([k, v]) => (
        <TreeRow
          key={String(k)}
          label={String(k)}
          value={v}
          path={[k]}
          depth={0}
          buildExpression={buildExpression}
        />
      ))}
    </div>
  );
}
