import {
  Play,
  Square,
  Globe,
  Database,
  Server,
  Code2,
  Send,
  GitBranch,
  Split,
  Circle,
  Timer,
  Repeat,
  Workflow as WorkflowIcon,
  Variable,
  Calendar,
  Lock,
  List,
  Sigma,
  MessageSquare,
  Brain,
  Boxes,
  History,
  FileText,
  StickyNote,
  Frame,
  type LucideIcon,
} from "lucide-react";

import type { Node } from "@xyflow/react";
import type { WorkflowNodeVariant } from "./workflow-node";

/**
 * Biblioteca de nós do editor — **alinhada 1:1 com `NodeType` do engine
 * em `back/src/lib/engine/types.ts`**. Toda entry executável carrega o
 * `nodeType` exato que o backend reconhece; o save serializa esse campo
 * em `definition.nodes[].type` sem mais nenhuma tradução.
 *
 * As entries de anotação (sticky_note, container) usam `type` próprio do
 * React Flow ("sticky", "container") e ainda são parte da definição —
 * o engine ignora visualNodeTypes na execução.
 *
 * Categorias seguem o domínio funcional, não o variant visual:
 *   - Gatilhos  → ponto de entrada do run
 *   - Ações     → I/O externo (HTTP, DB, código, resposta)
 *   - Lógica    → controle de fluxo (if/switch/loop/wait/end)
 *   - Dados     → manipulação de payload local (var, datas, crypto, listas)
 *   - IA        → LangChain-style (chat, embeddings, vetor, memória, docs)
 *   - Anotações → visuais (sticky, frame)
 */
export type NodeCategory = "Gatilhos" | "Ações" | "Lógica" | "Dados" | "IA" | "Anotações";

export type NodeLibraryEntry = {
  id: string;
  /** Espelha `NodeType` do backend. Undefined só para entries de anotação. */
  nodeType?: string;
  label: string;
  description: string;
  icon: LucideIcon;
  color: string;
  category: NodeCategory;
  /** Constrói o nó na posição dada. */
  build: (position: { x: number; y: number }, nodeId: string) => Node;
};

function workflowEntry(
  nodeType: string,
  label: string,
  description: string,
  icon: LucideIcon,
  color: string,
  category: NodeCategory,
  variant: WorkflowNodeVariant,
): NodeLibraryEntry {
  return {
    id: nodeType,
    nodeType,
    label,
    description,
    icon,
    color,
    category,
    build: (position, nodeId) => ({
      id: nodeId,
      type: "workflow",
      position,
      data: { title: label, description, variant, nodeType },
    }),
  };
}

// ── Cores por categoria — ecoam o `chip` do workflow-node ──────────────
const C_TRIGGER = "text-emerald-500";
const C_ACTION = "text-sky-500";
const C_LOGIC = "text-amber-500";
const C_END = "text-rose-500";
const C_DATA = "text-violet-500";
const C_AI = "text-fuchsia-500";
const C_NOTE = "text-yellow-500";

