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
  BackgroundVariant,
  MarkerType,
  MiniMap,
  Panel,
  addEdge,
  useNodesState,
  useEdgesState,
  useReactFlow,
  type Connection,
  type DefaultEdgeOptions,
  type Edge,
  type Node,
  type OnNodeDrag,
} from "@xyflow/react";

import WorkflowNodeComponent, {
  WORKFLOW_NODE_ADD_NEXT_EVENT,
  type WorkflowNodeAddNextDetail,
} from "./workflow-node";
import { WorkflowEdge } from "./workflow-edge";
import StickyNoteNodeComponent, { type StickyNoteNode } from "./sticky-note-node";
import ContainerNodeComponent, { type ContainerNode } from "./container-node";

// nodeTypes/edgeTypes precisam de referência estável (React Flow re-monta tudo
// se a referência muda a cada render). Definidos no escopo do módulo — após
// TODOS os imports pra evitar TDZ com import statements.
const NODE_TYPES = {
  workflow: WorkflowNodeComponent,
  sticky: StickyNoteNodeComponent,
  container: ContainerNodeComponent,
} as const;
const EDGE_TYPES = { default: WorkflowEdge } as const;
import { FlowToolbar } from "./flow-toolbar";
import { FlowAlignBar } from "./flow-align-bar";
import { FlowContextMenu } from "./flow-context-menu";
import { NodeLibraryDrawer } from "./node-library-drawer";
import type { NodeLibraryEntry } from "./node-library";
import { NODE_ICON_MAP } from "./node-library";
import { hydrateDefinition, serializeDefinition, type PersistedDefinition } from "./definition";
import { autoLayout } from "./auto-layout";
import { NodeConfigDialog, type NodeMeta, type UpstreamInput } from "./node-config-dialog";
import { NodeRunInspector } from "./node-run-inspector";
import { WorkflowIdProvider } from "./workflow-context";
import { CollabCursors } from "./collab-cursors";
import { CommentPinsLayer } from "./comments/comment-pins-layer";
import type { CommentThread } from "~/hooks/use-workflow-comments";
import { useFlowShortcuts } from "~/hooks/use-flow-shortcuts";
import { useFlowStore } from "~/stores/flow";
import { useExecutionStore } from "~/stores/execution";
import { pinnedDataApi, usePinnedData } from "~/stores/pinned-data";
import { Button } from "~/components/ui/button";

import { cn } from "~/lib/utils";
import { FlowShortcutsHelp } from "./flow-shortcuts-help";
import { FlowSpotlight } from "./flow-spotlight";
import { SnapGuidesOverlay, type SnapGuide } from "./snap-guides-overlay";
import { FlowTransformPanel } from "./flow-transform-panel";

// Campos de `node.data` que pertencem ao editor, não ao engine — não
// devem aparecer no dialog de config nem ser sobrescritos por ele.
const EDITOR_META_KEYS = new Set(["title", "description", "variant", "nodeType", "iconColor"]);

const EDGE_GRADIENT_ID = "workflow-edge-gradient";
// Gradient animado — pico de brilho viaja da esquerda pra direita e volta.
const EDGE_FLOW_ID = "workflow-edge-flow";

// Mapa de classes Tailwind para hex — usado no minimap nodeColor.
const TAILWIND_COLOR_MAP: Record<string, string> = {
  "text-blue-500": "#3b82f6",
  "text-green-500": "#22c55e",
  "text-orange-500": "#f97316",
  "text-purple-500": "#a855f7",
  "text-red-500": "#ef4444",
  "text-yellow-500": "#eab308",
  "text-pink-500": "#ec4899",
  "text-indigo-500": "#6366f1",
  "text-cyan-500": "#06b6d4",
  "text-teal-500": "#14b8a6",
  "text-gray-500": "#6b7280",
  "text-slate-500": "#64748b",
  "text-emerald-500": "#10b981",
  "text-sky-500": "#0ea5e9",
  "text-amber-500": "#f59e0b",
  "text-violet-500": "#8b5cf6",
  "text-fuchsia-500": "#d946ef",
  "text-rose-500": "#f43f5e",
  "text-emerald-600": "#059669",
  "text-sky-600": "#0284c7",
  "text-amber-600": "#d97706",
  "text-rose-600": "#dc2626",
  "text-violet-600": "#7c3aed",
  "text-fuchsia-600": "#c026d3",
};

function tailwindToHex(cls: string): string {
  return TAILWIND_COLOR_MAP[cls] ?? "#94a3b8";
}

function EdgeGradientDefs({
  from,
  to,
  animated,
  direction,
}: {
  from: string;
  to: string;
  animated: boolean;
  direction: "alternate" | "forward" | "backward";
}) {
  // SMIL `<animateTransform>`:
  //  - alternate: vai e volta, ease in-out (continua sendo o efeito histórico).
  //  - forward: -1 → 1 linear, sem retorno; descontinuidade mascarada pelas
  //    paradas de opacidade 0.08 nas bordas (pico "desaparece" antes do wrap).
  //  - backward: 1 → -1 linear.
  const animProps =
    direction === "alternate"
      ? {
          values: "-1,0; 1,0; -1,0",
          dur: "2.4s",
          calcMode: "spline" as const,
          keyTimes: "0; 0.5; 1",
          keySplines: "0.4 0 0.6 1; 0.4 0 0.6 1",
        }
      : direction === "forward"
        ? {
            values: "-1,0; 1,0",
            dur: "1.6s",
            calcMode: "linear" as const,
          }
        : {
            values: "1,0; -1,0",
            dur: "1.6s",
            calcMode: "linear" as const,
          };

  return (
    <svg
      width={0}
      height={0}
      aria-hidden
      style={{ position: "absolute", width: 0, height: 0, overflow: "hidden" }}
    >
      <defs>
        {/* Gradient estático — usado quando só gradient (sem animação) */}
        <linearGradient id={EDGE_GRADIENT_ID} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={from} />
          <stop offset="100%" stopColor={to} />
        </linearGradient>

        {/* Gradient com pico viajante — gradient + animação ativa */}
        {animated && (
          <linearGradient id={EDGE_FLOW_ID} x1="0" y1="0" x2="1" y2="0">
            {/* "escuro" nas bordas, "brilhante" no centro — o pico viaja */}
            <stop offset="0%"   stopColor={from} stopOpacity="0.08" />
            <stop offset="30%"  stopColor={from} stopOpacity="0.55" />
            <stop offset="50%"  stopColor={to}   stopOpacity="1" />
            <stop offset="70%"  stopColor={to}   stopOpacity="0.55" />
            <stop offset="100%" stopColor={to}   stopOpacity="0.08" />
            <animateTransform
              attributeName="gradientTransform"
              type="translate"
              repeatCount="indefinite"
              {...animProps}
            />
          </linearGradient>
        )}
      </defs>
    </svg>
  );
}

