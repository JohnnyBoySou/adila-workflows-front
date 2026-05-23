import { memo, useCallback } from "react";
import {
  Handle,
  NodeToolbar,
  Position,
  useReactFlow,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Database,
  GitBranch,
  Pin,
  Play,
  Power,
  Sparkles,
  Square,
  Trash2,
  Workflow as WorkflowIcon,
} from "lucide-react";

import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { cn } from "~/lib/utils";
import { useExecutionStore, type NodeExecutionStatus } from "~/stores/execution";
import { useIsPinned } from "~/stores/pinned-data";
import { useWorkflowId } from "./workflow-context";

/**
 * Evento global emitido quando o usuário pede "play" num nó via toolbar.
 * O canvas / a rota podem escutar para disparar uma execução do workflow.
 * Vai por window pra evitar acoplar o nó (componente leaf) à mutation.
 */
export const WORKFLOW_NODE_PLAY_EVENT = "workflow:node-play";
export type WorkflowNodePlayDetail = { nodeId: string };

const EXECUTION_RING: Record<NodeExecutionStatus, string> = {
  running: "ring-2 ring-sky-500 ring-offset-1 ring-offset-background",
  success: "ring-2 ring-emerald-500 ring-offset-1 ring-offset-background",
  failed: "ring-2 ring-rose-500 ring-offset-1 ring-offset-background",
};

export type WorkflowNodeVariant = "trigger" | "action" | "condition" | "end" | "data" | "ai";

export type WorkflowNodeData = {
  title: string;
  description?: string;
  variant?: WorkflowNodeVariant;
  /**
   * Tipo do nó no engine (espelha `NodeType` do backend). Permite que o
   * editor saiba como serializar `definition.nodes[].type` no save sem
   * depender de heurística por título/variant.
   */
  nodeType?: string;
  /** Quando true, o engine ignora o nó na execução. */
  disabled?: boolean;
};

export type WorkflowNode = Node<WorkflowNodeData, "workflow">;

const VARIANT_META: Record<
  WorkflowNodeVariant,
  {
    icon: React.ComponentType<{ className?: string }>;
    iconColor: string;
    iconBg: string;
  }
> = {
  trigger: { icon: Play, iconColor: "text-emerald-600", iconBg: "bg-emerald-500/15" },
  action: { icon: WorkflowIcon, iconColor: "text-sky-600", iconBg: "bg-sky-500/15" },
  condition: { icon: GitBranch, iconColor: "text-amber-600", iconBg: "bg-amber-500/15" },
  end: { icon: Square, iconColor: "text-rose-600", iconBg: "bg-rose-500/15" },
  data: { icon: Database, iconColor: "text-violet-600", iconBg: "bg-violet-500/15" },
  ai: { icon: Sparkles, iconColor: "text-fuchsia-600", iconBg: "bg-fuchsia-500/15" },
};

function WorkflowNodeComponent({ id, data, selected }: NodeProps<WorkflowNode>) {
  const variant = data.variant ?? "action";
  const meta = VARIANT_META[variant];
  const Icon = meta.icon;
  // Seletor fino — só este nó re-renderiza quando o status dele muda.
  const executionStatus = useExecutionStore((s) => s.stepsByNodeId[id]?.status);
  const executionRing = executionStatus ? EXECUTION_RING[executionStatus] : null;
  // Pin: lê o workflowId do contexto do canvas e consulta o store por id.
  // Nó fora do provider (improvável) cai num `null` e nunca aparece pinado.
  const workflowId = useWorkflowId();
  const pinned = useIsPinned(workflowId ?? "", workflowId ? id : null);

  const { setNodes, deleteElements } = useReactFlow();

  const handlePlay = useCallback(() => {
    window.dispatchEvent(
      new CustomEvent<WorkflowNodePlayDetail>(WORKFLOW_NODE_PLAY_EVENT, {
        detail: { nodeId: id },
      }),
    );
  }, [id]);

  const handleToggleDisabled = useCallback(() => {
    setNodes((prev) =>
      prev.map((n) =>
        n.id === id
          ? { ...n, data: { ...n.data, disabled: !(n.data as WorkflowNodeData).disabled } }
          : n,
      ),
    );
  }, [id, setNodes]);

  const handleDelete = useCallback(() => {
    deleteElements({ nodes: [{ id }] });
  }, [id, deleteElements]);

  return (
    <Card
      className={cn(
        "w-56 gap-2 py-3 transition-shadow !overflow-visible",
        selected && "ring-2 ring-ring",
        data.disabled && "opacity-50",
        executionRing,
      )}
    >
      <AnimatePresence>
        {selected && (
          <NodeToolbar isVisible position={Position.Top} offset={8}>
            <motion.div
              initial={{ y: 8, opacity: 0, scale: 0.96 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: 8, opacity: 0, scale: 0.96 }}
              transition={{ type: "spring", stiffness: 400, damping: 28, mass: 0.6 }}
              className="flex items-center gap-0.5 rounded-md border border-border bg-popover p-1 shadow-md"
            >
          <Button
            size="icon-sm"
            variant="ghost"
            onClick={handlePlay}
            title="Executar workflow a partir deste nó"
            aria-label="Executar"
          >
            <Play className="size-3.5" />
          </Button>
          <Button
            size="icon-sm"
            variant="ghost"
            onClick={handleToggleDisabled}
            title={data.disabled ? "Ativar nó" : "Desativar nó"}
            aria-label={data.disabled ? "Ativar" : "Desativar"}
            className={cn(data.disabled && "text-amber-600")}
          >
            <Power className="size-3.5" />
          </Button>
          <Button
            size="icon-sm"
            variant="ghost"
            onClick={handleDelete}
            title="Excluir nó"
            aria-label="Excluir"
            className="text-destructive hover:!bg-destructive/10 hover:!text-destructive"
          >
            <Trash2 className="size-3.5" />
          </Button>
            </motion.div>
          </NodeToolbar>
        )}
      </AnimatePresence>

      <Handle
        type="target"
        position={Position.Left}
        className="!z-10 !size-2.5 !border-2 !border-background !bg-primary transition-[width,height] duration-150 hover:!size-4"
      />
      {pinned && (
        <span
          className="absolute -right-1.5 -top-1.5 grid size-5 place-items-center rounded-full bg-amber-500 text-white shadow-sm ring-2 ring-background"
          title="Saída pinada — próximas runs usam este resultado"
        >
          <Pin className="size-2.5" />
        </span>
      )}
      <CardHeader className="flex flex-row items-center gap-2 px-3">
        <span className={cn("grid size-7 shrink-0 place-items-center rounded-md", meta.iconBg)}>
          <Icon className={cn("size-4", meta.iconColor)} />
        </span>
        <CardTitle className="text-sm">{data.title}</CardTitle>
      </CardHeader>
      {data.description ? (
        <CardContent className="px-3 text-xs text-muted-foreground">{data.description}</CardContent>
      ) : null}
      <Handle
        type="source"
        position={Position.Right}
        className="!z-10 !size-2.5 !border-2 !border-background !bg-primary transition-[width,height] duration-150 hover:!size-4"
      />
    </Card>
  );
}

export default memo(WorkflowNodeComponent);