export const NODE_LIBRARY: NodeLibraryEntry[] = [
  // ── Gatilhos ─────────────────────────────────────────────────────────
  workflowEntry(
    "start",
    "Início",
    "Ponto de entrada do workflow",
    Play,
    C_TRIGGER,
    "Gatilhos",
    "trigger",
  ),

  // ── Ações ────────────────────────────────────────────────────────────
  workflowEntry(
    "http_request",
    "Requisição HTTP",
    "Chama uma API externa",
    Globe,
    C_ACTION,
    "Ações",
    "action",
  ),
  workflowEntry(
    "postgres",
    "Postgres",
    "Executa SQL em um banco Postgres",
    Database,
    C_ACTION,
    "Ações",
    "action",
  ),
  workflowEntry(
    "redis",
    "Redis",
    "Operação de chave/valor ou lista",
    Server,
    C_ACTION,
    "Ações",
    "action",
  ),
  workflowEntry(
    "code",
    "Código",
    "Executa JavaScript arbitrário",
    Code2,
    C_ACTION,
    "Ações",
    "action",
  ),
  workflowEntry(
    "respond_to_webhook",
    "Responder webhook",
    "Envia resposta HTTP custom no modo sync",
    Send,
    C_ACTION,
    "Ações",
    "action",
  ),

  // ── Lógica ───────────────────────────────────────────────────────────
  workflowEntry(
    "if",
    "Condição",
    "Bifurca em true/false por regra",
    GitBranch,
    C_LOGIC,
    "Lógica",
    "condition",
  ),
  workflowEntry(
    "switch",
    "Switch",
    "Múltiplos caminhos por valor",
    Split,
    C_LOGIC,
    "Lógica",
    "condition",
  ),
  workflowEntry(
    "split_in_batches",
    "Loop em lotes",
    "Itera array em batches",
    Repeat,
    C_LOGIC,
    "Lógica",
    "condition",
  ),
  workflowEntry(
    "wait",
    "Aguardar",
    "Pausa por intervalo ou até horário",
    Timer,
    C_LOGIC,
    "Lógica",
    "condition",
  ),
  workflowEntry(
    "noop",
    "No-op",
    "Passa adiante sem efeito",
    Circle,
    C_LOGIC,
    "Lógica",
    "condition",
  ),
  workflowEntry(
    "execute_workflow",
    "Sub-workflow",
    "Invoca outro workflow e aguarda",
    WorkflowIcon,
    C_LOGIC,
    "Lógica",
    "condition",
  ),
  workflowEntry("end", "Fim", "Encerra o workflow", Square, C_END, "Lógica", "end"),

  // ── Dados ────────────────────────────────────────────────────────────
  workflowEntry(
    "set_variable",
    "Variável",
    "Define ou atualiza variáveis do run",
    Variable,
    C_DATA,
    "Dados",
    "data",
  ),
  workflowEntry(
    "date_time",
    "Data e hora",
    "Parse, format, diff, add em datas",
    Calendar,
    C_DATA,
    "Dados",
    "data",
  ),
  workflowEntry("crypto", "Crypto", "Hash, HMAC, UUID, base64", Lock, C_DATA, "Dados", "data"),
  workflowEntry(
    "item_lists",
    "Listas",
    "Filtra, ordena, fatia, distinct",
    List,
    C_DATA,
    "Dados",
    "data",
  ),
  workflowEntry(
    "aggregate",
    "Agregação",
    "Sum, avg, min, max, group by",
    Sigma,
    C_DATA,
    "Dados",
    "data",
  ),

  // ── IA ───────────────────────────────────────────────────────────────
  workflowEntry(
    "ai_chat",
    "Chat IA",
    "Anthropic / OpenAI chat completion",
    MessageSquare,
    C_AI,
    "IA",
    "ai",
  ),
  workflowEntry("embeddings", "Embeddings", "Gera vetores via OpenAI", Brain, C_AI, "IA", "ai"),
  workflowEntry(
    "vector_store",
    "Vector store",
    "Insert / search em pgvector",
    Boxes,
    C_AI,
    "IA",
    "ai",
  ),
  workflowEntry(
    "chat_memory",
    "Memória de chat",
    "Histórico de mensagens em Postgres",
    History,
    C_AI,
    "IA",
    "ai",
  ),
  workflowEntry(
    "document_loader",
    "Document loader",
    "Chunking de texto pra RAG",
    FileText,
    C_AI,
    "IA",
    "ai",
  ),

  // ── Anotações ────────────────────────────────────────────────────────
  {
    id: "sticky_note",
    nodeType: "sticky_note",
    label: "Sticky note",
    description: "Anotação rápida em post-it",
    icon: StickyNote,
    color: C_NOTE,
    category: "Anotações",
    build: (position, nodeId) => ({
      id: nodeId,
      type: "sticky",
      position,
      width: 180,
      height: 140,
      data: { text: "", color: "yellow" },
    }),
  },
  {
    id: "container",
    nodeType: "container",
    label: "Frame / Grupo",
    description: "Circula uma área para agrupar nós",
    icon: Frame,
    color: "text-slate-500",
    category: "Anotações",
    build: (position, nodeId) => ({
      id: nodeId,
      type: "container",
      position,
      width: 400,
      height: 280,
      zIndex: -1,
      data: { label: "Grupo", color: "slate" },
    }),
  },
];

export const NODE_CATEGORIES: NodeCategory[] = [
  "Gatilhos",
  "Ações",
  "Lógica",
  "Dados",
  "IA",
  "Anotações",
];
