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
  Magnet,
  Sparkles,
  Download,
  Maximize,
  Minimize,
  History,
} from "lucide-react";
import { useReactFlow, useViewport, getNodesBounds, getViewportForBounds } from "@xyflow/react";
import { toPng } from "html-to-image";

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
  const presentationMode = useFlowStore((s) => s.presentationMode);
  const historyVisible = useFlowStore((s) => s.historyVisible);
  const setTool = useFlowStore((s) => s.setTool);
  const toggleLock = useFlowStore((s) => s.toggleLock);
  const toggleMiniMap = useFlowStore((s) => s.toggleMiniMap);
  const setLibraryOpen = useFlowStore((s) => s.setLibraryOpen);
  const cycleBackground = useFlowStore((s) => s.cycleBackground);
  const snapToGrid = useFlowStore((s) => s.snapToGrid);
  const toggleSnapToGrid = useFlowStore((s) => s.toggleSnapToGrid);
  const togglePresentationMode = useFlowStore((s) => s.togglePresentationMode);
  const toggleHistoryVisible = useFlowStore((s) => s.toggleHistoryVisible);

  const { zoomIn, zoomOut, fitView, zoomTo, getNodes } = useReactFlow();
  const { zoom } = useViewport();

  const handleExportPng = () => {
    const viewport = document.querySelector(".react-flow__viewport") as HTMLElement | null;
    if (!viewport) return;

    const allNodes = getNodes();
    if (allNodes.length === 0) {
      toPng(viewport, { cacheBust: true }).then((dataUrl) => {
        const a = document.createElement("a");
        a.href = dataUrl;
        a.download = `workflow-${new Date().toISOString().slice(0, 10)}.png`;
        a.click();
      });
      return;
    }

    const bounds = getNodesBounds(allNodes);
    const padding = 40;
    const width = bounds.width + padding * 2;
    const height = bounds.height + padding * 2;
    const { x, y, zoom: vpZoom } = getViewportForBounds(bounds, width, height, 0.5, 2, padding / Math.max(width, height));

    toPng(viewport, {
      cacheBust: true,
      width,
      height,
      style: {
        width: `${width}px`,
        height: `${height}px`,
        transform: `translate(${x}px, ${y}px) scale(${vpZoom})`,
        transformOrigin: "top left",
      },
    }).then((dataUrl) => {
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = `workflow-${new Date().toISOString().slice(0, 10)}.png`;
      a.click();
    });
  };

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
        <ToolButton
          active={snapToGrid}
          onClick={toggleSnapToGrid}
          title={
            snapToGrid
              ? "Snap to grid: ligado (segure Shift para mover livre)"
              : "Snap to grid: desligado (segure Shift para colar na grade)"
          }
        >
          <Magnet className="size-4" />
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
        <ToolButton
          active={presentationMode}
          onClick={togglePresentationMode}
          title={presentationMode ? "Sair do modo apresentação — ⌘⇧P" : "Modo apresentação — ⌘⇧P"}
        >
          {presentationMode ? <Minimize className="size-4" /> : <Maximize className="size-4" />}
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
          onClick={() => zoomTo(1, { duration: 200 })}
          title="Zoom 100% — clique para resetar"
          className="min-w-14 cursor-pointer rounded-md px-2 py-1 text-xs font-mono tabular-nums text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
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

        <Divider />

        {/* Export + History */}
        <ToolButton onClick={handleExportPng} title="Exportar como PNG">
          <Download className="size-4" />
        </ToolButton>
        <ToolButton
          active={historyVisible}
          onClick={toggleHistoryVisible}
          title="Histórico de ações"
        >
          <History className="size-4" />
        </ToolButton>
      </motion.div>
    </motion.div>
  );
}
