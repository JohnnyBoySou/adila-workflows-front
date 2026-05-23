import { memo, useState } from "react";
import { type NodeProps, type Node, NodeResizer } from "@xyflow/react";

import { cn } from "~/lib/utils";

export type ContainerColor = "slate" | "blue" | "green" | "amber" | "rose" | "violet";

export type ContainerData = {
  label: string;
  color?: ContainerColor;
};

export type ContainerNode = Node<ContainerData, "container">;

/**
 * Container estilo Figma frame: retângulo que circula uma área do canvas pra
 * agrupar visualmente nós. Não tem relação pai/filho — agrupamento é por
 * geometria. Header arrastável; corpo transparente pra cliques passarem pros
 * nós que ficam por cima.
 */
const COLOR_MAP: Record<ContainerColor, { ring: string; bg: string; header: string }> = {
  slate: {
    ring: "ring-slate-400/50",
    bg: "bg-slate-400/5",
    header: "bg-slate-400/15 text-slate-700 dark:text-slate-200",
  },
  blue: {
    ring: "ring-sky-400/50",
    bg: "bg-sky-400/5",
    header: "bg-sky-400/15 text-sky-700 dark:text-sky-200",
  },
  green: {
    ring: "ring-emerald-400/50",
    bg: "bg-emerald-400/5",
    header: "bg-emerald-400/15 text-emerald-700 dark:text-emerald-200",
  },
  amber: {
    ring: "ring-amber-400/50",
    bg: "bg-amber-400/5",
    header: "bg-amber-400/15 text-amber-700 dark:text-amber-200",
  },
  rose: {
    ring: "ring-rose-400/50",
    bg: "bg-rose-400/5",
    header: "bg-rose-400/15 text-rose-700 dark:text-rose-200",
  },
  violet: {
    ring: "ring-violet-400/50",
    bg: "bg-violet-400/5",
    header: "bg-violet-400/15 text-violet-700 dark:text-violet-200",
  },
};

function ContainerNodeComponent({ data, selected }: NodeProps<ContainerNode>) {
  const [label, setLabel] = useState(data.label ?? "Grupo");
  const palette = COLOR_MAP[data.color ?? "slate"];

  return (
    <div
      className={cn(
        "relative flex h-full w-full flex-col rounded-lg ring-2 transition-shadow",
        palette.ring,
        palette.bg,
        selected ? "ring-foreground/40" : palette.ring,
      )}
    >
      <NodeResizer
        isVisible={selected}
        minWidth={160}
        minHeight={120}
        lineClassName="!border-foreground/30"
        handleClassName="!size-2 !rounded-sm !border !border-foreground/40 !bg-background"
      />
      {/* Header: arrastável e editável */}
      <div
        className={cn(
          "flex items-center gap-2 rounded-t-lg px-3 py-1.5 text-xs font-medium",
          palette.header,
        )}
      >
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          aria-label="Nome do grupo"
          placeholder="Grupo"
          className="nodrag flex-1 bg-transparent text-xs font-medium outline-none placeholder:opacity-60"
        />
      </div>
      {/* Corpo transparente — cliques passam pros nós que estão por cima */}
      <div className="pointer-events-none flex-1" />
    </div>
  );
}

export default memo(ContainerNodeComponent);
