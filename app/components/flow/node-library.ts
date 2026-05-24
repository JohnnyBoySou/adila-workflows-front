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
  Filter,
  ArrowUpDown,
  Scissors,
  CopyMinus,
  Merge,
  Rows3,
  KeyRound,
  Braces,
  FileCode,
  Sheet,
  CodeXml,
  Hash,
  Type,
  GitCompare,
  Calculator,
  Shuffle,
  Replace,
  MessageSquare,
  Brain,
  Boxes,
  History,
  FileText,
  StickyNote,
  Frame,
  Webhook,
  Clock,
  Mail,
  ClipboardList,
  MessageCircle,
  AlertTriangle,
  Rss,
  Radio,
  Bell,
  Send as SendIcon,
  MessagesSquare,
  Link2,
  FileJson,
  KeySquare,
  FileType,
  Fingerprint,
  Dices,
  Archive,
  Cloud,
  FileBox,
  Plug,
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
 *   - Gatilhos       → ponto de entrada do run
 *   - Ações          → I/O externo (HTTP, código, resposta)
 *   - Banco de Dados → conectores de banco (Postgres, Redis)
 *   - Lógica         → controle de fluxo (if/switch/loop/wait/end)
 *   - Dados          → manipulação de payload local (var, datas, crypto, listas)
 *   - IA             → LangChain-style (chat, embeddings, vetor, memória, docs)
 *   - Anotações      → visuais (sticky, frame)
 */
export type NodeCategory =
  | "Gatilhos"
  | "Ações"
  | "Banco de Dados"
  | "Lógica"
  | "Dados"
  | "IA"
  | "Anotações";

export type NodeLibraryEntry = {
  id: string;
  /** Espelha `NodeType` do backend. Undefined só para entries de anotação. */
  nodeType?: string;
  label: string;
  description: string;
  icon: LucideIcon;
  color: string;
  category: NodeCategory;
  /**
   * Env vars que o handler do backend espera ler de `context.env`. Usado pela
   * aba "Conexões" do workflow info dialog para validar configuração do
   * environment ativo. Verdade única — adicionar/remover aqui reflete na UI
   * automaticamente.
   */
  requiredEnv?: string[];
  /**
   * Credencial tipada exigida (`postgres` ou `redis`). Aba "Conexões" lê o
   * `config.connectionRef` do nó na canvas e valida contra as credenciais
   * cadastradas no workflow + environment ativo (`database_connections`,
   * reposicionado como "Credenciais tipadas" na UI).
   */
  requiresConnection?: "postgres" | "redis";
  /** Constrói o nó na posição dada. */
  build: (position: { x: number; y: number }, nodeId: string) => Node;
};

type EntryOptions = {
  requiredEnv?: string[];
  requiresConnection?: "postgres" | "redis";
};

