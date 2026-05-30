/**
 * Edge customizado: renderiza um Bezier path normal + ícone de lixeira
 * flutuante no meio. Lixeira só aparece no hover. Click remove a aresta.
 */
import { useState } from "react";
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  useReactFlow,
  type EdgeProps,
} from "@xyflow/react";
import { Trash2 } from "lucide-react";

import { cn } from "~/lib/utils";

export function WorkflowEdge(props: EdgeProps) {
  const {
    id,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    style,
    markerEnd,
    label,
    animated,
  } = props;

  // Força a animação CSS quando edge.animated=true. React Flow normalmente
  // aplica via classe `.animated` no `<g>` pai, mas quando inline style já
  // tem `strokeDasharray` setado (caso skipped) ou quando wrapper não casa,
  // a animação não pega. Aqui aplicamos diretamente.
  const animatedStyle =
    animated && !(style?.strokeDasharray)
      ? { ...style, strokeDasharray: "5", animation: "dashdraw 0.5s linear infinite" }
      : style;

  const [hover, setHover] = useState(false);
  const { setEdges } = useReactFlow();

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  return (
    <>
      <BaseEdge path={edgePath} markerEnd={markerEnd} style={animatedStyle} />
      {/* Hit area invisível mais larga pra hover detection — sem isso o
          path fino de 1-2px é quase impossível de hoverar. */}
      <path
        d={edgePath}
        fill="none"
        stroke="transparent"
        strokeWidth={22}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
      />
      <EdgeLabelRenderer>
        <div
          onMouseEnter={() => setHover(true)}
          onMouseLeave={() => setHover(false)}
          className={cn(
            "pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2 transition-opacity duration-100",
            hover ? "opacity-100" : "opacity-0",
          )}
          style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
        >
          <div className="flex items-center gap-1">
            {/* Label visual (true/false/0/1/etc) — só renderiza se houver,
                fica embutida no mesmo container do hover pra não conflitar
                com o ícone de delete. */}
            {label && (
              <span className="rounded-md border border-border bg-background px-1.5 py-0.5 font-mono text-[10px] text-foreground/70 shadow-sm">
                {label}
              </span>
            )}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setEdges((edges) => edges.filter((edge) => edge.id !== id));
              }}
              title="Remover conexão"
              aria-label="Remover conexão"
              className="grid size-5 place-items-center rounded-full border border-rose-500/50 bg-background text-rose-500 shadow-sm transition-colors hover:bg-rose-500 hover:text-white"
            >
              <Trash2 className="size-2.5" strokeWidth={2.5} />
            </button>
          </div>
        </div>
      </EdgeLabelRenderer>
    </>
  );
}
