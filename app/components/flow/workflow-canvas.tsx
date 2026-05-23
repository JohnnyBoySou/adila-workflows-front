import { useCallback, useMemo } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  type Connection,
  type Edge,
  type Node,
} from "@xyflow/react";

import WorkflowNodeComponent, { type WorkflowNode } from "./workflow-node";

const initialNodes: WorkflowNode[] = [
  {
    id: "1",
    type: "workflow",
    position: { x: 0, y: 0 },
    data: { title: "Início", description: "Gatilho do workflow" },
  },
  {
    id: "2",
    type: "workflow",
    position: { x: -160, y: 160 },
    data: { title: "Validar dados", description: "Checa o payload de entrada" },
  },
  {
    id: "3",
    type: "workflow",
    position: { x: 160, y: 160 },
    data: { title: "Enviar e-mail", description: "Notifica o lead" },
  },
  {
    id: "4",
    type: "workflow",
    position: { x: 0, y: 320 },
    data: { title: "Fim", description: "Workflow concluído" },
  },
];

const initialEdges: Edge[] = [
  { id: "e1-2", source: "1", target: "2", animated: true },
  { id: "e1-3", source: "1", target: "3", animated: true },
  { id: "e2-4", source: "2", target: "4" },
  { id: "e3-4", source: "3", target: "4" },
];

function Flow() {
  const nodeTypes = useMemo(() => ({ workflow: WorkflowNodeComponent }), []);
  const [nodes, , onNodesChange] = useNodesState<Node>(initialNodes as Node[]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(initialEdges);

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge({ ...params, animated: true }, eds)),
    [setEdges],
  );

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onConnect={onConnect}
      fitView
      proOptions={{ hideAttribution: true }}
      className="bg-background"
    >
      <Background variant={BackgroundVariant.Dots} gap={16} size={1} />
      <Controls className="!ring-1 !ring-border" />
      <MiniMap pannable zoomable className="!bg-card" />
    </ReactFlow>
  );
}

export function WorkflowCanvas() {
  return (
    <ReactFlowProvider>
      <Flow />
    </ReactFlowProvider>
  );
}
