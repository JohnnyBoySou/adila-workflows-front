/**
 * Store global do editor de flow.
 *
 * Mantém os toggles da toolbar (tool atual, lock, minimap, drawer da biblioteca,
 * variante do background) fora dos componentes — assim cada consumidor assina
 * apenas a fatia que precisa e o canvas não re-renderiza quando o usuário só
 * troca de ferramenta ou abre o drawer.
 *
 * `nodes`/`edges` continuam nos hooks do React Flow (`useNodesState`), que já
 * usam Zustand internamente.
 */
import { create } from "zustand";
import { BackgroundVariant } from "@xyflow/react";

export type ToolMode = "select" | "pan";

const BG_VARIANTS: BackgroundVariant[] = [
  BackgroundVariant.Dots,
  BackgroundVariant.Lines,
  BackgroundVariant.Cross,
];

type FlowState = {
  tool: ToolMode;
  locked: boolean;
  miniMapVisible: boolean;
  libraryOpen: boolean;
  backgroundVariant: BackgroundVariant;

  setTool: (tool: ToolMode) => void;
  setLocked: (locked: boolean) => void;
  toggleLock: () => void;
  setMiniMapVisible: (visible: boolean) => void;
  toggleMiniMap: () => void;
  setLibraryOpen: (open: boolean) => void;
  cycleBackground: () => void;
};

export const useFlowStore = create<FlowState>()((set) => ({
  tool: "select",
  locked: false,
  miniMapVisible: true,
  libraryOpen: false,
  backgroundVariant: BackgroundVariant.Dots,

  setTool: (tool) => set({ tool }),
  setLocked: (locked) => set({ locked }),
  toggleLock: () => set((s) => ({ locked: !s.locked })),
  setMiniMapVisible: (miniMapVisible) => set({ miniMapVisible }),
  toggleMiniMap: () => set((s) => ({ miniMapVisible: !s.miniMapVisible })),
  setLibraryOpen: (libraryOpen) => set({ libraryOpen }),
  cycleBackground: () =>
    set((s) => {
      const idx = BG_VARIANTS.indexOf(s.backgroundVariant);
      return { backgroundVariant: BG_VARIANTS[(idx + 1) % BG_VARIANTS.length] };
    }),
}));
