import { useState, useRef, useEffect, useCallback } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { useReactFlow, type Node } from "@xyflow/react";
import { Workflow } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";
import { NODE_ICON_MAP } from "~/components/flow/node-library";
import { cn } from "~/lib/utils";

function getNodeIcon(node: Node) {
  const d = (node.data ?? {}) as Record<string, unknown>;
  const nodeType = typeof d.nodeType === "string" ? d.nodeType : undefined;
  if (nodeType && nodeType in NODE_ICON_MAP) {
    const entry = NODE_ICON_MAP[nodeType];
    const Icon = entry.icon;
    return <Icon className={cn("size-4 shrink-0", entry.color)} />;
  }
  return <Workflow className="size-4 shrink-0 text-muted-foreground" />;
}

function getNodeTitle(node: Node): string {
  const d = (node.data ?? {}) as Record<string, unknown>;
  if (typeof d.title === "string" && d.title.trim()) return d.title;
  if (typeof d.nodeType === "string") return d.nodeType;
  return node.type ?? node.id;
}

function getNodeTypeLabel(node: Node): string {
  const d = (node.data ?? {}) as Record<string, unknown>;
  if (typeof d.nodeType === "string") return d.nodeType;
  return node.type ?? "";
}

function matchesSearch(node: Node, query: string): boolean {
  if (!query.trim()) return true;
  const q = query.toLowerCase();
  const d = (node.data ?? {}) as Record<string, unknown>;
  const title = typeof d.title === "string" ? d.title.toLowerCase() : "";
  const nodeType = typeof d.nodeType === "string" ? d.nodeType.toLowerCase() : "";
  const type = (node.type ?? "").toLowerCase();
  return title.includes(q) || nodeType.includes(q) || type.includes(q);
}

export function FlowSpotlight() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const { getNodes, setNodes, fitView } = useReactFlow();

  useHotkeys(
    ["mod+k"],
    (e) => {
      e.preventDefault();
      setOpen((prev) => !prev);
    },
    { enableOnFormTags: true },
  );

  const allNodes = open ? getNodes() : [];
  const results = allNodes.filter((n) => matchesSearch(n, query));

  // Reset state when opening
  useEffect(() => {
    if (open) {
      setQuery("");
      setActiveIndex(0);
      requestAnimationFrame(() => {
        inputRef.current?.focus();
      });
    }
  }, [open]);

  // Reset active index when results change
  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  const selectNode = useCallback(
    (node: Node) => {
      setOpen(false);
      // Select the node and deselect others
      setNodes((prev) =>
        prev.map((n) => ({ ...n, selected: n.id === node.id })),
      );
      // Fit view to selected node
      requestAnimationFrame(() => {
        fitView({ nodes: [node], duration: 400, padding: 0.3 });
      });
    },
    [setNodes, fitView],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((prev) => Math.min(prev + 1, results.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((prev) => Math.max(prev - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        const node = results[activeIndex];
        if (node) selectNode(node);
      }
    },
    [results, activeIndex, selectNode],
  );

  // Scroll active item into view
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const item = list.children[activeIndex] as HTMLElement | undefined;
    if (item) {
      item.scrollIntoView({ block: "nearest" });
    }
  }, [activeIndex]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        className="sm:max-w-lg p-0 gap-0 overflow-hidden"
        showCloseButton={false}
      >
        <DialogHeader className="sr-only">
          <DialogTitle>Buscar nó</DialogTitle>
        </DialogHeader>
        <div className="flex items-center border-b px-3">
          <Workflow className="size-4 text-muted-foreground shrink-0 mr-2" />
          <Input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Buscar nó no canvas..."
            className="border-0 shadow-none focus-visible:ring-0 focus-visible:border-0 h-12 px-0 text-sm"
          />
        </div>
        <div
          ref={listRef}
          className="max-h-72 overflow-y-auto py-1"
        >
          {results.length === 0 && (
            <div className="px-4 py-6 text-center text-sm text-muted-foreground">
              Nenhum nó encontrado.
            </div>
          )}
          {results.map((node, idx) => (
            <button
              key={node.id}
              className={cn(
                "w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors",
                idx === activeIndex
                  ? "bg-accent text-accent-foreground"
                  : "hover:bg-muted",
              )}
              onClick={() => selectNode(node)}
              onMouseEnter={() => setActiveIndex(idx)}
            >
              {getNodeIcon(node)}
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-medium truncate">
                  {getNodeTitle(node)}
                </span>
                <span className="block text-xs text-muted-foreground truncate">
                  {getNodeTypeLabel(node)}
                </span>
              </span>
            </button>
          ))}
        </div>
        {results.length > 0 && (
          <div className="border-t px-3 py-1.5 flex items-center gap-3 text-xs text-muted-foreground">
            <span><kbd className="font-mono bg-muted rounded px-1 border border-border">↑↓</kbd> navegar</span>
            <span><kbd className="font-mono bg-muted rounded px-1 border border-border">↵</kbd> selecionar</span>
            <span><kbd className="font-mono bg-muted rounded px-1 border border-border">Esc</kbd> fechar</span>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
