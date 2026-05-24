/**
 * VariableExplorer — mostra as variáveis disponíveis a partir do último
 * disparo dos nós webhook_trigger na canvas. Cada folha da árvore JSON é
 * arrastável: soltar num campo insere a expressão `{{ steps["id"].path }}`.
 *
 * Integrado como seção "Variáveis" no HttpRequestPanel (e potencialmente
 * em outros painéis no futuro).
 */
import { useState } from "react";
import { useNodes } from "@xyflow/react";
import { useQuery } from "@tanstack/react-query";
import {
  ChevronRight,
  GripVertical,
  Loader2,
  Webhook,
} from "lucide-react";

import { useWorkflowId } from "./workflow-context";
import { queryKeys } from "~/lib/query-keys";
import * as triggersApi from "~/services/triggers";
import { cn } from "~/lib/utils";

/* -------------------------------------------------------------------------- */
/* Tipos internos                                                              */
/* -------------------------------------------------------------------------- */

type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [k: string]: JsonValue };

/* -------------------------------------------------------------------------- */
/* Componente público                                                          */
/* -------------------------------------------------------------------------- */

export function VariableExplorer() {
  const nodes = useNodes();
  const workflowId = useWorkflowId() ?? "";

  const webhookNodes = nodes.filter((n) => n.type === "webhook_trigger");

  if (webhookNodes.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-border px-4 py-6 text-center text-xs text-muted-foreground">
        <Webhook className="mx-auto mb-2 size-4 opacity-40" />
        Adicione um nó <strong>Webhook Trigger</strong> ao canvas para ver as
        variáveis disponíveis aqui.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Arraste qualquer variável para um campo de texto para inserir a
        expressão <code className="rounded bg-muted px-1">{"{{ ... }}"}</code>.
        Os dados são do <strong>último disparo</strong> do webhook.
      </p>
      {webhookNodes.map((node) => {
        const title =
          (node.data as Record<string, unknown> | undefined)?.title as
            | string
            | undefined;
        return (
          <WebhookNodeVariables
            key={node.id}
            workflowId={workflowId}
            nodeId={node.id}
            nodeTitle={title ?? "Webhook"}
          />
        );
      })}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Variáveis de um nó webhook específico                                       */
/* -------------------------------------------------------------------------- */

function WebhookNodeVariables({
  workflowId,
  nodeId,
  nodeTitle,
}: {
  workflowId: string;
  nodeId: string;
  nodeTitle: string;
}) {
  const triggersQuery = useQuery({
    queryKey: queryKeys.triggers.list(workflowId),
    queryFn: () => triggersApi.list(workflowId, "webhook"),
    staleTime: 30_000,
  });

  const trigger = triggersQuery.data?.find((t) => t.nodeId === nodeId);

  const invocationsQuery = useQuery({
    queryKey: ["triggers", "invocations", workflowId, trigger?.id, 1],
    queryFn: () => triggersApi.listInvocations(workflowId, trigger!.id, 1),
    enabled: Boolean(trigger?.id),
    staleTime: 10_000,
  });

  const lastInput = invocationsQuery.data?.[0]?.input as
    | Record<string, JsonValue>
    | undefined;

  return (
    <div className="rounded-md border border-border bg-muted/20">
      {/* Header do nó */}
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <Webhook className="size-3.5 text-muted-foreground" />
        <span className="text-xs font-medium">{nodeTitle}</span>
        <code className="font-mono text-[10px] text-muted-foreground">
          {nodeId.slice(0, 8)}
        </code>
        {(triggersQuery.isPending || invocationsQuery.isFetching) && (
          <Loader2 className="ml-auto size-3 animate-spin text-muted-foreground" />
        )}
      </div>

      {/* Árvore de variáveis */}
      <div className="px-2 py-2">
        {!trigger && !triggersQuery.isPending && (
          <p className="px-1 text-[11px] text-muted-foreground">
            Webhook ainda não habilitado — habilite na aba Conexões.
          </p>
        )}

        {trigger && !lastInput && !invocationsQuery.isPending && (
          <p className="px-1 text-[11px] text-muted-foreground">
            Nenhum disparo ainda — envie um request para popular as variáveis.
          </p>
        )}

        {lastInput && (
          <VariableTree
            data={lastInput}
            nodeId={nodeId}
            path={[]}
          />
        )}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Árvore JSON recursiva                                                       */
/* -------------------------------------------------------------------------- */

function VariableTree({
  data,
  nodeId,
  path,
  depth = 0,
}: {
  data: Record<string, JsonValue> | JsonValue[];
  nodeId: string;
  path: string[];
  depth?: number;
}) {
  const entries = Array.isArray(data)
    ? data.map((v, i) => [String(i), v] as [string, JsonValue])
    : Object.entries(data);

  return (
    <div className={cn("space-y-0.5", depth > 0 && "ml-3 border-l border-border/60 pl-2")}>
      {entries.map(([key, value]) => (
        <VariableNode
          key={key}
          nodeId={nodeId}
          path={[...path, key]}
          label={key}
          value={value}
          depth={depth}
        />
      ))}
    </div>
  );
}

function VariableNode({
  nodeId,
  path,
  label,
  value,
  depth,
}: {
  nodeId: string;
  path: string[];
  label: string;
  value: JsonValue;
  depth: number;
}) {
  const [expanded, setExpanded] = useState(depth < 2);

  const isObject =
    value !== null && typeof value === "object";

  const expression = buildExpression(nodeId, path);

  if (isObject) {
    const children = value as Record<string, JsonValue> | JsonValue[];
    const childCount = Array.isArray(children)
      ? children.length
      : Object.keys(children).length;

    return (
      <div>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex w-full items-center gap-1 rounded px-1 py-0.5 text-left hover:bg-muted/50"
        >
          <ChevronRight
            className={cn(
              "size-3 shrink-0 text-muted-foreground transition-transform",
              expanded && "rotate-90",
            )}
          />
          <span className="font-mono text-[11px] font-medium text-foreground">
            {label}
          </span>
          <span className="ml-1 text-[10px] text-muted-foreground">
            {Array.isArray(children) ? `[${childCount}]` : `{${childCount}}`}
          </span>
        </button>

        {expanded && (
          <VariableTree
            data={children}
            nodeId={nodeId}
            path={path}
            depth={depth + 1}
          />
        )}
      </div>
    );
  }

  /* Folha — arrastável */
  return (
    <DraggableLeaf expression={expression} label={label} value={value} />
  );
}

function DraggableLeaf({
  expression,
  label,
  value,
}: {
  expression: string;
  label: string;
  value: JsonValue;
}) {
  const preview = formatValue(value);

  function onDragStart(e: React.DragEvent) {
    e.dataTransfer.effectAllowed = "copy";
    e.dataTransfer.setData("text/plain", expression);
    e.dataTransfer.setData("application/x-workflow-variable", expression);
  }

  return (
    <div
      draggable
      onDragStart={onDragStart}
      title={`Arrastar: ${expression}`}
      className={cn(
        "group flex cursor-grab items-center gap-1.5 rounded px-1 py-0.5",
        "hover:bg-primary/5 active:cursor-grabbing",
      )}
    >
      <GripVertical className="size-3 shrink-0 text-muted-foreground/40 group-hover:text-muted-foreground" />
      <span className="font-mono text-[11px] text-foreground">{label}</span>
      <span className="ml-auto max-w-[80px] truncate font-mono text-[10px] text-muted-foreground">
        {preview}
      </span>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

function buildExpression(nodeId: string, path: string[]): string {
  const root = `steps["${nodeId}"]`;
  const dotPath = path.map((p) => (/^\d+$/.test(p) ? `[${p}]` : `.${p}`)).join("");
  return `{{ ${root}${dotPath} }}`;
}

function formatValue(value: JsonValue): string {
  if (value === null) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") {
    return value.length > 20 ? `"${value.slice(0, 20)}…"` : `"${value}"`;
  }
  return String(value);
}
