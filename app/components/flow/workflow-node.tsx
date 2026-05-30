import { memo, useCallback, useRef, useState } from "react";
import {
  Handle,
  NodeToolbar,
  Position,
  useNodeConnections,
  useReactFlow,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Database,
  GitBranch,
  Lock,
  MessageSquare,
  Pin,
  Play,
  Plus,
  Power,
  Sparkles,
  Square,
  Trash2,
  Workflow as WorkflowIcon,
  Zap,
} from "lucide-react";

import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { cn } from "~/lib/utils";
import { useExecutionStore, type NodeExecutionStatus } from "~/stores/execution";
import { useIsPinned } from "~/stores/pinned-data";
import { WORKFLOW_NODE_PIN_EDIT_EVENT } from "./pin-editor-dialog";
import { useWorkflowId } from "./workflow-context";
import { NODE_ICON_MAP } from "./node-library";

/**
 * Evento global emitido quando o usuário pede "play" num nó via toolbar.
 * O canvas / a rota podem escutar para disparar uma execução do workflow.
 * Vai por window pra evitar acoplar o nó (componente leaf) à mutation.
 */
export const WORKFLOW_NODE_PLAY_EVENT = "workflow:node-play";
export type WorkflowNodePlayDetail = { nodeId: string };

/**
 * Evento global: usuário clicou no "+" do handle source pra adicionar o próximo
 * nó. O canvas escuta, abre a biblioteca de nós e, ao selecionar, cria o nó
 * conectado a este. Estilo n8n.
 */
