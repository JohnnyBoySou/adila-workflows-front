import { memo, useState } from "react";
import { type NodeProps, type Node, NodeResizer } from "@xyflow/react";

import { cn } from "~/lib/utils";

export type StickyNoteData = {
  text: string;
  color?: "yellow" | "pink" | "blue" | "green";
};

export type StickyNoteNode = Node<StickyNoteData, "sticky">;

const COLOR_MAP: Record<NonNullable<StickyNoteData["color"]>, string> = {
  yellow: "bg-yellow-200 ring-yellow-400/40 dark:bg-yellow-300/90",
  pink: "bg-pink-200 ring-pink-400/40 dark:bg-pink-300/90",
  blue: "bg-sky-200 ring-sky-400/40 dark:bg-sky-300/90",
  green: "bg-emerald-200 ring-emerald-400/40 dark:bg-emerald-300/90",
};

function StickyNoteNodeComponent({ data, selected, id: _id }: NodeProps<StickyNoteNode>) {
  const [text, setText] = useState(data.text ?? "");
  const color = data.color ?? "yellow";

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
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Anote algo…"
        aria-label="Conteúdo do post-it"
        className="nodrag h-full w-full flex-1 resize-none bg-transparent text-sm leading-snug text-neutral-900 outline-none placeholder:text-neutral-700/50"
      />
    </div>
  );
}

export default memo(StickyNoteNodeComponent);
