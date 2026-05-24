import { useCallback, useRef } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { useReactFlow, type Node, type Edge } from "@xyflow/react";

import { useFlowStore } from "~/stores/flow";

type Options = {
  onAddSticky: () => void;
  onAddContainer: () => void;
  onAutoLayout: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onTogglePresentation?: () => void;
};

type ShortcutActions = {
  copy: () => void;
  cut: () => void;
  paste: () => void;
  duplicate: () => void;
  deleteSelected: () => void;
  selectAll: () => void;
};

let dupCounter = 0;
let pasteCounter = 0;

export function useFlowShortcuts({
  onAddSticky,
  onAddContainer,
  onAutoLayout,
  onUndo,
  onRedo,
  onTogglePresentation,
}: Options): ShortcutActions {
  const { getNodes, getEdges, setNodes, setEdges, fitView, zoomTo, zoomIn, zoomOut } =
    useReactFlow();

  // Clipboard em memória — persiste enquanto a aba estiver aberta.
  const clipboard = useRef<{ nodes: Node[]; edges: Edge[] } | null>(null);

  const copySelected = useCallback(() => {
    const selectedNodes = getNodes().filter((n) => n.selected);
    if (selectedNodes.length === 0) return;
    const selectedIds = new Set(selectedNodes.map((n) => n.id));
    // Copia apenas edges cujos dois extremos estão selecionados.
    const selectedEdges = getEdges().filter(
      (e) => selectedIds.has(e.source) && selectedIds.has(e.target),
    );
    clipboard.current = { nodes: selectedNodes, edges: selectedEdges };
  }, [getNodes, getEdges]);

  const cutSelected = useCallback(() => {
    const selectedNodes = getNodes().filter((n) => n.selected);
    if (selectedNodes.length === 0) return;
    const selectedIds = new Set(selectedNodes.map((n) => n.id));
    const selectedEdges = getEdges().filter(
      (e) => selectedIds.has(e.source) && selectedIds.has(e.target),
    );
    clipboard.current = { nodes: selectedNodes, edges: selectedEdges };
    setNodes((prev) => prev.filter((n) => !selectedIds.has(n.id)));
    setEdges((prev: Edge[]) =>
      prev.filter((e) => !selectedIds.has(e.source) && !selectedIds.has(e.target)),
    );
  }, [getNodes, getEdges, setNodes, setEdges]);

  const pasteClipboard = useCallback(() => {
    if (!clipboard.current || clipboard.current.nodes.length === 0) return;
    const offset = 32 * (++pasteCounter % 8 + 1);
    const idMap = new Map<string, string>();
    const newNodes: Node[] = clipboard.current.nodes.map((n) => {
      const newId = `${n.id}-paste-${pasteCounter}`;
      idMap.set(n.id, newId);
      return {
        ...n,
        id: newId,
        position: { x: n.position.x + offset, y: n.position.y + offset },
        selected: true,
      };
    });
    const newEdges: Edge[] = clipboard.current.edges.map((e) => ({
      ...e,
      id: `${e.id}-paste-${pasteCounter}`,
      source: idMap.get(e.source) ?? e.source,
      target: idMap.get(e.target) ?? e.target,
      selected: true,
    }));
    setNodes((prev) => [...prev.map((n) => ({ ...n, selected: false })), ...newNodes]);
    setEdges((prev: Edge[]) => [...prev.map((e) => ({ ...e, selected: false })), ...newEdges]);
  }, [setNodes, setEdges]);

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

  // ── Arrow-key nudge ────────────────────────────────────────────────────
  const nudge = useCallback(
    (dx: number, dy: number) => {
      setNodes((prev) =>
        prev.map((n) =>
          n.selected
            ? { ...n, position: { x: n.position.x + dx, y: n.position.y + dy } }
            : n,
        ),
      );
    },
    [setNodes],
  );

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

  // Histórico
  useHotkeys("mod+z", onUndo, { preventDefault: true });
  useHotkeys(["mod+shift+z", "mod+y"], onRedo, { preventDefault: true });

  // Clipboard
  useHotkeys("mod+c", copySelected, { preventDefault: true });
  useHotkeys("mod+x", cutSelected, { preventDefault: true });
  useHotkeys("mod+v", pasteClipboard, { preventDefault: true });

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
  useHotkeys("mod+shift+p", () => onTogglePresentation?.(), { preventDefault: true });

  // Arrow-key nudge (1px; Shift = 10px) — disabled when an input/textarea is focused
  const nudgeOpts = { preventDefault: true, enableOnFormTags: false } as const;
  useHotkeys("arrowup",    () => nudge(0, -1),  nudgeOpts);
  useHotkeys("arrowdown",  () => nudge(0, 1),   nudgeOpts);
  useHotkeys("arrowleft",  () => nudge(-1, 0),  nudgeOpts);
  useHotkeys("arrowright", () => nudge(1, 0),   nudgeOpts);
  useHotkeys("shift+arrowup",    () => nudge(0, -10),  nudgeOpts);
  useHotkeys("shift+arrowdown",  () => nudge(0, 10),   nudgeOpts);
  useHotkeys("shift+arrowleft",  () => nudge(-10, 0),  nudgeOpts);
  useHotkeys("shift+arrowright", () => nudge(10, 0),   nudgeOpts);

  return {
    copy: copySelected,
    cut: cutSelected,
    paste: pasteClipboard,
    duplicate: duplicateSelected,
    deleteSelected,
    selectAll,
  };
}
