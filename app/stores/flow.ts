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
import { persist } from "zustand/middleware";
import { BackgroundVariant, ConnectionLineType } from "@xyflow/react";

export type ToolMode = "select" | "pan";

const BG_VARIANTS: BackgroundVariant[] = [
  BackgroundVariant.Dots,
  BackgroundVariant.Lines,
  BackgroundVariant.Cross,
];

export type EdgeStyle = {
  /** Tipo da curva da edge (default/bezier/straight/step/smoothstep/simplebezier). */
  type: ConnectionLineType;
  /** Cor sólida (ou primeira parada quando `gradient: true`). */
  color: string;
  /** Aplica gradiente linear de `color` → `colorEnd`. */
  gradient: boolean;
  /** Segunda parada do gradiente. Ignorado quando `gradient: false`. */
  colorEnd: string;
  /** Anima o pontilhado/fluxo da edge. */
  animated: boolean;
  /** Aplica `stroke-dasharray` na edge. */
  dashed: boolean;
  /** Espessura do traço em px. */
  thickness: number;
  /** Marca de seta no destino. */
  arrow: boolean;
  /**
   * Direção do pico viajante quando `gradient + animated`.
   * - `alternate`: vai e volta (padrão histórico).
   * - `forward`: contínuo do início ao destino, reinicia no início.
   * - `backward`: contínuo do destino ao início, reinicia no destino.
   * Ignorado quando `gradient` ou `animated` estão desligados.
   */
  flowDirection: "alternate" | "forward" | "backward";
};

export const DEFAULT_EDGE_STYLE: EdgeStyle = {
  type: ConnectionLineType.Bezier,
  color: "#94a3b8",
  gradient: false,
  colorEnd: "#0ea5e9",
  animated: true,
  dashed: false,
  thickness: 1.5,
  arrow: false,
  flowDirection: "forward",
};

type FlowState = {
  tool: ToolMode;
  locked: boolean;
  miniMapVisible: boolean;
  libraryOpen: boolean;
  backgroundVariant: BackgroundVariant;
  edgeStyle: EdgeStyle;
  presentationMode: boolean;
  historyVisible: boolean;
  /**
   * Snap-to-grid permanente ao arrastar nodes. Quando ligado, o canvas cola
   * na grade do background (16px). Segurar Shift durante drag inverte o
   * estado momentaneamente (off → on / on → off) — Figma-like override.
   */
  snapToGrid: boolean;

  setTool: (tool: ToolMode) => void;
  setLocked: (locked: boolean) => void;
  toggleLock: () => void;
  setMiniMapVisible: (visible: boolean) => void;
  toggleMiniMap: () => void;
  setLibraryOpen: (open: boolean) => void;
  cycleBackground: () => void;
  setBackgroundVariant: (variant: BackgroundVariant) => void;
  setEdgeStyle: (style: Partial<EdgeStyle>) => void;
  resetEdgeStyle: () => void;
  togglePresentationMode: () => void;
  toggleHistoryVisible: () => void;
  setSnapToGrid: (snap: boolean) => void;
  toggleSnapToGrid: () => void;
};

export const useFlowStore = create<FlowState>()(
  persist(
    (set) => ({
      tool: "select",
      locked: false,
      miniMapVisible: true,
      libraryOpen: false,
      backgroundVariant: BackgroundVariant.Dots,
      edgeStyle: DEFAULT_EDGE_STYLE,
      presentationMode: false,
      historyVisible: false,
      snapToGrid: false,

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
      setBackgroundVariant: (backgroundVariant) => set({ backgroundVariant }),
      setEdgeStyle: (style) => set((s) => ({ edgeStyle: { ...s.edgeStyle, ...style } })),
      resetEdgeStyle: () => set({ edgeStyle: DEFAULT_EDGE_STYLE }),
      togglePresentationMode: () => set((s) => ({ presentationMode: !s.presentationMode })),
      toggleHistoryVisible: () => set((s) => ({ historyVisible: !s.historyVisible })),
      setSnapToGrid: (snapToGrid) => set({ snapToGrid }),
      toggleSnapToGrid: () => set((s) => ({ snapToGrid: !s.snapToGrid })),
    }),
    {
      name: "flow-ui",
      // Persiste só preferências visuais — toggles de sessão (libraryOpen, tool)
      // ficam de fora pra não "vazar" estado efêmero entre recargas.
      partialize: (s) => ({
        miniMapVisible: s.miniMapVisible,
        backgroundVariant: s.backgroundVariant,
        edgeStyle: s.edgeStyle,
        snapToGrid: s.snapToGrid,
      }),
      // Merge raso por padrão deixa campos novos do `edgeStyle` como
      // `undefined` quando o localStorage tem uma versão antiga do shape.
      // Forçamos um merge profundo do edgeStyle pra herdar defaults novos.
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<FlowState>;
        return {
          ...current,
          ...p,
          edgeStyle: { ...current.edgeStyle, ...(p.edgeStyle ?? {}) },
        };
      },
    },
  ),
);
