/**
 * Serialização entre o modelo do React Flow e o `definition` que o backend
 * persiste em `workflows.definition` (e que o engine consome).
 *
 * Shape do backend (ver `back/src/lib/engine/types.ts`):
 *   { nodes: [{ id, type, config }], edges: [{ from, to, label? }] }
 *
 * O `config` é livre — guardamos ali tudo que o editor precisa pra
 * remontar visualmente o nó (`_editor`), além de qualquer campo que
 * o handler do engine consuma (url, method, query, …).
 *
 * Princípio: round-trip lossless pra nós executáveis e visuais.
 * Coisas que só fazem sentido no canvas (position, width, height,
 * variant, title, description) ficam dentro de `config._editor`.
 */
import type { Edge, Node } from "@xyflow/react";

import type { WorkflowNodeData, WorkflowNodeVariant } from "./workflow-node";

/** Shape persistido no backend. */
export interface PersistedNode {
  id: string;
  type: string;
  config: Record<string, unknown>;
}

export interface PersistedEdge {
  from: string;
  to: string;
  label?: string;
}

export interface PersistedDefinition {
  nodes: PersistedNode[];
  edges: PersistedEdge[];
  /** Metadados adicionais opacos (preserva `source` do import n8n, etc). */
  [key: string]: unknown;
}

/** Campos visuais sempre guardados em `config._editor`. */
interface EditorMeta {
  position: { x: number; y: number };
  title?: string;
  description?: string;
  variant?: WorkflowNodeVariant;
  width?: number;
  height?: number;
  zIndex?: number;
}

// ── Serialize ──────────────────────────────────────────────────────────
export function serializeDefinition(
  nodes: Node[],
  edges: Edge[],
  // Permite preservar campos top-level desconhecidos do definition original.
  base: Record<string, unknown> = {},
): PersistedDefinition {
  const persistedNodes: PersistedNode[] = nodes.map((n) => {
    const editor: EditorMeta = {
      position: n.position,
      ...(n.width !== undefined && { width: n.width }),
      ...(n.height !== undefined && { height: n.height }),
      ...(n.zIndex !== undefined && { zIndex: n.zIndex }),
    };

    // Nó executável (React Flow type = "workflow") — `nodeType` em data
    // carrega o tipo do engine.
    if (n.type === "workflow") {
      const d = (n.data ?? {}) as WorkflowNodeData & Record<string, unknown>;
      const { title, description, variant, nodeType, ...rest } = d;
      if (title !== undefined) editor.title = title;
      if (description !== undefined) editor.description = description;
      if (variant !== undefined) editor.variant = variant;
      return {
        id: n.id,
        type: nodeType ?? "noop",
        config: { ...rest, _editor: editor },
      };
    }

    if (n.type === "sticky") {
      const d = (n.data ?? {}) as Record<string, unknown>;
      return {
        id: n.id,
        type: "sticky_note",
        config: { ...d, _editor: editor },
      };
    }

    if (n.type === "container") {
      const d = (n.data ?? {}) as Record<string, unknown>;
      return {
        id: n.id,
        type: "container",
        config: { ...d, _editor: editor },
      };
    }

    // Fallback genérico — preserva o que houver.
    return {
      id: n.id,
      type: n.type ?? "noop",
      config: { ...(n.data as Record<string, unknown> | undefined), _editor: editor },
    };
  });

  const persistedEdges: PersistedEdge[] = edges.map((e) => ({
    from: e.source,
    to: e.target,
    // sourceHandle vira label (usado por if/switch pra rotular saída).
    ...(e.sourceHandle && { label: e.sourceHandle }),
  }));

  return { ...base, nodes: persistedNodes, edges: persistedEdges };
}

// ── Hydrate ────────────────────────────────────────────────────────────
function readEditor(config: Record<string, unknown> | undefined): EditorMeta {
  const ed = (config?._editor as EditorMeta | undefined) ?? { position: { x: 0, y: 0 } };
  return {
    position: ed.position ?? { x: 0, y: 0 },
    title: ed.title,
    description: ed.description,
    variant: ed.variant,
    width: ed.width,
    height: ed.height,
    zIndex: ed.zIndex,
  };
}

const VARIANT_BY_TYPE: Record<string, WorkflowNodeVariant> = {
  start: "trigger",
  end: "end",
  if: "condition",
  switch: "condition",
  wait: "condition",
  noop: "condition",
  split_in_batches: "condition",
  execute_workflow: "condition",
  set_variable: "data",
  date_time: "data",
  crypto: "data",
  item_lists: "data",
  aggregate: "data",
  ai_chat: "ai",
  embeddings: "ai",
  vector_store: "ai",
  chat_memory: "ai",
  document_loader: "ai",
};

export function hydrateDefinition(definition: unknown): { nodes: Node[]; edges: Edge[] } {
  if (!definition || typeof definition !== "object") return { nodes: [], edges: [] };
  const def = definition as Partial<PersistedDefinition>;
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  if (Array.isArray(def.nodes)) {
    for (const n of def.nodes) {
      if (!n || typeof n !== "object" || typeof n.id !== "string") continue;
      const type = String(n.type ?? "noop");
      const config = (n.config && typeof n.config === "object" ? n.config : {}) as Record<
        string,
        unknown
      >;
      const editor = readEditor(config);
      // Limpa o `_editor` antes de injetar em `data` pra não duplicar.
      const { _editor: _ignored, ...rest } = config;

      if (type === "sticky_note") {
        nodes.push({
          id: n.id,
          type: "sticky",
          position: editor.position,
          width: editor.width ?? 180,
          height: editor.height ?? 140,
          data: {
            text: typeof rest.text === "string" ? rest.text : "",
            color: typeof rest.color === "string" ? rest.color : "yellow",
          },
        });
        continue;
      }
      if (type === "container") {
        nodes.push({
          id: n.id,
          type: "container",
          position: editor.position,
          width: editor.width ?? 400,
          height: editor.height ?? 280,
          zIndex: editor.zIndex ?? -1,
          selectable: true,
          data: {
            label: typeof rest.label === "string" ? rest.label : "Grupo",
            color: typeof rest.color === "string" ? rest.color : "slate",
          },
        });
        continue;
      }

      // Nó executável.
      const variant = editor.variant ?? VARIANT_BY_TYPE[type] ?? "action";
      nodes.push({
        id: n.id,
        type: "workflow",
        position: editor.position,
        data: {
          ...rest,
          nodeType: type,
          variant,
          ...(editor.title !== undefined && { title: editor.title }),
          ...(editor.description !== undefined && { description: editor.description }),
        },
      });
    }
  }

  if (Array.isArray(def.edges)) {
    def.edges.forEach((e, idx) => {
      if (!e || typeof e !== "object") return;
      const from = (e as PersistedEdge).from;
      const to = (e as PersistedEdge).to;
      if (typeof from !== "string" || typeof to !== "string") return;
      edges.push({
        id: `e${idx}-${from}-${to}`,
        source: from,
        target: to,
        animated: true,
        ...((e as PersistedEdge).label && { sourceHandle: (e as PersistedEdge).label }),
      });
    });
  }

  return { nodes, edges };
}