export const WORKFLOW_NODE_ADD_NEXT_EVENT = "workflow:node-add-next";
export type WorkflowNodeAddNextDetail = {
  nodeId: string;
  /** id do source handle clicado — "true"/"false" pro IF/Filter, undefined pros demais. */
  handleId?: string;
};

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
  /** Quando true, o nó está travado (não pode ser arrastado). */
  locked?: boolean;
  /** Comentário/anotação anexada ao nó. */
  comment?: string;
  /** Override do user pra cor do ícone (hex). Sobrepõe o default do nodeType/variant. */
  iconColor?: string;
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
  // Triggers só emitem — sem handle de entrada. Visual distinto: lado esquerdo
  // arredondado em pílula (stadium) pra leitura imediata de "começa aqui".
  const isTrigger = variant === "trigger";
  // Ícone específico do nodeType tem prioridade; cai no ícone genérico do variant.
  const nodeIconEntry = data.nodeType ? NODE_ICON_MAP[data.nodeType] : undefined;
  const Icon = nodeIconEntry?.icon ?? meta.icon;
  const iconColor = nodeIconEntry?.color ?? meta.iconColor;
  // Override custom do usuário (hex) — aplicado via inline style; quando
  // ausente, mantém a classe tailwind padrão do tipo/variant.
  const customIconColor = data.iconColor;
  // Conta edges saindo deste node — quando >1 marcamos o handle como
  // "fan-out" pra leitura rápida do fluxo no canvas.
  const outgoing = useNodeConnections({ id, handleType: "source" });
  const fanOut = outgoing.length > 1;
  // Seletor fino — só este nó re-renderiza quando o status dele muda.
  const executionStatus = useExecutionStore(
    (s) => (s as unknown as { stepsByNodeId: Record<string, { status: NodeExecutionStatus }> }).stepsByNodeId[id]?.status,
  );
  const executionRing = executionStatus ? EXECUTION_RING[executionStatus] : null;
  // Pin: lê o workflowId do contexto do canvas e consulta o store por id.
  // Nó fora do provider (improvável) cai num `null` e nunca aparece pinado.
  const workflowId = useWorkflowId();
  const pinned = useIsPinned(workflowId ?? "", workflowId ? id : null);

  const { setNodes, deleteElements, updateNodeData } = useReactFlow();

  // ── Comment state ──────────────────────────────────────────────────────
  const [commentOpen, setCommentOpen] = useState(false);
  const [commentDraft, setCommentDraft] = useState(data.comment ?? "");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const saveComment = useCallback(() => {
    const trimmed = commentDraft.trim();
    updateNodeData(id, { comment: trimmed || undefined });
    setCommentOpen(false);
  }, [id, commentDraft, updateNodeData]);

  const handleCommentKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        saveComment();
      }
      if (e.key === "Escape") {
        setCommentOpen(false);
        setCommentDraft(data.comment ?? "");
      }
    },
    [saveComment, data.comment],
  );

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
    // Wrapper relativo pra abrigar título/descrição absolutos abaixo do card
    // e o "raio" laranja absoluto à esquerda quando trigger.
    <div className="relative">
      {/* Raio laranja indicador de trigger — fora do card, à esquerda */}
      {isTrigger && (
        <span
          className="pointer-events-none absolute -left-7 top-1/2 -translate-y-1/2 grid size-5 place-items-center"
          aria-hidden
          title="Trigger"
        >
          <Zap className="size-5 fill-orange-500 text-orange-500" strokeWidth={1.5} />
        </span>
      )}
      <Card
        className={cn(
          // Card minimalista: 112×112, rounded-2xl, ícone grande no centro.
          // Texto FORA do card (abaixo, absolute).
          "relative flex size-28 items-center justify-center !overflow-visible rounded-2xl border-border/60 bg-card p-0 shadow-md",
          selected && "ring-2 ring-ring",
          data.disabled && "opacity-50",
          executionRing,
          executionStatus === "running" && "animate-pulse",
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
            onClick={() => {
              setCommentDraft(data.comment ?? "");
              setCommentOpen((prev) => !prev);
            }}
            title="Comentário"
            aria-label="Comentário"
            className={cn(data.comment && "text-blue-500")}
          >
            <MessageSquare className="size-3.5" />
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

      {/* Comment popover */}
      {commentOpen && (
        <div
          className="absolute bottom-[calc(100%+8px)] left-0 z-50 w-56 rounded-md border border-border bg-popover p-2 shadow-lg"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <textarea
            ref={textareaRef}
            autoFocus
            value={commentDraft}
            onChange={(e) => setCommentDraft(e.target.value)}
            onBlur={saveComment}
            onKeyDown={handleCommentKeyDown}
            placeholder="Escreva um comentário... (Ctrl+Enter para salvar)"
            rows={3}
            className="w-full resize-none rounded-sm border border-border bg-background p-1.5 text-xs text-foreground outline-none placeholder:text-muted-foreground focus:ring-1 focus:ring-ring"
          />
        </div>
      )}

      {!isTrigger && (
        // Input handle estilo n8n: retângulo cinza no lado esquerdo.
        // Verde quando o nó está running/success no run focado.
        <Handle
          type="target"
          position={Position.Left}
          className={cn(
            "!z-10 !h-4 !w-2 !rounded-sm !border !border-background transition-colors",
            executionStatus === "success"
              ? "!bg-emerald-500"
              : executionStatus === "failed"
                ? "!bg-rose-500"
                : executionStatus === "running"
                  ? "!bg-sky-500"
                  : "!bg-slate-400 dark:!bg-slate-500",
          )}
        />
      )}

      {/* Lock indicator */}
      {data.locked && (
        <span
          className="absolute right-1 top-1 grid size-4 place-items-center rounded-sm text-muted-foreground/60"
          title="Nó travado"
        >
          <Lock className="size-3" />
        </span>
      )}

      {pinned && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            window.dispatchEvent(
              new CustomEvent(WORKFLOW_NODE_PIN_EDIT_EVENT, { detail: { nodeId: id } }),
            );
          }}
          className="absolute -right-1.5 -top-1.5 grid size-5 cursor-pointer place-items-center rounded-full bg-amber-500 text-white shadow-sm ring-2 ring-background transition-transform hover:scale-110"
          title="Saída pinada — clique para editar"
          aria-label="Editar pin"
        >
          <Pin className="size-2.5" />
        </button>
      )}
      {/* Apenas o ícone grande centralizado — sem texto interno */}
      <Icon
        className={cn("size-12", !customIconColor && iconColor)}
        style={customIconColor ? { color: customIconColor } : undefined}
      />

      {/* Comment indicator (when comment exists and popover is closed) */}
      {data.comment && !commentOpen && (
        <span
          className="absolute -bottom-1.5 -left-1.5 grid size-4 place-items-center rounded-full bg-blue-500/20 text-blue-500"
          title={data.comment}
        >
          <MessageSquare className="size-2.5" />
        </span>
      )}

      {/* Output handles. IF/Filter renderizam DOIS handles (true/false) com
          rótulos visíveis. Demais tipos renderizam só um handle simples.
          Drag-to-connect nativo + click no "+" abre a biblioteca. */}
      {data.nodeType === "if" || data.nodeType === "filter" ? (
        <>
          <BranchHandle
            id="true"
            label="true"
            color="emerald"
            offsetY={-22}
            executionStatus={executionStatus}
            nodeId={id}
          />
          <BranchHandle
            id="false"
            label="false"
            color="rose"
            offsetY={22}
            executionStatus={executionStatus}
            nodeId={id}
          />
        </>
      ) : (
        <Handle
          type="source"
          position={Position.Right}
          className={cn(
            "!z-10 !size-5 !rounded-full !border-2 !border-background transition-colors",
            executionStatus === "success"
              ? "!bg-emerald-500"
              : executionStatus === "failed"
                ? "!bg-rose-500"
                : executionStatus === "running"
                  ? "!bg-sky-500"
                  : "!bg-muted-foreground/70 hover:!bg-primary",
            fanOut && "!ring-2 !ring-amber-500/40",
          )}
          onClick={(e) => {
            e.stopPropagation();
            window.dispatchEvent(
              new CustomEvent<WorkflowNodeAddNextDetail>(WORKFLOW_NODE_ADD_NEXT_EVENT, {
                detail: { nodeId: id },
              }),
            );
          }}
        >
          {fanOut ? (
            <span
              className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-[9px] font-bold leading-none text-background"
              aria-hidden
            >
              {outgoing.length}
            </span>
          ) : (
            <Plus
              className="pointer-events-none absolute left-1/2 top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 text-background"
              strokeWidth={3}
              aria-hidden
            />
          )}
        </Handle>
      )}
      </Card>
      {/* Título e descrição FORA do card, absolutos abaixo — estilo screenshot */}
      <div className="pointer-events-none absolute left-1/2 top-full mt-2 w-44 -translate-x-1/2 select-none text-center">
        <div className="text-[13px] font-semibold leading-tight text-foreground line-clamp-2">
          {data.title}
        </div>
        {data.description && (
          <div className="mt-0.5 line-clamp-1 text-[11px] leading-tight text-muted-foreground">
            {data.description}
          </div>
        )}
      </div>
    </div>
  );
}

