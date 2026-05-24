import { memo, useCallback, useRef, useState } from "react";
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
  Lock,
  MessageSquare,
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
import { NODE_ICON_MAP } from "./node-library";

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
  /** Quando true, o nó está travado (não pode ser arrastado). */
  locked?: boolean;
  /** Comentário/anotação anexada ao nó. */
  comment?: string;
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
  // Ícone específico do nodeType tem prioridade; cai no ícone genérico do variant.
  const nodeIconEntry = data.nodeType ? NODE_ICON_MAP[data.nodeType] : undefined;
  const Icon = nodeIconEntry?.icon ?? meta.icon;
  const iconColor = nodeIconEntry?.color ?? meta.iconColor;
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

      <Handle
        type="target"
        position={Position.Left}
        className="!z-10 !size-2.5 !border-2 !border-background !bg-primary transition-[width,height] duration-150 hover:!size-4"
      />

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
        <span
          className="absolute -right-1.5 -top-1.5 grid size-5 place-items-center rounded-full bg-amber-500 text-white shadow-sm ring-2 ring-background"
          title="Saída pinada — próximas runs usam este resultado"
        >
          <Pin className="size-2.5" />
        </span>
      )}
      <CardHeader className="flex flex-row items-center gap-2 px-3">
        <span className={cn("grid size-7 shrink-0 place-items-center rounded-md", meta.iconBg)}>
          <Icon className={cn("size-4", iconColor)} />
        </span>
        <CardTitle className="text-sm">{data.title}</CardTitle>
      </CardHeader>
      {data.description ? (
        <CardContent className="px-3 text-xs text-muted-foreground">{data.description}</CardContent>
      ) : null}

      {/* Comment indicator (when comment exists and popover is closed) */}
      {data.comment && !commentOpen && (
        <span
          className="absolute -bottom-1.5 -left-1.5 grid size-4 place-items-center rounded-full bg-blue-500/20 text-blue-500"
          title={data.comment}
        >
          <MessageSquare className="size-2.5" />
        </span>
      )}

      <Handle
        type="source"
        position={Position.Right}
        className="!z-10 !size-2.5 !border-2 !border-background !bg-primary transition-[width,height] duration-150 hover:!size-4"
      />
    </Card>
  );
}

export default memo(WorkflowNodeComponent);
