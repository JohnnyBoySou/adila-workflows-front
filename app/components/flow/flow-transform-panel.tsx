import { useCallback, useState, useEffect } from "react";
import { useNodes, useReactFlow, Panel, type Node } from "@xyflow/react";
import { AnimatePresence, motion } from "framer-motion";
import { Move, ChevronRight } from "lucide-react";
import { Input } from "~/components/ui/input";
import { cn } from "~/lib/utils";

function getW(node: Node): number {
  const m = node.measured as { width?: number; height?: number } | undefined;
  return m?.width ?? (node as { width?: number }).width ?? 150;
}

function getH(node: Node): number {
  const m = node.measured as { width?: number; height?: number } | undefined;
  return m?.height ?? (node as { height?: number }).height ?? 40;
}

function getBoundingBox(nodes: Node[]) {
  if (nodes.length === 0) return { x: 0, y: 0, w: 0, h: 0 };
  const minX = Math.min(...nodes.map((n) => n.position.x));
  const minY = Math.min(...nodes.map((n) => n.position.y));
  const maxX = Math.max(...nodes.map((n) => n.position.x + getW(n)));
  const maxY = Math.max(...nodes.map((n) => n.position.y + getH(n)));
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

export function FlowTransformPanel() {
  const nodes = useNodes();
  const { setNodes } = useReactFlow();

  const selected = nodes.filter((n) => n.selected);

  const bb = getBoundingBox(selected);

  const [xVal, setXVal] = useState(String(Math.round(bb.x)));
  const [yVal, setYVal] = useState(String(Math.round(bb.y)));
  const [expanded, setExpanded] = useState(false);

  // Keep inputs in sync when selection changes or nodes move
  useEffect(() => {
    setXVal(String(Math.round(bb.x)));
    setYVal(String(Math.round(bb.y)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bb.x, bb.y, selected.length]);

  const applyX = useCallback(
    (raw: string) => {
      const next = parseFloat(raw);
      if (isNaN(next)) return;
      const delta = next - bb.x;
      const ids = new Set(selected.map((n) => n.id));
      setNodes((prev) =>
        prev.map((n) =>
          ids.has(n.id)
            ? { ...n, position: { ...n.position, x: n.position.x + delta } }
            : n,
        ),
      );
    },
    [bb.x, selected, setNodes],
  );

  const applyY = useCallback(
    (raw: string) => {
      const next = parseFloat(raw);
      if (isNaN(next)) return;
      const delta = next - bb.y;
      const ids = new Set(selected.map((n) => n.id));
      setNodes((prev) =>
        prev.map((n) =>
          ids.has(n.id)
            ? { ...n, position: { ...n.position, y: n.position.y + delta } }
            : n,
        ),
      );
    },
    [bb.y, selected, setNodes],
  );

  if (selected.length === 0) return null;

  return (
    <Panel position="bottom-right" className="!bottom-6 !right-4 pointer-events-auto">
      <motion.div
        layout
        transition={{ type: "spring", stiffness: 380, damping: 30 }}
        className="flex items-center gap-0.5 rounded-xl border border-border bg-card/95 p-1.5 ring-1 ring-foreground/5 backdrop-blur"
      >
        <motion.button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          title={expanded ? "Recolher transform" : "Expandir transform"}
          aria-label={expanded ? "Recolher transform" : "Expandir transform"}
          className={cn(
            "relative grid h-9 cursor-pointer place-items-center gap-1.5 rounded-md px-2 text-foreground/70 transition-colors hover:bg-muted hover:text-foreground",
            expanded && "bg-muted text-foreground",
          )}
        >
          <div className="flex items-center gap-1.5">
            <Move className="size-4" />
            {!expanded && (
              <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
                {Math.round(bb.x)}, {Math.round(bb.y)}
              </span>
            )}
            <motion.span
              animate={{ rotate: expanded ? 180 : 0 }}
              transition={{ duration: 0.18 }}
              className="text-foreground/50"
            >
              <ChevronRight className="size-3.5" />
            </motion.span>
          </div>
        </motion.button>

        <AnimatePresence initial={false}>
          {expanded && (
            <motion.div
              key="fields"
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: "auto", opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ type: "spring", stiffness: 380, damping: 30 }}
              className="overflow-hidden"
            >
              <div className="flex items-center gap-2 pl-2 pr-1 text-xs">
                <label className="flex items-center gap-1 text-muted-foreground">
                  X
                  <Input
                    value={xVal}
                    onChange={(e) => setXVal(e.target.value)}
                    onBlur={() => applyX(xVal)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        applyX(xVal);
                        (e.currentTarget as HTMLInputElement).blur();
                      }
                    }}
                    className="w-16 h-7 text-xs text-center font-mono"
                  />
                </label>
                <label className="flex items-center gap-1 text-muted-foreground">
                  Y
                  <Input
                    value={yVal}
                    onChange={(e) => setYVal(e.target.value)}
                    onBlur={() => applyY(yVal)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        applyY(yVal);
                        (e.currentTarget as HTMLInputElement).blur();
                      }
                    }}
                    className="w-16 h-7 text-xs text-center font-mono"
                  />
                </label>
                <label className="flex items-center gap-1 text-muted-foreground">
                  W
                  <Input
                    readOnly
                    value={String(Math.round(bb.w))}
                    className="w-16 h-7 text-xs text-center font-mono opacity-60 cursor-default"
                  />
                </label>
                <label className="flex items-center gap-1 text-muted-foreground">
                  H
                  <Input
                    readOnly
                    value={String(Math.round(bb.h))}
                    className="w-16 h-7 text-xs text-center font-mono opacity-60 cursor-default"
                  />
                </label>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </Panel>
  );
}
