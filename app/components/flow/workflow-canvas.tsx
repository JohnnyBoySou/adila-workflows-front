import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
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

import WorkflowNodeComponent from "./workflow-node";
import StickyNoteNodeComponent, { type StickyNoteNode } from "./sticky-note-node";
import ContainerNodeComponent, { type ContainerNode } from "./container-node";
import { FlowToolbar } from "./flow-toolbar";
import { NodeLibraryDrawer } from "./node-library-drawer";
import type { NodeLibraryEntry } from "./node-library";
import { hydrateDefinition, serializeDefinition, type PersistedDefinition } from "./definition";
import { autoLayout } from "./auto-layout";
import { NodeConfigDialog, type NodeMeta } from "./node-config-dialog";
import { NodeRunInspector } from "./node-run-inspector";
import { WorkflowIdProvider } from "./workflow-context";
import { useFlowShortcuts } from "~/hooks/use-flow-shortcuts";
import { useFlowStore } from "~/stores/flow";
import { useExecutionStore } from "~/stores/execution";
import { pinnedDataApi, usePinnedData } from "~/stores/pinned-data";
import { Button } from "~/components/ui/button";

// Campos de `node.data` que pertencem ao editor, não ao engine — não
// devem aparecer no dialog de config nem ser sobrescritos por ele.
const EDITOR_META_KEYS = new Set(["title", "description", "variant", "nodeType"]);

export type WorkflowCanvasHandle = {
  /** Snapshot do canvas no shape persistido — chamado no save. */
  getDefinition: () => PersistedDefinition;
};

type WorkflowCanvasProps = {
  /** ID do workflow — usado pra namespacing do pinned-data e do inspector. */
  workflowId: string;
  /** Definition cru vindo do backend; ignorado depois da primeira hidratação. */
  initialDefinition: unknown;
  /** Disparado em qualquer mudança que altere o que será salvo. */
  onDirtyChange?: () => void;
};

