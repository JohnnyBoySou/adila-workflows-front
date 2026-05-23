import { memo, useCallback } from "react";
import { type Node, type NodeProps, NodeResizer, NodeToolbar, Position, useReactFlow } from "@xyflow/react";

import { cn } from "~/lib/utils";

export type StickyColor =
  | "yellow"
  | "orange"
  | "red"
  | "blue"
  | "cyan"
  | "green"
  | "purple";

export type StickyNoteData = {
  text: string;
  color?: StickyColor;
};

export type StickyNoteNode = Node<StickyNoteData, "sticky">;

const COLOR_MAP: Record<StickyColor, string> = {
  yellow: "bg-yellow-200 ring-yellow-400/40 dark:bg-yellow-300/90",
  orange: "bg-orange-200 ring-orange-400/40 dark:bg-orange-300/90",
  red: "bg-rose-200 ring-rose-400/40 dark:bg-rose-300/90",
  blue: "bg-sky-200 ring-sky-400/40 dark:bg-sky-300/90",
  cyan: "bg-cyan-200 ring-cyan-400/40 dark:bg-cyan-300/90",
  green: "bg-emerald-200 ring-emerald-400/40 dark:bg-emerald-300/90",
  purple: "bg-violet-200 ring-violet-400/40 dark:bg-violet-300/90",
};

const SWATCH_MAP: Record<StickyColor, string> = {
  yellow: "bg-yellow-300",
  orange: "bg-orange-300",
  red: "bg-rose-300",
  blue: "bg-sky-300",
  cyan: "bg-cyan-300",
  green: "bg-emerald-300",
  purple: "bg-violet-300",
};

const COLOR_ORDER: StickyColor[] = [
  "yellow",
  "orange",
  "red",
  "blue",
  "cyan",
  "green",
  "purple",
];

function StickyNoteNodeComponent({ data, selected, id }: NodeProps<StickyNoteNode>) {
  const { setNodes } = useReactFlow();
  const text = data.text ?? "";
  const color = data.color ?? "yellow";

  const updateData = useCallback(
    (patch: Partial<StickyNoteData>) => {
      setNodes((prev) =>
        prev.map((n) =>
          n.id === id ? { ...n, data: { ...(n.data as StickyNoteData), ...patch } } : n,
        ),
      );
    },
    [id, setNodes],
  );

  return (
    <div
      className={cn(
        "relative flex h-full w-full min-w-[140px] flex-col rounded-md p-2 text-sm text-neutral-900 shadow-md ring-1 transition-shadow",
        COLOR_MAP[color],
        selected && "ring-2 ring-foreground/40",
      )}
    >
      <NodeResizer
        isVisible={selected}
        minWidth={120}
        minHeight={80}
        lineClassName="!border-foreground/30"
        handleClassName="!size-2 !rounded-sm !border !border-foreground/40 !bg-background"
      />

      <NodeToolbar isVisible={selected} position={Position.Top} offset={8}>
        <div className="flex items-center gap-1 rounded-md border bg-background p-1 shadow-md">
          {COLOR_ORDER.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => updateData({ color: c })}
              aria-label={`Cor ${c}`}
              aria-pressed={color === c}
              className={cn(
                "size-4 rounded-full ring-1 ring-foreground/10 transition-transform hover:scale-110",
                SWATCH_MAP[c],
                color === c && "ring-2 ring-foreground/60",
              )}
            />
          ))}
        </div>
      </NodeToolbar>

      <textarea
        value={text}
        onChange={(e) => updateData({ text: e.target.value })}
        placeholder="Anote algo…"
        aria-label="Conteúdo do post-it"
        className="nodrag h-full w-full flex-1 resize-none bg-transparent text-sm leading-snug text-neutral-900 outline-none placeholder:text-neutral-700/50"
      />
    </div>
  );
}

export default memo(StickyNoteNodeComponent);
