import { memo } from "react";
import { useViewport } from "@xyflow/react";
import { MessageSquare } from "lucide-react";

import type { CommentThread } from "~/hooks/use-workflow-comments";
import { cn } from "~/lib/utils";

type CommentPinsLayerProps = {
  threads: CommentThread[];
  activeThreadId?: string | null;
  onOpenThread: (rootId: string) => void;
  /** Pin "fantasma" enquanto o usuário escolhe o local. */
  draftPin?: { x: number; y: number } | null;
};

/**
 * Pins de comentário em coords de mundo. Acompanha pan/zoom via viewport,
 * como o CollabCursors. Renderizar dentro do <ReactFlow>, fora dos Panels.
 */
export const CommentPinsLayer = memo(function CommentPinsLayer({
  threads,
  activeThreadId,
  onOpenThread,
  draftPin,
}: CommentPinsLayerProps) {
  const viewport = useViewport();

  return (
    <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden">
      {threads.map(({ root, replies }) => {
        if (root.x === null || root.y === null) return null;
        const left = root.x * viewport.zoom + viewport.x;
        const top = root.y * viewport.zoom + viewport.y;
        const active = activeThreadId === root.id;
        const count = 1 + replies.length;
        return (
          <button
            type="button"
            key={root.id}
            onClick={(e) => {
              e.stopPropagation();
              onOpenThread(root.id);
            }}
            className={cn(
              "pointer-events-auto absolute flex h-7 items-center gap-1 rounded-full border bg-background pl-1.5 pr-2 text-xs shadow-md transition-transform hover:scale-105",
              root.resolved && "opacity-50",
              active && "ring-2 ring-amber-400 ring-offset-2 ring-offset-background",
            )}
            style={{ transform: `translate(${left}px, ${top}px) translate(-6px, -28px)` }}
            title={root.body.slice(0, 80)}
          >
            <MessageSquare size={14} className="text-amber-500" />
            <span className="font-medium">{count}</span>
          </button>
        );
      })}
      {draftPin ? (
        <div
          className="absolute flex h-7 items-center gap-1 rounded-full border bg-amber-100 pl-1.5 pr-2 text-xs shadow-md ring-2 ring-amber-400"
          style={{
            transform: `translate(${draftPin.x * viewport.zoom + viewport.x}px, ${draftPin.y * viewport.zoom + viewport.y}px) translate(-6px, -28px)`,
          }}
        >
          <MessageSquare size={14} className="text-amber-600" />
          <span className="font-medium text-amber-700">novo</span>
        </div>
      ) : null}
    </div>
  );
});
