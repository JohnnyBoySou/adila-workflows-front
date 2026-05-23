import { motion } from "framer-motion";
import {
  MousePointer2,
  Hand,
  Plus,
  StickyNote,
  Frame,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Lock,
  Unlock,
  Map as MapIcon,
  Grid3x3,
  Sparkles,
} from "lucide-react";
import { useReactFlow, useViewport } from "@xyflow/react";

import { cn } from "~/lib/utils";
import { useFlowStore } from "~/stores/flow";

export type FlowToolbarProps = {
  onAddSticky: () => void;
  onAddContainer: () => void;
  onAutoLayout: () => void;
};

function ToolButton({
  active,
  onClick,
  title,
  children,
  className,
}: {
  active?: boolean;
  onClick?: () => void;
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      whileHover={{ scale: 1.08 }}
      whileTap={{ scale: 0.92 }}
      transition={{ type: "spring", stiffness: 500, damping: 25 }}
      className={cn(
        "relative grid size-9 cursor-pointer place-items-center rounded-md text-foreground/70 transition-colors hover:bg-muted hover:text-foreground",
        active &&
          "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground",
        className,
      )}
    >
      {children}
    </motion.button>
  );
}

function Divider() {
  return <div className="mx-1 h-6 w-px bg-border" aria-hidden />;
}

export function FlowToolbar({ onAddSticky, onAddContainer, onAutoLayout }: FlowToolbarProps) {
  const tool = useFlowStore((s) => s.tool);
  const locked = useFlowStore((s) => s.locked);
  const miniMapVisible = useFlowStore((s) => s.miniMapVisible);
  const libraryOpen = useFlowStore((s) => s.libraryOpen);
  const backgroundVariant = useFlowStore((s) => s.backgroundVariant);
  const setTool = useFlowStore((s) => s.setTool);
  const toggleLock = useFlowStore((s) => s.toggleLock);
  const toggleMiniMap = useFlowStore((s) => s.toggleMiniMap);
  const setLibraryOpen = useFlowStore((s) => s.setLibraryOpen);
  const cycleBackground = useFlowStore((s) => s.cycleBackground);

  const { zoomIn, zoomOut, fitView } = useReactFlow();
  const { zoom } = useViewport();

  return (
    <motion.div
      initial={{ y: 80, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ type: "spring", stiffness: 320, damping: 28, delay: 0.15 }}
      className="pointer-events-auto relative"
    >
      <motion.div
        layout
        className="flex items-center gap-0.5 rounded-xl border border-border bg-card/95 p-1.5 ring-1 ring-foreground/5 backdrop-blur"
      >
        {/* Cursor tools */}
        <ToolButton
          active={tool === "select"}
          onClick={() => setTool("select")}
          title="Selecionar — V"
        >
          <MousePointer2 className="size-4" />
        </ToolButton>
        <ToolButton active={tool === "pan"} onClick={() => setTool("pan")} title="Mover — H">
          <Hand className="size-4" />
        </ToolButton>

        <Divider />

        {/* Create */}
        <ToolButton
          active={libraryOpen}
          onClick={() => setLibraryOpen(true)}
          title="Adicionar nó — N"
        >
          <Plus className="size-4" />
        </ToolButton>
        <ToolButton onClick={onAddSticky} title="Sticky note — S">
          <StickyNote className="size-4" />
        </ToolButton>
        <ToolButton onClick={onAddContainer} title="Frame / Grupo — F">
          <Frame className="size-4" />
        </ToolButton>
        <ToolButton onClick={onAutoLayout} title="Auto-organizar — Shift A">
          <Sparkles className="size-4" />
        </ToolButton>

        <Divider />

        {/* View */}
        <ToolButton onClick={cycleBackground} title={`Fundo: ${backgroundVariant}`}>
          <Grid3x3 className="size-4" />
        </ToolButton>
        <ToolButton active={miniMapVisible} onClick={toggleMiniMap} title="Minimap — M">
          <MapIcon className="size-4" />
        </ToolButton>
        <ToolButton
          active={locked}
          onClick={toggleLock}
          title={locked ? "Desbloquear — L" : "Bloquear — L"}
        >
          {locked ? <Lock className="size-4" /> : <Unlock className="size-4" />}
        </ToolButton>

        <Divider />

        {/* Zoom */}
        <ToolButton onClick={() => zoomOut({ duration: 200 })} title="Diminuir zoom — ⌘−">
          <ZoomOut className="size-4" />
        </ToolButton>
        <motion.button
          type="button"
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => fitView({ duration: 400, padding: 0.2 })}
          title="Ajustar à tela — Shift 1"
          className="min-w-14 cursor-pointer rounded-md px-2 py-1 text-xs font-medium tabular-nums text-foreground/70 transition-colors hover:bg-muted hover:text-foreground"
        >
          {Math.round(zoom * 100)}%
        </motion.button>
        <ToolButton onClick={() => zoomIn({ duration: 200 })} title="Aumentar zoom — ⌘+">
          <ZoomIn className="size-4" />
        </ToolButton>
        <ToolButton
          onClick={() => fitView({ duration: 400, padding: 0.2 })}
          title="Zoom na seleção — Shift 2"
        >
          <Maximize2 className="size-4" />
        </ToolButton>
      </motion.div>
    </motion.div>
  );
}
