import { memo } from "react";
import { Handle, Position, type NodeProps, type Node } from "@xyflow/react";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";

export type WorkflowNodeData = {
  title: string;
  description?: string;
};

export type WorkflowNode = Node<WorkflowNodeData, "workflow">;

function WorkflowNodeComponent({ data, selected }: NodeProps<WorkflowNode>) {
  return (
    <Card className={`w-56 gap-2 py-3 ${selected ? "ring-2 ring-ring" : ""}`}>
      <Handle
        type="target"
        position={Position.Top}
        className="!size-2 !border-background !bg-primary"
      />
      <CardHeader className="px-3">
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