export type WorkflowCanvasHandle = {
  /** Snapshot do canvas no shape persistido — chamado no save. */
  getDefinition: () => PersistedDefinition;
  /**
   * Aplica um estado vindo da colaboração remota sem marcar o canvas como
   * dirty. Os filhos React Flow re-renderizam, mas `onDirtyChange` e o
   * broadcast Yjs são suprimidos durante a aplicação.
   */
  applyRemoteDefinition: (def: PersistedDefinition) => void;
};

type WorkflowCanvasProps = {
  /** ID do workflow — usado pra namespacing do pinned-data e do inspector. */
  workflowId: string;
  /** Definition cru vindo do backend; ignorado depois da primeira hidratação. */
  initialDefinition: unknown;
  /** Disparado em qualquer mudança que altere o que será salvo. */
  onDirtyChange?: () => void;
  /** Lista de presenças remotas (cursores) renderizadas como overlay. */
  remoteCursors?: import("~/hooks/use-collaboration").RemotePresence[];
  /**
   * Map<nodeId, presence> dos nodes que outros usuários estão manipulando.
   * Quando setado, o canvas desativa drag/edição desse node localmente
   * (lock pessimista) e renderiza um overlay com o nome do dono.
   */
  nodeLocks?: Map<string, import("~/hooks/use-collaboration").RemotePresence>;
  /** Notificado em movimento do mouse sobre o pane, em coords de fluxo. */
  onCursorMove?: (cursor: { x: number; y: number }) => void;
  /** Notificado em mudança de seleção (primeiro nó selecionado ou undefined). */
  onSelectionChange?: (nodeId: string | undefined) => void;
  /** Disparado quando o usuário começa a arrastar um node (lock pessimista). */
  onNodeGrab?: (nodeId: string) => void;
  /** Disparado quando o usuário solta um node (release do lock). */
  onNodeRelease?: () => void;
  /** Notificado em pan/zoom. */
  onViewportChange?: (viewport: { x: number; y: number; zoom: number }) => void;
  /** Threads de comentário renderizadas como pins sobre o canvas. */
  commentThreads?: CommentThread[];
  /** ID da thread atualmente aberta — pin recebe destaque. */
  activeCommentThreadId?: string | null;
  /** Coords do pin "fantasma" enquanto o usuário compõe o primeiro comentário. */
  draftCommentPin?: { x: number; y: number } | null;
  /** Click no canvas em modo comentário: cria pin em coords de mundo. */
  onCreateCommentAt?: (coords: { x: number; y: number }) => void;
  /** Click em pin existente. */
  onOpenCommentThread?: (rootId: string) => void;
  /**
   * Modo "inspector sempre-ligado": qualquer click num nó abre o sheet
   * lateral mesmo sem run focado/step. Quando ele já está aberto, clicar
   * em outro nó troca o conteúdo (segue a seleção).
   */
  inspectorMode?: boolean;
};

// ── id generator ─────────────────────────────────────────────────────────
// Garante unicidade entre canvases sem persistir contador. Usa crypto.randomUUID
// quando disponível pra evitar choque com ids do backend (que também são UUIDs).
/**
 * Output de exemplo pra triggers — mostra a SHAPE esperada do payload quando
 * o workflow ainda não rodou. Permite o user montar templates downstream
 * (`{{ prev.body.X }}`) sem precisar disparar nada primeiro. Estilo "pin in
 * events from Webhook" do n8n, mas sem precisar de listener.
 */
/**
 * Mescla output real do run com o sample do tipo, preenchendo lacunas. Real
 * sempre vence em chaves conflitantes. Pra triggers, garante que body/headers/
 * query/params apareçam pro user arrastar mesmo quando o teste foi simples.
 */
function mergeOutputWithSample(
  real: Record<string, unknown> | null | undefined,
  sample: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!sample) return real ?? undefined;
  if (!real || typeof real !== "object") return sample;
  const out: Record<string, unknown> = { ...sample };
  for (const [k, v] of Object.entries(real)) {
    const existing = out[k];
    if (
      v &&
      typeof v === "object" &&
      !Array.isArray(v) &&
      existing &&
      typeof existing === "object" &&
      !Array.isArray(existing)
    ) {
      // Recursivo: real fields supplement sample sem perder estrutura.
      out[k] = mergeOutputWithSample(
        v as Record<string, unknown>,
        existing as Record<string, unknown>,
      );
    } else {
      out[k] = v;
    }
  }
  return out;
}

function defaultSampleOutput(nodeType: string | undefined): Record<string, unknown> | undefined {
  if (nodeType === "webhook_trigger") {
    return {
      headers: {
        "content-type": "application/json",
        "user-agent": "Mozilla/5.0",
        host: "localhost:3010",
      },
      query: { example: "value" },
      params: {},
      body: {
        hello: "world",
        name: "exemplo",
        items: [1, 2, 3],
        nested: { foo: "bar" },
      },
      __webhook: {
        method: "POST",
        triggerId: "00000000-0000-0000-0000-000000000000",
        receivedAt: "2026-01-01T00:00:00.000Z",
      },
    };
  }
  if (nodeType === "manual_trigger" || nodeType === "start") {
    return { hello: "world", note: "Edite ou pine pra customizar." };
  }
  if (nodeType === "schedule_trigger" || nodeType === "interval_trigger") {
    return {
      firedAt: "2026-01-01T00:00:00.000Z",
      cron: "0 * * * *",
    };
  }
  return undefined;
}

