import { useCallback, useMemo } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  MiniMap,
  Panel,
  addEdge,
  useNodesState,
  useEdgesState,
  useReactFlow,
  type Connection,
  type Edge,
  type Node,
} from "@xyflow/react";

import WorkflowNodeComponent, { type WorkflowNode } from "./workflow-node";
import StickyNoteNodeComponent, { type StickyNoteNode } from "./sticky-note-node";
import ContainerNodeComponent, { type ContainerNode } from "./container-node";
import { FlowToolbar } from "./flow-toolbar";
import { NodeLibraryDrawer } from "./node-library-drawer";
import type { NodeLibraryEntry } from "./node-library";
import { useFlowShortcuts } from "~/hooks/use-flow-shortcuts";
import { useFlowStore } from "~/stores/flow";

const initialNodes: WorkflowNode[] = [
  {
    id: "1",
    type: "workflow",
    position: { x: 0, y: 0 },
    data: { title: "Início", description: "Gatilho do workflow", variant: "trigger" },
  },
  {
    id: "2",
    type: "workflow",
    position: { x: -180, y: 160 },
    data: { title: "Validar dados", description: "Checa o payload de entrada", variant: "action" },
  },
  {
    id: "3",
    type: "workflow",
    position: { x: 180, y: 160 },
    data: { title: "Enviar e-mail", description: "Notifica o lead", variant: "action" },
  },
  {
    id: "4",
    type: "workflow",
    position: { x: 0, y: 320 },
    data: { title: "Fim", description: "Workflow concluído", variant: "end" },
  },
];

const initialEdges: Edge[] = [
  { id: "e1-2", source: "1", target: "2", animated: true },
  { id: "e1-3", source: "1", target: "3", animated: true },
  { id: "e2-4", source: "2", target: "4" },
  { id: "e3-4", source: "3", target: "4" },
];

let nodeIdCounter = initialNodes.length + 1;
const nextNodeId = () => String(nodeIdCounter++);

function Flow() {
  const nodeTypes = useMemo(
    () => ({
      workflow: WorkflowNodeComponent,
      sticky: StickyNoteNodeComponent,
      container: ContainerNodeComponent,
    }),
    [],
  );
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>(initialNodes as Node[]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(initialEdges);

  // Toggles de UI vêm do Zustand — assinaturas finas evitam re-render do canvas
  // quando outros pedaços da toolbar mudam.
  const isPanMode = useFlowStore((s) => s.tool === "pan");
  const locked = useFlowStore((s) => s.locked);
  const miniMapVisible = useFlowStore((s) => s.miniMapVisible);
  const libraryOpen = useFlowStore((s) => s.libraryOpen);
  const backgroundVariant = useFlowStore((s) => s.backgroundVariant);
  const setLibraryOpen = useFlowStore((s) => s.setLibraryOpen);

  const { screenToFlowPosition } = useReactFlow();

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge({ ...params, animated: true }, eds)),
    [setEdges],
  );

  const centerFlowPosition = useCallback(() => {
    if (typeof window === "undefined") return { x: 0, y: 0 };
    return screenToFlowPosition({
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
    });
  }, [screenToFlowPosition]);

  const handleAddSticky = useCallback(() => {
    const id = nextNodeId();
    const pos = centerFlowPosition();
    const node: StickyNoteNode = {
      id,
      type: "sticky",
      position: { x: pos.x - 80, y: pos.y - 60 },
      width: 180,
      height: 140,
      data: { text: "", color: "yellow" },
    };
    setNodes((prev) => [...prev, node as Node]);
  }, [setNodes, centerFlowPosition]);

  const handleAddContainer = useCallback(() => {
    const id = nextNodeId();
    const pos = centerFlowPosition();
    const node: ContainerNode = {
      id,
      type: "container",
      position: { x: pos.x - 200, y: pos.y - 140 },
      width: 400,
      height: 280,
      // zIndex negativo deixa o frame atrás dos nós executáveis
      zIndex: -1,
      // Não-conectável: container é puramente visual
      selectable: true,
      data: { label: "Grupo", color: "slate" },
    };
    setNodes((prev) => [...prev, node as Node]);
  }, [setNodes, centerFlowPosition]);

  const handleAddFromLibrary = useCallback(
    (entry: NodeLibraryEntry) => {
      const id = nextNodeId();
      const pos = centerFlowPosition();
      const node = entry.build({ x: pos.x - 110, y: pos.y - 40 }, id);
      setNodes((prev) => [...prev, node]);
    },
    [setNodes, centerFlowPosition],
  );

  useFlowShortcuts({ onAddSticky: handleAddSticky, onAddContainer: handleAddContainer });

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
      panOnDrag={isPanMode ? true : [1, 2]}
      selectionOnDrag={!isPanMode && !locked}
      nodesDraggable={!locked}
      nodesConnectable={!locked}
      elementsSelectable={!locked}
    >
      <Background variant={backgroundVariant} gap={16} size={1} />
      {miniMapVisible && (
        <MiniMap
          pannable
          zoomable
          className="!rounded-lg !border !border-border !bg-card !ring-1 !ring-foreground/5"
        />
      )}
      <Panel position="bottom-center" className="!bottom-6">
        <FlowToolbar onAddSticky={handleAddSticky} onAddContainer={handleAddContainer} />
      </Panel>
      <NodeLibraryDrawer
        open={libraryOpen}
        onOpenChange={setLibraryOpen}
        onSelect={handleAddFromLibrary}
      />
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
