import { memo } from "react";
import { useViewport } from "@xyflow/react";
import { MousePointer2 } from "lucide-react";

import type { RemotePresence } from "~/hooks/use-collaboration";
import { colorForUserId } from "./collab-color";

type CollabCursorsProps = {
  others: RemotePresence[];
};

/**
 * Renderiza cursores remotos em coordenadas de fluxo (mundo).
 * Convertendo flow→screen via viewport ({x, y, zoom}) — assim cursores
 * acompanham pan/zoom e ficam ancorados no canvas, não na janela.
 *
 * Deve ser renderizado dentro do `<ReactFlow>`, mas fora do `<Panel>` —
 * usamos absolute em relação ao container do React Flow.
 */
export const CollabCursors = memo(function CollabCursors({ others }: CollabCursorsProps) {
  const viewport = useViewport();

  return (
    <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden">
      {others.map((p) => {
        if (!p.cursor) return null;
        const left = p.cursor.x * viewport.zoom + viewport.x;
        const top = p.cursor.y * viewport.zoom + viewport.y;
        const color = colorForUserId(p.userId);
        const label = p.displayName ?? p.userId.slice(0, 6);
        return (
          <div
            key={p.userId}
            className="absolute -translate-x-[2px] -translate-y-[2px] transition-transform duration-75 ease-linear"
            style={{ transform: `translate(${left}px, ${top}px)` }}
          >
            <MousePointer2 size={18} style={{ color, fill: color }} strokeWidth={1.5} />
            <span
              className="ml-3 inline-block rounded-md px-1.5 py-0.5 text-[10px] font-medium text-white shadow"
              style={{ backgroundColor: color }}
            >
              {label}
            </span>
          </div>
        );
      })}
    </div>
  );
});