function nextNodeId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `n-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function formatTime(ms: number): string {
  const d = new Date(ms);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function Flow({
  workflowId,
  initialDefinition,
  onDirtyChange,
  remoteCursors,
  nodeLocks,
  onCursorMove,
  onSelectionChange,
  onNodeGrab,
  onNodeRelease,
  onViewportChange,
  commentThreads,
  activeCommentThreadId,
  draftCommentPin,
  onCreateCommentAt,
  onOpenCommentThread,
  inspectorMode = false,
}: WorkflowCanvasProps) {
  // Referencias estáveis vêm do escopo do módulo (NODE_TYPES/EDGE_TYPES).

  // Hidrata uma vez por definition recebida. Trocar de workflow remonta a rota
  // (key={id} no parent), então não precisa re-hidratar in-place.
  const hydrated = useMemo(() => hydrateDefinition(initialDefinition), [initialDefinition]);
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>(hydrated.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(hydrated.edges);

  // ── Dirty tracking ─────────────────────────────────────────────────────
  // Hidratação inicial não conta como dirty; mudanças subsequentes contam.
  const hydratedAtRef = useRef(false);
  // Marca o canvas como "aplicando estado remoto" — usado para suprimir
  // tanto o dirty quanto o broadcast Yjs de eco (loop).
  const isApplyingRemoteRef = useRef(false);
  useEffect(() => {
    hydratedAtRef.current = true;
  }, []);
  useEffect(() => {
    if (!hydratedAtRef.current) return;
    if (isApplyingRemoteRef.current) return;
    onDirtyChange?.();
    // Disparado em toda mudança de nodes/edges — granularidade fina demais
    // não compensa; o save dedupa via debounce no parent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, edges]);

  // ── Histórico de undo/redo ──────────────────────────────────────────────
  // Stack de snapshots {nodes, edges}. Pointer aponta para o estado atual.
  // `isHistoryOp` evita que a restauração de um snapshot empurre um novo.
  const historyStack = useRef<{ nodes: Node[]; edges: Edge[] }[]>([
    { nodes: hydrated.nodes, edges: hydrated.edges },
  ]);
  const historyPointer = useRef(0);
  const isHistoryOp = useRef(false);
  const historyTimestamps = useRef<number[]>([Date.now()]);

  // Reactive metadata for history panel
  const [historyMeta, setHistoryMeta] = useState<{ pointer: number; length: number }>({
    pointer: 0,
    length: 1,
  });

  useEffect(() => {
    if (!hydratedAtRef.current) return;
    if (isHistoryOp.current) return;
    // Limita o stack em 100 snapshots e descarta futuros ao gravar novo estado.
    const snap = { nodes, edges };
    historyStack.current = historyStack.current.slice(0, historyPointer.current + 1);
    historyTimestamps.current = historyTimestamps.current.slice(0, historyPointer.current + 1);
    historyStack.current.push(snap);
    historyTimestamps.current.push(Date.now());
    if (historyStack.current.length > 100) {
      historyStack.current.shift();
      historyTimestamps.current.shift();
    }
    historyPointer.current = historyStack.current.length - 1;
    setHistoryMeta({ pointer: historyPointer.current, length: historyStack.current.length });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, edges]);

  const undo = useCallback(() => {
    if (historyPointer.current <= 0) return;
    historyPointer.current -= 1;
    const snap = historyStack.current[historyPointer.current];
    isHistoryOp.current = true;
    setNodes(snap.nodes);
    setEdges(snap.edges);
    setHistoryMeta({ pointer: historyPointer.current, length: historyStack.current.length });
    requestAnimationFrame(() => { isHistoryOp.current = false; });
  }, [setNodes, setEdges]);

  const redo = useCallback(() => {
    if (historyPointer.current >= historyStack.current.length - 1) return;
    historyPointer.current += 1;
    const snap = historyStack.current[historyPointer.current];
    isHistoryOp.current = true;
    setNodes(snap.nodes);
    setEdges(snap.edges);
    setHistoryMeta({ pointer: historyPointer.current, length: historyStack.current.length });
    requestAnimationFrame(() => { isHistoryOp.current = false; });
  }, [setNodes, setEdges]);

  const jumpToHistory = useCallback(
    (index: number) => {
      if (index < 0 || index >= historyStack.current.length) return;
      historyPointer.current = index;
      const snap = historyStack.current[index];
      isHistoryOp.current = true;
      setNodes(snap.nodes);
      setEdges(snap.edges);
      setHistoryMeta({ pointer: index, length: historyStack.current.length });
      requestAnimationFrame(() => { isHistoryOp.current = false; });
    },
    [setNodes, setEdges],
  );

  // Toggles de UI vêm do Zustand — assinaturas finas evitam re-render do canvas
  // quando outros pedaços da toolbar mudam.
  const isPanMode = useFlowStore((s) => s.tool === "pan");
  const isCommentMode = useFlowStore((s) => s.tool === "comment");
  const setTool = useFlowStore((s) => s.setTool);
  const locked = useFlowStore((s) => s.locked);
  const miniMapVisible = useFlowStore((s) => s.miniMapVisible);
  const libraryOpen = useFlowStore((s) => s.libraryOpen);
  const backgroundVariant = useFlowStore((s) => s.backgroundVariant);
  const edgeStyle = useFlowStore((s) => s.edgeStyle);
  const presentationMode = useFlowStore((s) => s.presentationMode);
  const historyVisible = useFlowStore((s) => s.historyVisible);
  const togglePresentationMode = useFlowStore((s) => s.togglePresentationMode);
  const setLibraryOpen = useFlowStore((s) => s.setLibraryOpen);

  const { screenToFlowPosition, fitView, getNodes } = useReactFlow();

  // Status de execução por nodeId — usado pra colorir edges em runtime.
  // Lemos aqui (antes de `styledEdges`) pra evitar TDZ.
  const focusedRunIdForEdges = useExecutionStore((s) => s.focusedRunId);
  const stepsByNodeIdForEdges = useExecutionStore((s) => s.stepsByNodeId);

  // gradient+animated → pico viajante (SVG animateTransform); gradient sem animação →
  // gradient estático; sem gradient → cor sólida.
  const strokeRef = edgeStyle.gradient
    ? edgeStyle.animated
      ? `url(#${EDGE_FLOW_ID})`
      : `url(#${EDGE_GRADIENT_ID})`
    : edgeStyle.color;

  // Animação nativa do React Flow ("moving dashes") só faz sentido com dashed.
  const rfAnimated = edgeStyle.animated && edgeStyle.dashed;
  // Pulse de opacidade: animated + sólida + sem gradient (o gradient já tem sua animação SVG).
  const pulseClass =
    edgeStyle.animated && !edgeStyle.dashed && !edgeStyle.gradient ? "wf-edge-pulse" : undefined;
  // Glow inline no stroke quando gradient + animated — extra "maneiro".
  const glowFilter =
    edgeStyle.gradient && edgeStyle.animated
      ? `drop-shadow(0 0 ${edgeStyle.thickness + 1}px ${edgeStyle.colorEnd}99)`
      : undefined;

  const defaultEdgeOptions = useMemo<DefaultEdgeOptions>(
    () => ({
      type: edgeStyle.type,
      animated: rfAnimated,
      ...(pulseClass ? { className: pulseClass } : {}),
      style: {
        stroke: strokeRef,
        strokeWidth: edgeStyle.thickness,
        strokeDasharray: edgeStyle.dashed ? "6 4" : "none",
        ...(glowFilter ? { filter: glowFilter } : {}),
      },
      ...(edgeStyle.arrow
        ? { markerEnd: { type: MarkerType.ArrowClosed, color: edgeStyle.colorEnd } }
        : {}),
      // Defaults — sobreescritos por edge via `buildEdgeLabelStyle`.
      labelStyle: { fontSize: 11, fontWeight: 600, fontFamily: "inherit", fill: "#ffffff" },
      labelBgStyle: { fill: "#475569", fillOpacity: 1 },
      labelBgPadding: [6, 3] as [number, number],
      labelBgBorderRadius: 6,
    }),
    [edgeStyle, strokeRef, rfAnimated, pulseClass, glowFilter],
  );

  // Status por edge — agora considera qual ramo o source TOMOU.
  // - source running → todas edges azul (não sabemos qual será tomada)
  // - source failed → todas edges vermelho
  // - source success:
  //   - if/filter (output.result): só edge com label "true"/"false" correto vira verde
  //   - switch (output.matched): só edge com label igual ao `matched` vira verde
  //   - outros: todas as edges saindo são verde (fluxo linear)
  //   - Edges não tomadas → "skipped" (cinza apagado)
  // "success-false" = edge tomada com label "false" (IF/Filter avaliou false).
  // Renderizada em rose pra distinguir visualmente do "success-true" (emerald),
  // mas semanticamente é uma execução bem-sucedida do ramo false.
  type EdgeStatus = "running" | "success" | "success-false" | "failed" | "skipped" | "idle";
  const edgeStatusMap = useMemo(() => {
    const m = new Map<string, EdgeStatus>();
    if (!focusedRunIdForEdges) return m;

    // Index de nodes pra olhar o tipo do source rapidamente
    const nodeTypeById = new Map<string, string>();
    for (const n of nodes) {
      const t = (n.data as { nodeType?: string })?.nodeType;
      if (typeof t === "string") nodeTypeById.set(n.id, t);
    }

    const edgeKey = (e: Edge) => `${e.source}::${e.target}::${e.label ?? ""}`;

    for (const e of edges) {
      const step = stepsByNodeIdForEdges[e.source];
      if (!step?.status) {
        m.set(edgeKey(e), "idle");
        continue;
      }
      if (step.status === "running") {
        m.set(edgeKey(e), "running");
        continue;
      }
      if (step.status === "failed") {
        m.set(edgeKey(e), "failed");
        continue;
      }
      // success — decide taken vs skipped baseado no tipo do source
      const sourceType = nodeTypeById.get(e.source);
      const output = step.output as Record<string, unknown> | null;
      let isTaken = true;

      let takenStatus: EdgeStatus = "success";
      if ((sourceType === "if" || sourceType === "filter") && output) {
        const out = output as { result?: unknown; _if?: { result?: unknown } };
        const result =
          out.result !== undefined ? out.result : out._if?.result;
        const expectedLabel = result ? "true" : "false";
        // Estratégia: tenta achar edge com label exato. Se não existe,
        // espelha o engine (`pickLiveEdge`): cai no PRIMEIRO edge sem label
        // como fallback — assim edges legados (sem dual-handle) ainda
        // colorem corretamente.
        const siblings = edges.filter((o) => o.source === e.source);
        const exactSibling = siblings.find((o) => o.label === expectedLabel);
        if (exactSibling) {
          isTaken = e.id === exactSibling.id;
        } else {
          // Primeiro edge sem label vira o "tomado".
          const fallback = siblings.find((o) => !o.label);
          isTaken = !!fallback && e.id === fallback.id;
        }
        // Se tomado E o resultado foi false, marca semanticamente como
        // "success-false" pra colorir em rose (mesmo se o label estiver vazio).
        if (isTaken && !result) takenStatus = "success-false";
      } else if (sourceType === "switch" && output) {
        const matched = typeof output.matched === "string" ? output.matched : null;
        const siblings = edges.filter((o) => o.source === e.source);
        const exactSibling = matched !== null ? siblings.find((o) => o.label === matched) : null;
        if (exactSibling) {
          isTaken = e.id === exactSibling.id;
        } else {
          const fallback = siblings.find((o) => !o.label);
          isTaken = !!fallback && e.id === fallback.id;
        }
      }

      m.set(edgeKey(e), isTaken ? takenStatus : "skipped");
    }
    return m;
  }, [focusedRunIdForEdges, stepsByNodeIdForEdges, edges, nodes]);

  const styledEdges = useMemo<Edge[]>(
    () =>
      edges.map((e) => {
        const edgeKey = `${e.source}::${e.target}::${e.label ?? ""}`;
        const edgeStatus = edgeStatusMap.get(edgeKey);
        // Estilo n8n: edge verde fluindo no caminho tomado, cinza apagado no
        // caminho não tomado (skipped), azul pulsando durante, vermelho ao falhar.
        const runtimeStroke =
          edgeStatus === "success"
            ? "#10b981" // emerald — ramo true / fluxo linear taken
            : edgeStatus === "success-false"
              ? "#f43f5e" // rose — ramo false taken (sucesso, mas distintivo)
              : edgeStatus === "running"
                ? "#0ea5e9"
                : edgeStatus === "failed"
                  ? "#f43f5e"
                  : edgeStatus === "skipped"
                    ? "#94a3b8"
                    : null;
        const runtimeAnimated =
          edgeStatus === "success"
          || edgeStatus === "success-false"
          || edgeStatus === "running";
        const stroke = runtimeStroke ?? strokeRef;
        // Skipped: opacity reduzida pra "apagar" visualmente o ramo não tomado
        const opacity = edgeStatus === "skipped" ? 0.35 : 1;
        return {
          ...e,
          type: edgeStyle.type,
          animated: runtimeAnimated || rfAnimated,
          className: cn(e.className, pulseClass),
          style: {
            ...(e.style ?? {}),
            stroke,
            strokeWidth: runtimeStroke ? edgeStyle.thickness + 0.5 : edgeStyle.thickness,
            strokeDasharray:
              edgeStatus === "skipped"
                ? "4 4"
                : edgeStyle.dashed && !runtimeStroke
                  ? "6 4"
                  : "none",
            opacity,
            ...(glowFilter && !runtimeStroke ? { filter: glowFilter } : {}),
          },
          markerEnd: edgeStyle.arrow
            ? {
                type: MarkerType.ArrowClosed,
                color: runtimeStroke ?? (edgeStyle.gradient ? edgeStyle.colorEnd : edgeStyle.color),
              }
            : undefined,
          // Labels n8n-style: fundo colorido por semântica + texto branco bold.
          // true/false/0/1 ganham cores específicas pra leitura imediata no canvas.
          ...buildEdgeLabelStyle(typeof e.label === "string" ? e.label : undefined),
        };
      }),
    [edges, edgeStyle, strokeRef, rfAnimated, pulseClass, glowFilter, edgeStatusMap],
  );

  // Helper: estilo do label baseado no valor (true/false/0/1/outros).
  // Definido inline pra evitar shadowing — `useMemo` acima já depende disso
  // indiretamente via `edges`.

  const onConnect = useCallback(
    (params: Connection) => {
      // Quando arrastam do handle "true"/"false" do IF/Filter, o sourceHandle
      // vira o label da aresta — assim o engine roteia o run pelo ramo certo.
      const label =
        params.sourceHandle === "true" || params.sourceHandle === "false"
          ? params.sourceHandle
          : undefined;
      setEdges((eds) =>
        addEdge(
          {
            ...params,
            animated: edgeStyle.animated,
            ...(label && { label, data: { label } }),
          },
          eds,
        ),
      );
    },
    [setEdges, edgeStyle.animated],
  );

  // ── Edge double-click — edit label ─────────────────────────────────────
  const onEdgeDoubleClick = useCallback(
    (_evt: React.MouseEvent, edge: Edge) => {
      const label = window.prompt("Rótulo da conexão:", String(edge.label ?? ""));
      if (label === null) return; // cancelled
      setEdges((prev) =>
        prev.map((e) => (e.id === edge.id ? { ...e, label: label.trim() || undefined } : e)),
      );
    },
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

  // Quando o user clica no "+" do handle de algum nó, guardamos a origem aqui
  // (nodeId + handleId opcional). Ao escolher um nó na biblioteca, criamos
  // o nó + aresta do source → novo nó com label do handle (pra IF/Filter).
  const pendingSourceRef = useRef<{ nodeId: string; handleId?: string } | null>(null);

  const handleAddFromLibrary = useCallback(
    (entry: NodeLibraryEntry) => {
      const id = nextNodeId();
      const pending = pendingSourceRef.current;
      pendingSourceRef.current = null;
      const sourceId = pending?.nodeId;
      const sourceHandle = pending?.handleId;
      // Posiciona à direita do source quando temos origem. Sem origem (modo
      // livre), no centro do viewport.
      let pos = centerFlowPosition();
      if (sourceId) {
        const src = nodesRef.current.find((n) => n.id === sourceId);
        if (src) {
          // Offset Y baseado no handle: true sobe, false desce, default centro.
          const yOff =
            sourceHandle === "true" ? -40 : sourceHandle === "false" ? 40 : 0;
          pos = { x: (src.position?.x ?? 0) + 280, y: (src.position?.y ?? 0) + yOff };
        }
      }
      const node = entry.build({ x: pos.x - 110, y: pos.y - 40 }, id);
      setNodes((prev) => [...prev, node]);
      if (sourceId) {
        const label =
          sourceHandle === "true" || sourceHandle === "false" ? sourceHandle : undefined;
        setEdges((prev) => [
          ...prev,
          {
            id: `e${Date.now()}-${sourceId}-${id}`,
            source: sourceId,
            target: id,
            ...(sourceHandle && { sourceHandle }),
            ...(label && { label, data: { label } }),
            animated: true,
          } as Edge,
        ]);
      }
    },
    [setNodes, setEdges, centerFlowPosition],
  );

  useEffect(() => {
    function onAddNext(e: Event) {
      const evt = e as CustomEvent<WorkflowNodeAddNextDetail>;
      const sourceId = evt.detail?.nodeId;
      if (!sourceId) return;
      pendingSourceRef.current = { nodeId: sourceId, handleId: evt.detail?.handleId };
      setLibraryOpen(true);
    }
    window.addEventListener(WORKFLOW_NODE_ADD_NEXT_EVENT, onAddNext);
    return () => window.removeEventListener(WORKFLOW_NODE_ADD_NEXT_EVENT, onAddNext);
  }, [setLibraryOpen]);

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

  // ── Lock individual nodes ──────────────────────────────────────────────
  const toggleNodeLock = useCallback(() => {
    const selected = getNodes().filter((n) => n.selected);
    if (selected.length === 0) return;
    setNodes((prev) =>
      prev.map((n) => {
        if (!n.selected) return n;
        const nodeData = n.data as Record<string, unknown>;
        const nodeLocked = !nodeData.locked;
        return { ...n, draggable: !nodeLocked, selectable: true, data: { ...n.data, locked: nodeLocked } };
      }),
    );
  }, [getNodes, setNodes]);

  const shortcuts = useFlowShortcuts({
    onAddSticky: handleAddSticky,
    onAddContainer: handleAddContainer,
    onAutoLayout: handleAutoLayout,
    onUndo: undo,
    onRedo: redo,
    onTogglePresentation: togglePresentationMode,
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
      // Sticky/container/comment não inspecionam — só nós do engine.
      if (node.type && node.type !== "workflow") return;
      // Modo "inspector sempre-ligado" — abre mesmo sem run focado/step.
      // O `NodeRunInspector` já mostra empty state elegante quando não há dado.
      if (inspectorMode) {
        setInspectorNodeId(node.id);
        setInspectorOpen(true);
        return;
      }
      // Modo normal: só abre se tiver dado pra mostrar — evita sheet vazio
      // durante composição inicial.
      if (!focusedRunId) return;
      if (!stepsByNodeId[node.id]) return;
      setInspectorNodeId(node.id);
      setInspectorOpen(true);
    },
    [focusedRunId, stepsByNodeId, inspectorMode],
  );

  const handlePaneClick = useCallback(
    (event: React.MouseEvent) => {
      if (!isCommentMode || !onCreateCommentAt) return;
      const pos = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      onCreateCommentAt(pos);
      setTool("select");
    },
    [isCommentMode, onCreateCommentAt, screenToFlowPosition, setTool],
  );

  const handlePaneMouseMove = useCallback(
    (event: React.MouseEvent) => {
      if (!onCursorMove) return;
      const pos = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      onCursorMove(pos);
    },
    [onCursorMove, screenToFlowPosition],
  );

  const handleNodeMouseMove = useCallback(
    (event: React.MouseEvent) => {
      if (!onCursorMove) return;
      const pos = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      onCursorMove(pos);
    },
    [onCursorMove, screenToFlowPosition],
  );

  const handleSelectionChange = useCallback(
    (sel: { nodes: Node[] }) => {
      if (!onSelectionChange) return;
      onSelectionChange(sel.nodes[0]?.id);
    },
    [onSelectionChange],
  );

  const handleMove = useCallback(
    (_e: unknown, viewport: { x: number; y: number; zoom: number }) => {
      onViewportChange?.(viewport);
    },
    [onViewportChange],
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
        iconColor: typeof d.iconColor === "string" ? d.iconColor : undefined,
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
            if (nextMeta.iconColor) preserved.iconColor = nextMeta.iconColor;
          } else {
            // Visual node: preserva title/description antigos se houver.
            if ("title" in current) preserved.title = current.title;
            if ("description" in current) preserved.description = current.description;
            if ("iconColor" in current) preserved.iconColor = current.iconColor;
          }
          return { ...n, data: { ...preserved, ...next } };
        }),
      );
    },
    [configState, setNodes],
  );

  // ── Snap guides ────────────────────────────────────────────────────────
  const [snapGuides, setSnapGuides] = useState<SnapGuide[]>([]);

  // Snap-to-grid: config persistente (toggle no canvas) + Shift como override
  // momentâneo Figma-like (inverte o estado enquanto segurado).
  const snapToGridSetting = useFlowStore((s) => s.snapToGrid);
  const [shiftHeld, setShiftHeld] = useState(false);
  useEffect(() => {
    function onDown(e: KeyboardEvent) {
      if (e.key === "Shift") setShiftHeld(true);
    }
    function onUp(e: KeyboardEvent) {
      if (e.key === "Shift") setShiftHeld(false);
    }
    function onBlur() {
      setShiftHeld(false);
    }
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
      window.removeEventListener("blur", onBlur);
    };
  }, []);
  // XOR: shift inverte o setting. Setting on + shift = off (free move momentâneo).
  // Setting off + shift = on (snap momentâneo).
  const gridSnapMode = snapToGridSetting !== shiftHeld;

  const SNAP_THRESHOLD = 6;

  const getNodeBounds = (node: Node) => {
    const m = node.measured as { width?: number; height?: number } | undefined;
    const w = m?.width ?? (node as { width?: number }).width ?? 150;
    const h = m?.height ?? (node as { height?: number }).height ?? 40;
    const x = node.position.x;
    const y = node.position.y;
    return { x, y, w, h };
  };

  const handleNodeDrag: OnNodeDrag = useCallback(
    (_event: React.MouseEvent, draggedNode: Node) => {
      // No modo grid, esconde as guides de alinhamento — o snap visual já
      // vem do <Background> dotted/lines do ReactFlow.
      if (gridSnapMode) {
        setSnapGuides([]);
        return;
      }
      const allNodes = nodes;
      const others = allNodes.filter((n) => n.id !== draggedNode.id);
      const guides: SnapGuide[] = [];
      const db = getNodeBounds(draggedNode);
      const dragPoints = {
        vLines: [db.x, db.x + db.w / 2, db.x + db.w],
        hLines: [db.y, db.y + db.h / 2, db.y + db.h],
      };
      for (const other of others) {
        const ob = getNodeBounds(other);
        const otherVLines = [ob.x, ob.x + ob.w / 2, ob.x + ob.w];
        const otherHLines = [ob.y, ob.y + ob.h / 2, ob.y + ob.h];
        for (const dp of dragPoints.vLines) {
          for (const op of otherVLines) {
            if (Math.abs(dp - op) <= SNAP_THRESHOLD) {
              guides.push({ type: "v", position: op });
            }
          }
        }
        for (const dp of dragPoints.hLines) {
          for (const op of otherHLines) {
            if (Math.abs(dp - op) <= SNAP_THRESHOLD) {
              guides.push({ type: "h", position: op });
            }
          }
        }
      }
      // Deduplicate
      const seen = new Set<string>();
      const deduped = guides.filter((g) => {
        const key = `${g.type}:${g.position}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      setSnapGuides(deduped);
    },
    [nodes, gridSnapMode],
  );

  const handleNodeDragStop = useCallback(() => {
    setSnapGuides([]);
    onNodeRelease?.();
  }, [onNodeRelease]);

  const handleNodeDragStart = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      onNodeGrab?.(node.id);
    },
    [onNodeGrab],
  );

  // ── Minimap node color ─────────────────────────────────────────────────
  const minimapNodeColor = useCallback((node: Node): string => {
    if (node.type === "sticky") return "#fde68a";
    if (node.type === "container") return "#e2e8f0";
    const d = node.data as Record<string, unknown>;
    const nodeType = typeof d?.nodeType === "string" ? d.nodeType : undefined;
    const entry = nodeType ? NODE_ICON_MAP[nodeType] : undefined;
    return entry?.color ? tailwindToHex(entry.color) : "#94a3b8";
  }, []);

  // ── Expose handle ──────────────────────────────────────────────────────
  // Lê estado vivo via closure no momento do save (não snapshotamos).
  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);
  nodesRef.current = nodes;
  edgesRef.current = edges;

  return (
    <WorkflowIdProvider value={workflowId}>
      {edgeStyle.gradient && (
        <EdgeGradientDefs
          from={edgeStyle.color}
          to={edgeStyle.colorEnd}
          animated={edgeStyle.animated}
          direction={edgeStyle.flowDirection}
        />
      )}
      <FlowContextMenu
        onAddSticky={handleAddSticky}
        onAddContainer={handleAddContainer}
        onDuplicate={shortcuts.duplicate}
        onCopy={shortcuts.copy}
        onCut={shortcuts.cut}
        onPaste={shortcuts.paste}
        onDelete={shortcuts.deleteSelected}
        onSelectAll={shortcuts.selectAll}
        onAutoLayout={handleAutoLayout}
        onToggleLock={toggleNodeLock}
      >
        <ReactFlow
          nodes={
            nodeLocks && nodeLocks.size > 0
              ? nodes.map((n) =>
                  nodeLocks.has(n.id)
                    ? { ...n, draggable: false, selectable: false, className: "ring-2 ring-amber-400/80 ring-offset-2 ring-offset-background rounded-md" }
                    : n,
                )
              : nodes
          }
          edges={styledEdges}
          nodeTypes={NODE_TYPES}
          edgeTypes={EDGE_TYPES}
          defaultEdgeOptions={defaultEdgeOptions}
          connectionLineType={edgeStyle.type}
          connectionLineStyle={{ stroke: edgeStyle.color, strokeWidth: edgeStyle.thickness }}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={handleNodeClick}
          onNodeDoubleClick={handleNodeDoubleClick}
          onEdgeDoubleClick={onEdgeDoubleClick}
          onNodeDragStart={handleNodeDragStart}
          onNodeDrag={handleNodeDrag}
          onNodeDragStop={handleNodeDragStop}
          snapToGrid={gridSnapMode}
          snapGrid={[16, 16]}
          onPaneClick={handlePaneClick}
          onPaneMouseMove={handlePaneMouseMove}
          onNodeMouseMove={handleNodeMouseMove}
          onSelectionChange={handleSelectionChange}
          onMove={handleMove}
          fitView
          proOptions={{ hideAttribution: true }}
          className={cn("bg-background", isCommentMode && "cursor-crosshair")}
          panOnDrag={isPanMode ? true : [1, 2]}
          selectionOnDrag={!isPanMode && !locked}
          nodesDraggable={!locked}
          nodesConnectable={!locked}
          elementsSelectable={!locked}
        >
          <Background
            variant={backgroundVariant}
            // gap=20 espelha o `GRID_SIZE` oficial do n8n — espaçamento
            // dos dots fica idêntico ao canvas que o usuário conhece.
            gap={20}
            // Cross precisa de braço mínimo ~6px pra render; Dots/Lines ficam
            // bem com 1px. Hardcodar 1 deixava o "+" invisível (parecia Dots).
            size={backgroundVariant === BackgroundVariant.Cross ? 6 : 1}
          />
          {remoteCursors && remoteCursors.length > 0 && (
            <CollabCursors others={remoteCursors} />
          )}
          {(commentThreads && commentThreads.length > 0) || draftCommentPin ? (
            <CommentPinsLayer
              threads={commentThreads ?? []}
              activeThreadId={activeCommentThreadId}
              draftPin={draftCommentPin ?? null}
              onOpenThread={(id) => onOpenCommentThread?.(id)}
            />
          ) : null}
          {!presentationMode && miniMapVisible && (
            <MiniMap
              nodeColor={minimapNodeColor}
              nodeStrokeWidth={0}
              pannable
              zoomable
              className="!rounded-lg !border !border-border !bg-card !ring-1 !ring-foreground/5"
            />
          )}
          {!presentationMode && <FlowAlignBar />}
          <SnapGuidesOverlay guides={snapGuides} />
          {!presentationMode && <FlowTransformPanel />}
          <FlowSpotlight />
          <FlowShortcutsHelp />
          {!presentationMode && (
            <Panel position="bottom-center" className="!bottom-6">
              <FlowToolbar
                onAddSticky={handleAddSticky}
                onAddContainer={handleAddContainer}
                onAutoLayout={handleAutoLayout}
              />
            </Panel>
          )}
          {/* History panel */}
          {historyVisible && !presentationMode && (
            <Panel position="top-right" className="!top-4 !right-4">
              <div className="pointer-events-auto w-56 rounded-lg border border-border bg-background shadow-md">
                <div className="border-b border-border px-3 py-2 text-xs font-semibold text-foreground">
                  Histórico
                </div>
                <div className="h-72 overflow-y-auto">
                  <div className="flex flex-col-reverse p-1">
                    {Array.from({ length: historyMeta.length }, (_, i) => {
                      const isCurrent = i === historyMeta.pointer;
                      const ts = historyTimestamps.current[i];
                      const label =
                        i === 0
                          ? "Estado inicial"
                          : isCurrent
                          ? "Estado atual"
                          : `Estado ${i}`;
                      return (
                        <button
                          key={i}
                          type="button"
                          onClick={() => jumpToHistory(i)}
                          className={cn(
                            "flex items-center justify-between rounded px-2 py-1.5 text-left text-xs transition-colors hover:bg-muted",
                            isCurrent && "bg-accent font-medium text-accent-foreground",
                          )}
                        >
                          <span className="truncate">{label}</span>
                          {ts && (
                            <span className="ml-2 shrink-0 text-muted-foreground">
                              {formatTime(ts)}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </Panel>
          )}
          {focusedRunId && !presentationMode && (
            <Panel position="top-center" className="!top-20">
              <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-sky-500/40 bg-sky-500/10 px-3 py-1.5 text-xs shadow-sm backdrop-blur">
                <span className="size-2 animate-pulse rounded-full bg-sky-500" />
                <span className="font-medium text-sky-700 dark:text-sky-300">
                  Visualizando run
                </span>
                <span className="font-mono text-[10px] text-muted-foreground">
                  {focusedRunId.slice(0, 8)}
                </span>
                <span className="text-[10px] text-muted-foreground">
                  · clique num nó pra inspecionar · duplo-clique pra editar
                </span>
                <button
                  type="button"
                  onClick={() => useExecutionStore.getState().clear()}
                  className="ml-1 cursor-pointer rounded px-1.5 py-0.5 text-[11px] font-medium text-sky-700 hover:bg-sky-500/20 dark:text-sky-300"
                  title="Sair do modo visualização"
                >
                  Sair
                </button>
              </div>
            </Panel>
          )}
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
      </FlowContextMenu>
      <CanvasHandleBridge
        nodesRef={nodesRef}
        edgesRef={edgesRef}
        setNodes={setNodes}
        setEdges={setEdges}
        isApplyingRemoteRef={isApplyingRemoteRef}
      />
      <NodeConfigDialog
        open={configState !== null}
        onOpenChange={(o) => !o && setConfigState(null)}
        {...(configState?.nodeId !== undefined && { nodeId: configState.nodeId })}
        nodeType={configState?.nodeType}
        meta={configState?.meta}
        values={configState?.values ?? {}}
        onSave={handleConfigSave}
        upstreamInputs={
          configState?.nodeId
            ? buildUpstreamInputs(configState.nodeId, edgesRef.current, stepsByNodeIdForEdges, pinnedMap, nodesRef.current)
            : []
        }
        outputData={
          configState?.nodeId
            ? (configState.nodeId in pinnedMap
                ? pinnedMap[configState.nodeId]
                : // Mescla sample (estrutura completa) com real (valores observados).
                  // Real ganha em conflito; sample preenche campos ausentes pra dar
                  // ao user a árvore completa pra arrastar templates.
                  mergeOutputWithSample(
                    (stepsByNodeIdForEdges[configState.nodeId]?.output ?? null) as
                      | Record<string, unknown>
                      | null,
                    defaultSampleOutput(configState.nodeType),
                  ))
            : undefined
        }
        outputPinned={configState?.nodeId ? configState.nodeId in pinnedMap : false}
        outputIsSample={
          // "exemplo" quando o output mostrado contém pelo menos parte de sample
          // (sem pin, e o sample existe). Aceita também caso o real seja parcial
          // — o user precisa saber que alguns campos são placeholders.
          configState?.nodeId
            ? !(configState.nodeId in pinnedMap)
              && defaultSampleOutput(configState.nodeType) !== undefined
            : false
        }
        onTogglePin={
          configState?.nodeId
            ? () => {
                const nid = configState.nodeId as string;
                if (nid in pinnedMap) {
                  pinnedDataApi.remove(workflowId, nid);
                } else {
                  const out = stepsByNodeIdForEdges[nid]?.output;
                  if (out && typeof out === "object") {
                    pinnedDataApi.set(workflowId, nid, out as Record<string, unknown>);
                  }
                }
              }
            : undefined
        }
        onEditOutput={
          configState?.nodeId
            ? () => {
                // Reusa o PinEditorDialog já existente — dispara via window event
                // que a rota `flow.tsx` escuta e abre o editor de JSON livre.
                window.dispatchEvent(
                  new CustomEvent("workflow:node-pin-edit", {
                    detail: { nodeId: configState.nodeId },
                  }),
                );
              }
            : undefined
        }
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
  setNodes,
  setEdges,
  isApplyingRemoteRef,
}: {
  nodesRef: React.RefObject<Node[]>;
  edgesRef: React.RefObject<Edge[]>;
  setNodes: (nodes: Node[]) => void;
  setEdges: (edges: Edge[]) => void;
  isApplyingRemoteRef: React.RefObject<boolean>;
}) {
  useEffect(() => {
    handleRefSlot.current = {
      getDefinition: () => serializeDefinition(nodesRef.current ?? [], edgesRef.current ?? []),
      applyRemoteDefinition: (def: PersistedDefinition) => {
        // Hidrata definition remoto via mesmo path do bootstrap — garante
        // que tipos visuais (sticky/container/workflow) e meta sejam
        // reaplicados consistentemente. A flag bloqueia o efeito de dirty
        // e o broadcast de eco no use-collab-doc.
        const next = hydrateDefinition(def);
        isApplyingRemoteRef.current = true;
        try {
          setNodes(next.nodes);
          setEdges(next.edges);
        } finally {
          // Libera no próximo tick — o efeito de dirty observa o batch atual
          // e precisa ver a flag setada quando rodar.
          queueMicrotask(() => {
            isApplyingRemoteRef.current = false;
          });
        }
      },
    };
    return () => {
      handleRefSlot.current = null;
    };
  }, [nodesRef, edgesRef, setNodes, setEdges, isApplyingRemoteRef]);
  return null;
}

export const WorkflowCanvas = forwardRef<WorkflowCanvasHandle, WorkflowCanvasProps>(
  function WorkflowCanvas(props, ref) {
    useImperativeHandle(
      ref,
      () => ({
        getDefinition: () => handleRefSlot.current?.getDefinition() ?? { nodes: [], edges: [] },
        applyRemoteDefinition: (def) => handleRefSlot.current?.applyRemoteDefinition(def),
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

/**
 * Constrói a lista de UpstreamInput pro painel esquerdo do NodeConfigDialog.
 * Vasculha as edges em direção ao `targetNodeId` e coleta o output de cada
 * source (do step do run focado OU do pinned data, com pin tendo prioridade).
 *
 * `nodes` é usado pra extrair o label humano de cada upstream (título
 * customizado ou nodeType como fallback).
 */
/**
 * Estilo do label da edge por valor — leitura semântica imediata no canvas.
 * `true`/`0` → verde (caminho sim do if/switch primeiro)
 * `false`/`1` → vermelho (caminho não/segunda saída)
 * outros → âmbar (saídas custom do switch, ai_languageModel, etc.)
 *
 * Texto sempre branco bold pra contraste alto em qualquer background.
 */
function buildEdgeLabelStyle(label: string | undefined): {
  labelStyle: Record<string, unknown>;
  labelBgStyle: Record<string, unknown>;
  labelBgPadding: [number, number];
  labelBgBorderRadius: number;
} {
  if (!label) {
    return {
      labelStyle: { fontSize: 11, fontWeight: 600, fontFamily: "inherit", fill: "#ffffff" },
      labelBgStyle: { fill: "#475569", fillOpacity: 0 },
      labelBgPadding: [6, 3],
      labelBgBorderRadius: 6,
    };
  }
  const isTrue = label === "true" || label === "0";
  const isFalse = label === "false" || label === "1";
  const bg = isTrue ? "#10b981" : isFalse ? "#ef4444" : "#f59e0b";
  return {
    labelStyle: {
      fontSize: 11,
      fontWeight: 700,
      fontFamily: "inherit",
      fill: "#ffffff",
      letterSpacing: 0.3,
    },
    labelBgStyle: { fill: bg, fillOpacity: 1 },
    labelBgPadding: [8, 4],
    labelBgBorderRadius: 8,
  };
}

/**
 * Coleta TODOS os ancestrais transitivos do node alvo (BFS reverso pelo grafo).
 * Estilo n8n: o usuário arrasta paths de qualquer node anterior já executado,
 * não só do pai direto. Ordem: pais diretos primeiro, depois avós, e por aí —
 * profundidade crescente, deduplica IDs.
 *
 * Filtra pra incluir só nodes que TÊM dados (step com output OU pin),
 * porque não faz sentido arrastar de nó vazio.
 */
function buildUpstreamInputs(
  targetNodeId: string,
  edges: Edge[],
  stepsByNodeId: Record<string, { output?: Record<string, unknown> | null }>,
  pinnedMap: Record<string, Record<string, unknown>>,
  nodes: Node[],
): UpstreamInput[] {
  // Mapa target → sources pra BFS reverso (uma só passada na lista de edges).
  const inEdges = new Map<string, string[]>();
  for (const e of edges) {
    if (!inEdges.has(e.target)) inEdges.set(e.target, []);
    inEdges.get(e.target)!.push(e.source);
  }

  // BFS reverso a partir do target — coleta ancestrais em camadas.
  const visited = new Set<string>([targetNodeId]);
  const ordered: string[] = [];
  let frontier = inEdges.get(targetNodeId) ?? [];
  while (frontier.length > 0) {
    const next: string[] = [];
    for (const id of frontier) {
      if (visited.has(id)) continue;
      visited.add(id);
      ordered.push(id);
      const parents = inEdges.get(id);
      if (parents) next.push(...parents);
    }
    frontier = next;
  }

  // Mapeia cada ID pra UpstreamInput. Quando o nó não tem run nem pin, cai
  // pro sample default (triggers têm exemplo de payload) — assim o user
  // consegue arrastar campos pra montar `{{ prev.body.X }}` antes do 1º run.
  const out: UpstreamInput[] = [];
  for (const id of ordered) {
    const node = nodes.find((n) => n.id === id);
    const d = (node?.data ?? {}) as { title?: unknown; nodeType?: unknown };
    const label =
      (typeof d.title === "string" && d.title.trim()) ||
      (typeof d.nodeType === "string" && d.nodeType) ||
      id.slice(0, 8);
    const isPinned = id in pinnedMap;
    const nt = typeof d.nodeType === "string" ? d.nodeType : undefined;
    const sample = defaultSampleOutput(nt);
    const realData = isPinned
      ? pinnedMap[id]
      : (stepsByNodeId[id]?.output as Record<string, unknown> | null | undefined);
    // Mescla pra que campos do sample apareçam mesmo quando o run real foi
    // testado com payload simplificado. Real vence em conflito.
    const data = isPinned ? realData : (mergeOutputWithSample(realData ?? null, sample) ?? null);
    if (data !== null && data !== undefined) {
      out.push({ nodeId: id, label, output: data, pinned: isPinned });
    }
  }
  return out;
}