// ── id generator ─────────────────────────────────────────────────────────
// Garante unicidade entre canvases sem persistir contador. Usa crypto.randomUUID
// quando disponível pra evitar choque com ids do backend (que também são UUIDs).
function nextNodeId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `n-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function Flow({ workflowId, initialDefinition, onDirtyChange }: WorkflowCanvasProps) {
  const nodeTypes = useMemo(
    () => ({
      workflow: WorkflowNodeComponent,
      sticky: StickyNoteNodeComponent,
      container: ContainerNodeComponent,
    }),
    [],
  );

  // Hidrata uma vez por definition recebida. Trocar de workflow remonta a rota
  // (key={id} no parent), então não precisa re-hidratar in-place.
  const hydrated = useMemo(() => hydrateDefinition(initialDefinition), [initialDefinition]);
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>(hydrated.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(hydrated.edges);

  // ── Dirty tracking ─────────────────────────────────────────────────────
  // Hidratação inicial não conta como dirty; mudanças subsequentes contam.
  const hydratedAtRef = useRef(false);
  useEffect(() => {
    hydratedAtRef.current = true;
  }, []);
  useEffect(() => {
    if (!hydratedAtRef.current) return;
    onDirtyChange?.();
    // Disparado em toda mudança de nodes/edges — granularidade fina demais
    // não compensa; o save dedupa via debounce no parent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, edges]);

  // Toggles de UI vêm do Zustand — assinaturas finas evitam re-render do canvas
  // quando outros pedaços da toolbar mudam.
  const isPanMode = useFlowStore((s) => s.tool === "pan");
  const locked = useFlowStore((s) => s.locked);
  const miniMapVisible = useFlowStore((s) => s.miniMapVisible);
  const libraryOpen = useFlowStore((s) => s.libraryOpen);
  const backgroundVariant = useFlowStore((s) => s.backgroundVariant);
  const setLibraryOpen = useFlowStore((s) => s.setLibraryOpen);

  const { screenToFlowPosition, fitView } = useReactFlow();

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
      zIndex: -1,
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

  // ── Auto-organizar ─────────────────────────────────────────────────────
  // Disparado pelo botão Sparkles na toolbar (e pelo atalho Shift+A). Aplica
  // o layout em camadas + higiene das edges em uma única transação de state,
  // depois ajusta o viewport pra mostrar tudo. Visuais (sticky/container)
  // são preservados na posição original.
  const handleAutoLayout = useCallback(() => {
    const result = autoLayout(nodes, edges);
    setNodes(result.nodes);
    setEdges(result.edges);
    // requestAnimationFrame garante que o React Flow já mediu o novo layout
    // antes do fitView; sem isso o cálculo de bounds usa as posições antigas.
    requestAnimationFrame(() => {
      fitView({ duration: 500, padding: 0.2 });
    });
  }, [nodes, edges, setNodes, setEdges, fitView]);

  useFlowShortcuts({
    onAddSticky: handleAddSticky,
    onAddContainer: handleAddContainer,
    onAutoLayout: handleAutoLayout,
  });

  // ── Dialog de configuração do nó (double-click) ────────────────────────
  const [configState, setConfigState] = useState<{
    nodeId: string;
    nodeType: string;
    /** Meta editor-only (só nós executáveis). Visuais ficam com undefined. */
    meta?: NodeMeta;
    values: Record<string, unknown>;
  } | null>(null);

  // ── Inspector de execução (click único quando há run focado) ───────────
  // Abre o sheet à direita pra ver input/output do nó no run atual. O state
  // do sheet vive aqui porque depende de `nodeId` e da seleção do canvas.
  const [inspectorNodeId, setInspectorNodeId] = useState<string | null>(null);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const focusedRunId = useExecutionStore((s) => s.focusedRunId);
  const stepsByNodeId = useExecutionStore((s) => s.stepsByNodeId);
  const pinnedMap = usePinnedData(workflowId);
  const isPinned = inspectorNodeId !== null && inspectorNodeId in pinnedMap;

  const handleTogglePin = useCallback(() => {
    if (!inspectorNodeId) return;
    if (isPinned) {
      pinnedDataApi.remove(workflowId, inspectorNodeId);
      return;
    }
    const step = stepsByNodeId[inspectorNodeId];
    if (!step?.output) return;
    pinnedDataApi.set(workflowId, inspectorNodeId, step.output);
  }, [inspectorNodeId, isPinned, workflowId, stepsByNodeId]);

  // Label exibido no inspector — tenta o title customizado, senão o nodeType.
  const inspectorLabel = useMemo(() => {
    if (!inspectorNodeId) return undefined;
    const node = nodes.find((n) => n.id === inspectorNodeId);
    const d = (node?.data ?? {}) as { title?: unknown; nodeType?: unknown };
    if (typeof d.title === "string" && d.title.trim()) return d.title;
    if (typeof d.nodeType === "string") return d.nodeType;
    return undefined;
  }, [inspectorNodeId, nodes]);

  const handleNodeClick = useCallback(
    (_e: React.MouseEvent, node: Node) => {
      // Sem run focado, click é apenas seleção (React Flow já cuida). Só
      // abrimos o inspector se houver dado pra inspecionar — evita "abre
      // sheet vazio" toda vez que clicar num nó na composição inicial.
      if (!focusedRunId) return;
      if (!stepsByNodeId[node.id]) return;
      setInspectorNodeId(node.id);
      setInspectorOpen(true);
    },
    [focusedRunId, stepsByNodeId],
  );

  const handleNodeDoubleClick = useCallback((_e: React.MouseEvent, node: Node) => {
    // Nó executável (React Flow type = "workflow") → engine type vem de data.nodeType.
    // Visuais (sticky/container) → mapeia pro tipo do engine equivalente.
    let engineType: string | undefined;
    let meta: NodeMeta | undefined;
    if (node.type === "workflow") {
      const d = (node.data ?? {}) as Record<string, unknown>;
      engineType = typeof d.nodeType === "string" ? d.nodeType : undefined;
      meta = {
        title: typeof d.title === "string" ? d.title : undefined,
        description: typeof d.description === "string" ? d.description : undefined,
      };
    } else if (node.type === "sticky") {
      engineType = "sticky_note";
    } else if (node.type === "container") {
      engineType = "container";
    }
    if (!engineType) return;

    const dataObj = (node.data ?? {}) as Record<string, unknown>;
    const values: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(dataObj)) {
      if (EDITOR_META_KEYS.has(k)) continue;
      values[k] = v;
    }
    setConfigState({ nodeId: node.id, nodeType: engineType, meta, values });
  }, []);

  const handleConfigSave = useCallback(
    (next: Record<string, unknown>, nextMeta?: NodeMeta) => {
      if (!configState) return;
      const id = configState.nodeId;
      setNodes((prev) =>
        prev.map((n) => {
          if (n.id !== id) return n;
          // Preserva variant/nodeType (não editáveis) e aplica title/description
          // do dialog quando houver — vazio remove pra cair no default do tipo.
          const current = (n.data ?? {}) as Record<string, unknown>;
          const preserved: Record<string, unknown> = {};
          if ("variant" in current) preserved.variant = current.variant;
          if ("nodeType" in current) preserved.nodeType = current.nodeType;
          if (nextMeta) {
            const t = nextMeta.title?.trim();
            const d = nextMeta.description?.trim();
            if (t) preserved.title = t;
            if (d) preserved.description = d;
          } else {
            // Visual node: preserva title/description antigos se houver.
            if ("title" in current) preserved.title = current.title;
            if ("description" in current) preserved.description = current.description;
          }
          return { ...n, data: { ...preserved, ...next } };
        }),
      );
    },
    [configState, setNodes],
  );

  // ── Expose handle ──────────────────────────────────────────────────────
  // Lê estado vivo via closure no momento do save (não snapshotamos).
  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);
  nodesRef.current = nodes;
  edgesRef.current = edges;

  return (
    <WorkflowIdProvider value={workflowId}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={handleNodeClick}
        onNodeDoubleClick={handleNodeDoubleClick}
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
          <FlowToolbar
            onAddSticky={handleAddSticky}
            onAddContainer={handleAddContainer}
            onAutoLayout={handleAutoLayout}
          />
        </Panel>
        {nodes.length === 0 && (
          <Panel position="top-center" className="!top-24">
            <div className="pointer-events-auto flex flex-col items-center gap-3 rounded-lg border border-dashed border-border bg-card/90 px-6 py-5 text-center shadow-sm backdrop-blur">
              <p className="text-sm font-medium">Canvas vazio</p>
              <p className="max-w-xs text-xs text-muted-foreground">
                Adicione um nó para começar. Comece pelo <strong>Início</strong> na biblioteca.
              </p>
              <Button size="sm" onClick={() => setLibraryOpen(true)}>
                Abrir biblioteca
              </Button>
            </div>
          </Panel>
        )}
        <NodeLibraryDrawer
          open={libraryOpen}
          onOpenChange={setLibraryOpen}
          onSelect={handleAddFromLibrary}
        />
      </ReactFlow>
      <CanvasHandleBridge nodesRef={nodesRef} edgesRef={edgesRef} />
      <NodeConfigDialog
        open={configState !== null}
        onOpenChange={(o) => !o && setConfigState(null)}
        {...(configState?.nodeId !== undefined && { nodeId: configState.nodeId })}
        nodeType={configState?.nodeType}
        meta={configState?.meta}
        values={configState?.values ?? {}}
        onSave={handleConfigSave}
      />
      <NodeRunInspector
        open={inspectorOpen}
        onOpenChange={setInspectorOpen}
        nodeId={inspectorNodeId}
        {...(inspectorLabel !== undefined && { nodeLabel: inspectorLabel })}
        pinned={isPinned}
        onTogglePin={handleTogglePin}
      />
    </WorkflowIdProvider>
  );
}

// Bridge interno: o forwardRef vive fora do ReactFlowProvider; usamos um
// componente filho para "publicar" o handle via callback ref pra fora.
const handleRefSlot: { current: WorkflowCanvasHandle | null } = { current: null };

function CanvasHandleBridge({
  nodesRef,
  edgesRef,
}: {
  nodesRef: React.RefObject<Node[]>;
  edgesRef: React.RefObject<Edge[]>;
}) {
  useEffect(() => {
    handleRefSlot.current = {
      getDefinition: () => serializeDefinition(nodesRef.current ?? [], edgesRef.current ?? []),
    };
    return () => {
      handleRefSlot.current = null;
    };
  }, [nodesRef, edgesRef]);
  return null;
}

export const WorkflowCanvas = forwardRef<WorkflowCanvasHandle, WorkflowCanvasProps>(
  function WorkflowCanvas(props, ref) {
    useImperativeHandle(
      ref,
      () => ({
        getDefinition: () => handleRefSlot.current?.getDefinition() ?? { nodes: [], edges: [] },
      }),
      [],
    );
    return (
      <ReactFlowProvider>
        <Flow {...props} />
      </ReactFlowProvider>
    );
  },
);