function workflowEntry(
  nodeType: string,
  label: string,
  description: string,
  icon: LucideIcon,
  color: string,
  category: NodeCategory,
  variant: WorkflowNodeVariant,
  options?: EntryOptions,
): NodeLibraryEntry {
  return {
    id: nodeType,
    nodeType,
    label,
    description,
    icon,
    color,
    category,
    ...(options?.requiredEnv && { requiredEnv: options.requiredEnv }),
    ...(options?.requiresConnection && { requiresConnection: options.requiresConnection }),
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
const C_DB = "text-cyan-500";
const C_LOGIC = "text-amber-500";
const C_END = "text-rose-500";
const C_DATA = "text-violet-500";
const C_AI = "text-fuchsia-500";
const C_NOTE = "text-yellow-500";

export const NODE_LIBRARY: NodeLibraryEntry[] = [
  // ── Gatilhos ─────────────────────────────────────────────────────────
  workflowEntry(
    "start",
    "Início (manual)",
    "Disparado pelo botão Play do editor",
    Play,
    C_TRIGGER,
    "Gatilhos",
    "trigger",
  ),
  workflowEntry(
    "webhook_trigger",
    "Webhook",
    "URL pública com token, métodos configuráveis, HMAC e tester integrado",
    Webhook,
    C_TRIGGER,
    "Gatilhos",
    "trigger",
  ),
  workflowEntry(
    "schedule_trigger",
    "Agendamento (cron)",
    "Disparado em horários definidos por cron",
    Clock,
    C_TRIGGER,
    "Gatilhos",
    "trigger",
  ),
  workflowEntry(
    "interval_trigger",
    "Intervalo",
    "Disparado a cada N segundos/minutos/horas",
    Repeat,
    C_TRIGGER,
    "Gatilhos",
    "trigger",
  ),
  workflowEntry(
    "email_trigger",
    "Novo e-mail",
    "Dispara quando chega e-mail em caixa IMAP",
    Mail,
    C_TRIGGER,
    "Gatilhos",
    "trigger",
  ),
  workflowEntry(
    "form_trigger",
    "Formulário",
    "Disparado por submissão de form público",
    ClipboardList,
    C_TRIGGER,
    "Gatilhos",
    "trigger",
  ),
  workflowEntry(
    "chat_trigger",
    "Chat",
    "Disparado por mensagem em janela de chat",
    MessageCircle,
    C_TRIGGER,
    "Gatilhos",
    "trigger",
  ),
  workflowEntry(
    "error_trigger",
    "On error",
    "Dispara quando outro workflow falha",
    AlertTriangle,
    C_TRIGGER,
    "Gatilhos",
    "trigger",
  ),
  workflowEntry(
    "workflow_called_trigger",
    "Chamado por workflow",
    "Entrada quando outro workflow invoca este",
    WorkflowIcon,
    C_TRIGGER,
    "Gatilhos",
    "trigger",
  ),
  workflowEntry(
    "rss_trigger",
    "RSS",
    "Dispara em novo item de feed RSS/Atom",
    Rss,
    C_TRIGGER,
    "Gatilhos",
    "trigger",
  ),
  workflowEntry(
    "postgres_trigger",
    "Postgres LISTEN",
    "Dispara em NOTIFY no canal Postgres",
    Bell,
    C_TRIGGER,
    "Gatilhos",
    "trigger",
  ),
  workflowEntry(
    "redis_trigger",
    "Redis Pub/Sub",
    "Dispara em mensagem em canal Redis",
    Radio,
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
  workflowEntry(
    "email_send",
    "Enviar e-mail",
    "Envia e-mail via SMTP configurado",
    Mail,
    C_ACTION,
    "Ações",
    "action",
    { requiredEnv: ["SMTP_HOST", "SMTP_USER", "SMTP_PASS", "SMTP_FROM"] },
  ),
  workflowEntry(
    "slack_webhook",
    "Slack",
    "Posta mensagem em Incoming Webhook do Slack",
    MessagesSquare,
    C_ACTION,
    "Ações",
    "action",
  ),
  workflowEntry(
    "discord_webhook",
    "Discord",
    "Posta mensagem em Webhook do Discord",
    MessageCircle,
    C_ACTION,
    "Ações",
    "action",
  ),
  workflowEntry(
    "telegram_send",
    "Telegram",
    "Envia mensagem via Bot API do Telegram",
    SendIcon,
    C_ACTION,
    "Ações",
    "action",
  ),
  workflowEntry(
    "s3",
    "S3",
    "get/put/delete/list em buckets S3-compatíveis",
    Cloud,
    C_ACTION,
    "Ações",
    "action",
    {
      requiredEnv: [
        "AWS_S3_BUCKET_NAME",
        "AWS_ACCESS_KEY_ID",
        "AWS_SECRET_ACCESS_KEY",
        "AWS_DEFAULT_REGION",
        "AWS_ENDPOINT_URL",
      ],
    },
  ),
  workflowEntry(
    "pdf_extract",
    "PDF Extract",
    "Extrai texto e metadados de um PDF",
    FileBox,
    C_ACTION,
    "Ações",
    "action",
  ),
  workflowEntry(
    "websocket",
    "WebSocket",
    "Conecta, envia e opcionalmente coleta respostas",
    Plug,
    C_ACTION,
    "Ações",
    "action",
  ),

  // ── Banco de Dados ───────────────────────────────────────────────────
  workflowEntry(
    "postgres",
    "Postgres",
    "Executa SQL em um banco Postgres",
    Database,
    C_DB,
    "Banco de Dados",
    "action",
    { requiresConnection: "postgres" },
  ),
  workflowEntry(
    "redis",
    "Redis",
    "Operação de chave/valor ou lista",
    Server,
    C_DB,
    "Banco de Dados",
    "action",
    { requiresConnection: "redis" },
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
  workflowEntry(
    "filter",
    "Filtrar",
    "Mantém apenas itens que casam com a regra",
    Filter,
    C_DATA,
    "Dados",
    "data",
  ),
  workflowEntry(
    "sort",
    "Ordenar",
    "Ordena itens por campo ascendente ou descendente",
    ArrowUpDown,
    C_DATA,
    "Dados",
    "data",
  ),
  workflowEntry(
    "limit",
    "Limitar",
    "Mantém apenas os primeiros N itens",
    Scissors,
    C_DATA,
    "Dados",
    "data",
  ),
  workflowEntry(
    "remove_duplicates",
    "Remover duplicados",
    "Deduplica itens por valor ou campo",
    CopyMinus,
    C_DATA,
    "Dados",
    "data",
  ),
  workflowEntry(
    "merge",
    "Mesclar",
    "Combina dois conjuntos por append, merge ou join",
    Merge,
    C_DATA,
    "Dados",
    "data",
  ),
  workflowEntry(
    "split_out",
    "Split out",
    "Explode um array em itens individuais",
    Rows3,
    C_DATA,
    "Dados",
    "data",
  ),
  workflowEntry(
    "compare_datasets",
    "Comparar datasets",
    "Diff entre dois conjuntos: novos, removidos, alterados",
    GitCompare,
    C_DATA,
    "Dados",
    "data",
  ),
  workflowEntry(
    "rename_keys",
    "Renomear chaves",
    "Reescreve nomes de campos do payload",
    KeyRound,
    C_DATA,
    "Dados",
    "data",
  ),
  workflowEntry(
    "edit_fields",
    "Editar campos",
    "Adiciona, remove ou altera campos do item",
    Replace,
    C_DATA,
    "Dados",
    "data",
  ),
  workflowEntry(
    "json",
    "JSON",
    "Parse, stringify e extração via JSONPath",
    Braces,
    C_DATA,
    "Dados",
    "data",
  ),
  workflowEntry(
    "xml",
    "XML",
    "Parse e build de documentos XML",
    FileCode,
    C_DATA,
    "Dados",
    "data",
  ),
  workflowEntry(
    "csv",
    "CSV",
    "Lê ou gera CSV/TSV com cabeçalho",
    Sheet,
    C_DATA,
    "Dados",
    "data",
  ),
  workflowEntry(
    "html_extract",
    "HTML Extract",
    "Extrai dados de HTML via seletores CSS",
    CodeXml,
    C_DATA,
    "Dados",
    "data",
  ),
  workflowEntry(
    "markdown",
    "Markdown",
    "Converte entre Markdown e HTML",
    Hash,
    C_DATA,
    "Dados",
    "data",
  ),
  workflowEntry(
    "text_manipulation",
    "Texto",
    "Replace, split, join, case, trim, regex",
    Type,
    C_DATA,
    "Dados",
    "data",
  ),
  workflowEntry(
    "math",
    "Matemática",
    "Avalia expressões e funções numéricas",
    Calculator,
    C_DATA,
    "Dados",
    "data",
  ),
  workflowEntry(
    "shuffle",
    "Embaralhar",
    "Reordena aleatoriamente itens do array",
    Shuffle,
    C_DATA,
    "Dados",
    "data",
  ),
  workflowEntry(
    "template",
    "Template",
    "Renderiza string com placeholders {{ ... }}",
    FileType,
    C_DATA,
    "Dados",
    "data",
  ),
  workflowEntry(
    "yaml",
    "YAML",
    "Parse e stringify de documentos YAML",
    FileJson,
    C_DATA,
    "Dados",
    "data",
  ),
  workflowEntry(
    "jwt",
    "JWT",
    "Assina, verifica ou decodifica JSON Web Tokens",
    KeySquare,
    C_DATA,
    "Dados",
    "data",
  ),
  workflowEntry(
    "url_tools",
    "URL Tools",
    "Parse, build, encode e query string de URLs",
    Link2,
    C_DATA,
    "Dados",
    "data",
  ),
  workflowEntry(
    "uuid",
    "UUID",
    "Gera identificadores únicos (v4)",
    Fingerprint,
    C_DATA,
    "Dados",
    "data",
  ),
  workflowEntry(
    "random",
    "Aleatório",
    "Inteiro, float, string, bytes ou pick aleatório",
    Dices,
    C_DATA,
    "Dados",
    "data",
  ),
  workflowEntry(
    "compression",
    "Compressão",
    "gzip/deflate compress e decompress",
    Archive,
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

/**
 * Mapa de nodeType → ícone e cor específicos do node.
 * Usado pelo canvas para renderizar o ícone correto em vez do ícone genérico do variant.
 */
export const NODE_ICON_MAP: Record<string, { icon: LucideIcon; color: string }> = Object.fromEntries(
  NODE_LIBRARY.filter((e) => e.nodeType).map((e) => [e.nodeType!, { icon: e.icon, color: e.color }]),
);

export const NODE_CATEGORIES: NodeCategory[] = [
  "Gatilhos",
  "Ações",
  "Banco de Dados",
  "Lógica",
  "Dados",
  "IA",
  "Anotações",
];
