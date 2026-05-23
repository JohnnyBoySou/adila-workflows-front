import { memo } from "react";
import { Handle, Position, type NodeProps, type Node } from "@xyflow/react";
import {
  Play,
  Workflow as WorkflowIcon,
  GitBranch,
  Square,
  Database,
  Sparkles,
} from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { cn } from "~/lib/utils";
import { useExecutionStore, type NodeExecutionStatus } from "~/stores/execution";

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
};

export type WorkflowNode = Node<WorkflowNodeData, "workflow">;

const VARIANT_META: Record<
  WorkflowNodeVariant,
  { icon: React.ComponentType<{ className?: string }>; color: string; chip: string }
> = {
  trigger: { icon: Play, color: "text-emerald-500", chip: "bg-emerald-500" },
  action: { icon: WorkflowIcon, color: "text-sky-500", chip: "bg-sky-500" },
  condition: { icon: GitBranch, color: "text-amber-500", chip: "bg-amber-500" },
  end: { icon: Square, color: "text-rose-500", chip: "bg-rose-500" },
  data: { icon: Database, color: "text-violet-500", chip: "bg-violet-500" },
  ai: { icon: Sparkles, color: "text-fuchsia-500", chip: "bg-fuchsia-500" },
};

function WorkflowNodeComponent({ id, data, selected }: NodeProps<WorkflowNode>) {
  const variant = data.variant ?? "action";
  const meta = VARIANT_META[variant];
  const Icon = meta.icon;
  // Seletor fino — só este nó re-renderiza quando o status dele muda.
  const executionStatus = useExecutionStore((s) => s.stepsByNodeId[id]?.status);
  const executionRing = executionStatus ? EXECUTION_RING[executionStatus] : null;

  return (
    <Card
      className={cn(
        "w-56 gap-2 py-3 transition-shadow",
        selected && "ring-2 ring-ring",
        executionRing,
      )}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!size-2 !border-background !bg-primary"
      />
      <div className={cn("absolute left-0 top-0 h-1 w-full rounded-t-xl", meta.chip)} />
      <CardHeader className="flex flex-row items-center gap-2 px-3">
        <Icon className={cn("size-4 shrink-0", meta.color)} />
        <CardTitle className="text-sm">{data.title}</CardTitle>
      </CardHeader>
      {data.description ? (
        <CardContent className="px-3 text-xs text-muted-foreground">{data.description}</CardContent>
      ) : null}
      <Handle
        type="source"
        position={Position.Bottom}
        className="!size-2 !border-background !bg-primary"
      />
    </Card>
  );
}

export default memo(WorkflowNodeComponent);