export default memo(WorkflowNodeComponent);

/* -------------------------------------------------------------------------- */
/* Branch Handle (IF/Filter)                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Handle visualizado de saída condicional (true/false). Posicionado à
 * direita do card com offset vertical, exibe um rótulo colado fora. Mantém
 * o mesmo comportamento de drag-to-connect + click pra abrir biblioteca.
 */
function BranchHandle({
  id: handleId,
  label,
  color,
  offsetY,
  executionStatus,
  nodeId,
}: {
  id: "true" | "false";
  label: string;
  color: "emerald" | "rose";
  offsetY: number;
  executionStatus: NodeExecutionStatus | undefined;
  nodeId: string;
}) {
  const bgClass =
    executionStatus === "success"
      ? "!bg-emerald-500"
      : executionStatus === "failed"
        ? "!bg-rose-500"
        : executionStatus === "running"
          ? "!bg-sky-500"
          : color === "emerald"
            ? "!bg-emerald-500/70 hover:!bg-emerald-500"
            : "!bg-rose-500/70 hover:!bg-rose-500";
  const labelClass =
    color === "emerald"
      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
      : "border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-400";
  return (
    <Handle
      type="source"
      position={Position.Right}
      id={handleId}
      style={{ top: `calc(50% + ${offsetY}px)` }}
      className={cn(
        "!z-10 !size-5 !rounded-full !border-2 !border-background transition-colors",
        bgClass,
      )}
      onClick={(e) => {
        e.stopPropagation();
        window.dispatchEvent(
          new CustomEvent<WorkflowNodeAddNextDetail>(WORKFLOW_NODE_ADD_NEXT_EVENT, {
            detail: { nodeId, handleId },
          }),
        );
      }}
    >
      {/* "+" central */}
      <Plus
        className="pointer-events-none absolute left-1/2 top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 text-background"
        strokeWidth={3}
        aria-hidden
      />
      {/* Label fixo logo à direita */}
      <span
        className={cn(
          "pointer-events-none absolute left-full top-1/2 ml-2 -translate-y-1/2 select-none rounded-full border px-2 py-0.5 font-mono text-[10px] font-semibold",
          labelClass,
        )}
      >
        {label}
      </span>
    </Handle>
  );
}
