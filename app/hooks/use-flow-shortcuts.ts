import { useCallback } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { useReactFlow, type Node, type Edge } from "@xyflow/react";

import { useFlowStore } from "~/stores/flow";

type Options = {
  onAddSticky: () => void;
  onAddContainer: () => void;
  onAutoLayout: () => void;
};

let dupCounter = 0;

export function useFlowShortcuts({ onAddSticky, onAddContainer, onAutoLayout }: Options) {
  const { getNodes, getEdges, setNodes, setEdges, fitView, zoomTo, zoomIn, zoomOut } =
    useReactFlow();

  const duplicateSelected = useCallback(() => {
    const selected = getNodes().filter((n) => n.selected);
    if (selected.length === 0) return;
    const newNodes: Node[] = selected.map((n) => ({
      ...n,
      id: `${n.id}-copy-${++dupCounter}`,
      position: { x: n.position.x + 32, y: n.position.y + 32 },
      selected: true,
    }));
    setNodes((prev) => [...prev.map((n) => ({ ...n, selected: false })), ...newNodes]);
  }, [getNodes, setNodes]);

  const deleteSelected = useCallback(() => {
    const selectedNodeIds = new Set(
      getNodes()
        .filter((n) => n.selected)
        .map((n) => n.id),
    );
    const selectedEdgeIds = new Set(
      getEdges()
        .filter((e) => e.selected)
        .map((e) => e.id),
    );
    if (selectedNodeIds.size === 0 && selectedEdgeIds.size === 0) return;
    setNodes((prev) => prev.filter((n) => !selectedNodeIds.has(n.id)));
    setEdges((prev: Edge[]) =>
      prev.filter(
        (e) =>
          !selectedEdgeIds.has(e.id) &&
          !selectedNodeIds.has(e.source) &&
          !selectedNodeIds.has(e.target),
      ),
    );
  }, [getNodes, getEdges, setNodes, setEdges]);

  const selectAll = useCallback(() => {
    setNodes((prev) => prev.map((n) => ({ ...n, selected: true })));
  }, [setNodes]);

  const zoomToSelection = useCallback(() => {
    const selected = getNodes().filter((n) => n.selected);
    if (selected.length === 0) {
      fitView({ duration: 400, padding: 0.2 });
      return;
    }
    fitView({ nodes: selected, duration: 400, padding: 0.3 });
  }, [getNodes, fitView]);

  // Tools — lemos direto do store via getState() pra não criar
  // dependência reativa no hook (handlers só rodam sob tecla).
  useHotkeys("v", () => useFlowStore.getState().setTool("select"), { preventDefault: true });
  useHotkeys("h", () => useFlowStore.getState().setTool("pan"), { preventDefault: true });

  // Create
  useHotkeys("n", () => useFlowStore.getState().setLibraryOpen(true), { preventDefault: true });
  useHotkeys("s", onAddSticky, { preventDefault: true });
  // F = "Frame" (Figma-style)
  useHotkeys("f", onAddContainer, { preventDefault: true });
  // Shift+A = auto-organizar (paraleliza com Shift+1/2 que já são "view ops").
  useHotkeys("shift+a", onAutoLayout, { preventDefault: true });

  // Selection / editing
  useHotkeys("mod+d", duplicateSelected, { preventDefault: true });
  useHotkeys("mod+a", selectAll, { preventDefault: true });
  useHotkeys(["delete", "backspace"], deleteSelected, { preventDefault: true });

  // Zoom (Figma-style)
  useHotkeys("shift+1", () => fitView({ duration: 400, padding: 0.2 }), { preventDefault: true });
  useHotkeys("shift+2", zoomToSelection, { preventDefault: true });
  useHotkeys("shift+0", () => zoomTo(1, { duration: 200 }), { preventDefault: true });
  useHotkeys(["mod+equal", "mod+="], () => zoomIn({ duration: 200 }), { preventDefault: true });
  useHotkeys("mod+minus", () => zoomOut({ duration: 200 }), { preventDefault: true });

  // View toggles
  useHotkeys("l", () => useFlowStore.getState().toggleLock(), { preventDefault: true });
  useHotkeys("m", () => useFlowStore.getState().toggleMiniMap(), { preventDefault: true });
}
