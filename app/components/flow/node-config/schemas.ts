/**
 * Schemas declarativos para cada `NodeType` do engine
 * (back/src/lib/engine/types.ts). Os nomes de campo aqui têm que casar
 * com o que o handler lê em `cfg.X`. Para nós com `operation`
 * discriminadora, usamos `visibleWhen` para esconder campos irrelevantes.
 */
import type { NodeConfigSchema } from "./types";
import { AiChatPanel } from "./ai-chat-panel";
import { CodePanel } from "./code-panel";
import { ExecuteWorkflowPanel } from "./execute-workflow-panel";
import { HttpRequestPanel } from "./http-request-panel";
import { IfPanel } from "./if-panel";
import { PostgresPanel } from "./postgres-panel";
import { RedisPanel } from "./redis-panel";
import { S3Panel } from "./s3-panel";
import { VectorStorePanel } from "./vector-store-panel";
import { ChatMemoryPanel } from "./chat-memory-panel";
import { EmbeddingsPanel } from "./embeddings-panel";
import { DocumentLoaderPanel } from "./document-loader-panel";
import { SwitchPanel } from "./switch-panel";
import { SplitInBatchesPanel } from "./split-in-batches-panel";
import { WaitPanel } from "./wait-panel";
import { SetVariablePanel } from "./set-variable-panel";
import { RespondToWebhookPanel } from "./respond-to-webhook-panel";
import { AggregatePanel } from "./aggregate-panel";
import { DateTimePanel } from "./date-time-panel";
import { ItemListsPanel } from "./item-lists-panel";
import { CryptoPanel } from "./crypto-panel";

// ── Gatilhos / Saída ─────────────────────────────────────────────────────
const start: NodeConfigSchema = {
  title: "Início (manual)",
  description: "Disparado pelo botão Play do editor. Não exige configuração.",
  fields: [],
};

const manual_trigger: NodeConfigSchema = {
  title: "Rodar agora",
  description:
    "Disparo manual (botão Play). Opcionalmente define um payload default usado quando o run é disparado sem body.",
  fields: [
    {
      name: "defaultInput",
      label: "Payload default",
      type: "json",
      description: "JSON usado como input quando o run é disparado sem body.",
    },
  ],
};

const stop_and_error: NodeConfigSchema = {
  title: "Parar com erro",
  description:
    "Aborta o run com mensagem custom. Use como gate de validação depois de um if.",
  fields: [
    {
      name: "message",
      label: "Mensagem do erro",
      type: "text",
      required: true,
      placeholder: "Validação falhou: campo X ausente",
    },
    {
      name: "details",
      label: "Detalhes (opcional)",
      type: "json",
      description: "Objeto anexado ao erro pra contexto adicional.",
    },
  ],
};

const transform: NodeConfigSchema = {
  title: "Transformar",
  description:
    "Mapper declarativo: reescreve a forma do payload. mode=object monta um objeto único; mode=array itera `source` e mapeia cada item via `it.*`.",
  dialogSize: "wide",
  fields: [
    {
      name: "mode",
      label: "Modo",
      type: "select",
      options: [
        { value: "object", label: "Objeto único" },
        { value: "array", label: "Array (iterar source)" },
      ],
    },
    {
      name: "source",
      label: "Source (array)",
      type: "text",
      placeholder: "{{ steps.fetch.items }}",
      description: "Apenas no mode=array. Templatável; deve resolver pra um array.",
    },
    {
      name: "mapping",
      label: "Mapping",
      type: "json",
      required: true,
      description:
        'Ex: { "id": "input.user.id", "name": "it.attributes.name" }. Strings que começam com input./vars./env./steps./it. são tratadas como dot-path; resto vira template.',
    },
    {
      name: "include_source",
      label: "Incluir input original em _source",
      type: "boolean",
    },
  ],
};

const ai_agent: NodeConfigSchema = {
  title: "Agente IA",
  description:
    "LLM com loop de tool calling. Cada tool tem nome, descrição, inputSchema (JSON Schema) e ação (http ou echo).",
  dialogSize: "wide",
  fields: [
    {
      name: "provider",
      label: "Provedor",
      type: "select",
      options: [
        { value: "anthropic", label: "Anthropic" },
        { value: "openai", label: "OpenAI" },
      ],
    },
    { name: "model", label: "Modelo", type: "text", required: true, placeholder: "claude-sonnet-4-6" },
    { name: "prompt", label: "Prompt", type: "textarea", required: true, rows: 5 },
    { name: "system", label: "System", type: "textarea", rows: 3 },
    { name: "maxSteps", label: "Máx. de passos", type: "number", min: 1 },
    { name: "temperature", label: "Temperature", type: "number", step: 0.1, min: 0, max: 2 },
    { name: "maxOutputTokens", label: "Max output tokens", type: "number", min: 1 },
    {
      name: "tools",
      label: "Tools",
      type: "json",
      description:
        'Array de tools: [{ "name": "...", "description": "...", "inputSchema": {...}, "action": { "type": "http", "url": "..." } }]',
    },
  ],
};

const webhook_trigger: NodeConfigSchema = {
  title: "Webhook",
  description:
    "Disparado por POST em URL pública. O body JSON vira o input do run (acessível como steps[<id>].body).",
  dialogSize: "wide",
  fields: [],
};

const end: NodeConfigSchema = {
  title: "Fim",
  description: "Encerra o workflow.",
  fields: [
    {
      name: "output",
      label: "Output final (opcional)",
      type: "json",
      description: "Objeto a ser persistido como resultado do run.",
    },
  ],
};

const noop: NodeConfigSchema = {
  title: "No-op",
  description: "Não executa nada; só passa adiante.",
  fields: [],
};

// ── Ações ────────────────────────────────────────────────────────────────
// Painel dedicado (HttpRequestPanel) cobre toda a UI; mantemos `fields`
// vazio pra o renderer genérico ficar fora do caminho. A validação é feita
// pelo próprio painel via `onError`.
const http_request: NodeConfigSchema = {
  title: "Requisição HTTP",
  description: "Configuração completa: request, headers, body, autenticação e opções avançadas.",
  fields: [],
  customPanel: HttpRequestPanel,
  customPanelOwnsMeta: true,
};

// Painel dedicado (PostgresPanel): Monaco SQL/TS, snippets, ctx inspector.
// Fields ficam só pra init + validação leve quando o painel não estiver montado.
const postgres: NodeConfigSchema = {
  title: "Postgres",
  description: "SQL parametrizado ou modo ORM (Drizzle) com autocomplete tipado.",
  fields: [
    { name: "connectionString", label: "Connection string", type: "text", required: true },
    {
      name: "mode",
      label: "Modo",
      type: "select",
      options: [
        { value: "sql", label: "SQL" },
        { value: "orm", label: "ORM" },
      ],
    },
    { name: "query", label: "Query", type: "code", language: "sql" },
    { name: "params", label: "Params", type: "json" },
    { name: "code", label: "Código Drizzle", type: "code", language: "js" },
    { name: "timeoutMs", label: "Timeout (ms)", type: "number", min: 0 },
  ],
  customPanel: PostgresPanel,
  dialogSize: "full",
  customPanelOwnsMeta: true,
};

// Painel dedicado (RedisPanel): ConnectionPicker em modo `name` + operação +
// args. `fields` continua servindo pra init/validação leve caso o painel
// fique fora do caminho. `connectionString` legado é aceito read-only mas
// não aparece na UI nova.
const redis: NodeConfigSchema = {
  title: "Redis",
  fields: [
    {
      name: "operation",
      label: "Operação",
      type: "select",
      required: true,
      options: [
        { value: "get", label: "GET" },
        { value: "set", label: "SET" },
        { value: "del", label: "DEL" },
        { value: "incr", label: "INCR" },
        { value: "decr", label: "DECR" },
        { value: "expire", label: "EXPIRE" },
        { value: "ttl", label: "TTL" },
        { value: "exists", label: "EXISTS" },
        { value: "hget", label: "HGET" },
        { value: "hset", label: "HSET" },
        { value: "hdel", label: "HDEL" },
        { value: "lpush", label: "LPUSH (lista, push à esquerda)" },
        { value: "rpush", label: "RPUSH (lista, push à direita)" },
        { value: "lpop", label: "LPOP" },
        { value: "rpop", label: "RPOP" },
        { value: "llen", label: "LLEN" },
        { value: "lrange", label: "LRANGE (chave, start, stop)" },
      ],
    },
    {
      name: "args",
      label: "Argumentos",
      type: "stringList",
      description: "Lista de argumentos posicionais — ex: chave, valor, ttl.",
    },
  ],
  customPanel: RedisPanel,
  customPanelOwnsMeta: true,
};

const code: NodeConfigSchema = {
  title: "Código JavaScript",
  description: "Snippet JS executado pelo engine; o retorno vira o output do nó.",
  dialogSize: "wide",
  fields: [
    { name: "code", label: "Corpo da função", type: "code", language: "js", required: true },
    { name: "timeoutMs", label: "Timeout (ms)", type: "number", min: 0 },
  ],
  customPanel: CodePanel,
};

const respond_to_webhook: NodeConfigSchema = {
  title: "Responder webhook",
  dialogSize: "wide",
  fields: [],
  customPanel: RespondToWebhookPanel,
  customPanelOwnsMeta: true,
};

// ── Lógica ───────────────────────────────────────────────────────────────
// `if` e `switch` usam painéis dedicados (IfPanel / SwitchPanel) — a lista
// de fields fica só pro shape lógico (init + validação do required) e como
// fallback caso o customPanel suma. Os labels/placeholders aqui não
// aparecem na UI quando o panel está ativo.
const if_: NodeConfigSchema = {
  title: "Condição (IF)",
  description: "Bifurca em duas arestas rotuladas como `true` e `false`.",
  fields: [
    { name: "left", label: "Lado esquerdo", type: "text", required: true },
    { name: "op", label: "Operador", type: "text" },
    { name: "right", label: "Lado direito", type: "text" },
  ],
  customPanel: IfPanel,
};

const switch_: NodeConfigSchema = {
  title: "Switch",
  description:
    "Avalia `value` contra cada caso e segue a aresta com `label` correspondente. Sem match, usa `default`.",
  fields: [
    { name: "value", label: "Valor a comparar", type: "text", required: true },
    { name: "cases", label: "Casos", type: "json" },
    { name: "default", label: "Label default", type: "text" },
  ],
  customPanel: SwitchPanel,
};

const split_in_batches: NodeConfigSchema = {
  title: "Loop em lotes",
  dialogSize: "wide",
  fields: [],
  customPanel: SplitInBatchesPanel,
  customPanelOwnsMeta: true,
};

const wait: NodeConfigSchema = {
  title: "Aguardar",
  dialogSize: "wide",
  fields: [],
  customPanel: WaitPanel,
  customPanelOwnsMeta: true,
};

const execute_workflow: NodeConfigSchema = {
  title: "Sub-workflow",
  description: "Executa outro workflow do org como sub-run síncrono.",
  dialogSize: "wide",
  fields: [
    { name: "workflowId", label: "Workflow ID", type: "text", required: true },
    { name: "input", label: "Input", type: "json" },
    { name: "environmentId", label: "Environment ID", type: "text" },
    { name: "timeoutMs", label: "Timeout (ms)", type: "number", min: 0 },
  ],
  customPanel: ExecuteWorkflowPanel,
};

// ── Dados ────────────────────────────────────────────────────────────────
const set_variable: NodeConfigSchema = {
  title: "Variável",
  dialogSize: "wide",
  fields: [],
  customPanel: SetVariablePanel,
  customPanelOwnsMeta: true,
};

const date_time: NodeConfigSchema = {
  title: "Data e hora",
  dialogSize: "wide",
  fields: [],
  customPanel: DateTimePanel,
  customPanelOwnsMeta: true,
};

const crypto: NodeConfigSchema = {
  title: "Crypto",
  dialogSize: "wide",
  fields: [],
  customPanel: CryptoPanel,
  customPanelOwnsMeta: true,
};

const item_lists: NodeConfigSchema = {
  title: "Listas",
  dialogSize: "wide",
  fields: [],
  customPanel: ItemListsPanel,
  customPanelOwnsMeta: true,
};

const aggregate: NodeConfigSchema = {
  title: "Agregação",
  dialogSize: "wide",
  fields: [],
  customPanel: AggregatePanel,
  customPanelOwnsMeta: true,
};

// ── IA ───────────────────────────────────────────────────────────────────
const ai_chat: NodeConfigSchema = {
  title: "Chat IA",
  customPanel: AiChatPanel,
  dialogSize: "wide",
  // `fields` continua servindo pra inicialização/validação leve do dialog.
  fields: [
    {
      name: "provider",
      label: "Provedor",
      type: "select",
      options: [
        { value: "anthropic", label: "Anthropic" },
        { value: "openai", label: "OpenAI" },
      ],
    },
    {
      name: "model",
      label: "Modelo",
      type: "text",
      required: true,
      placeholder: "claude-sonnet-4-6",
    },
    {
      name: "prompt",
      label: "Prompt",
      type: "textarea",
      required: true,
      rows: 5,
      placeholder: "Pergunta do usuário, suportando {{ … }}.",
    },
    { name: "system", label: "System", type: "textarea", rows: 3 },
    { name: "temperature", label: "Temperature", type: "number", step: 0.1, min: 0, max: 2 },
    { name: "maxOutputTokens", label: "Max output tokens", type: "number", min: 1 },
  ],
};

// Painel dedicado (EmbeddingsPanel): provedor (openai/custom OpenAI-compatible),
// catálogo de modelos com dim, entrada single/batch, teste e histórico.
const embeddings: NodeConfigSchema = {
  title: "Embeddings",
  description: "Gera vetores via OpenAI ou qualquer endpoint OpenAI-compatible (Ollama, vLLM, etc).",
  dialogSize: "wide",
  fields: [],
  customPanel: EmbeddingsPanel,
  customPanelOwnsMeta: true,
};

// Painel dedicado (VectorStorePanel): seções Operação / Conexão / Teste / Histórico.
const vector_store: NodeConfigSchema = {
  title: "Vector store (pgvector)",
  description: "Insert / search em tabelas pgvector com env vars decriptadas.",
  dialogSize: "wide",
  fields: [],
  customPanel: VectorStorePanel,
  customPanelOwnsMeta: true,
};

// Painel dedicado (ChatMemoryPanel): seções Operação / Conexão / Teste / Histórico.
const chat_memory: NodeConfigSchema = {
  title: "Memória de chat",
  description: "Persistência de histórico de conversa em Postgres externo.",
  dialogSize: "wide",
  fields: [],
  customPanel: ChatMemoryPanel,
  customPanelOwnsMeta: true,
};

// Painel dedicado (DocumentLoaderPanel): entrada, chunking com preview visual
// de overlap, metadata KV, preview real dos chunks, histórico.
const document_loader: NodeConfigSchema = {
  title: "Document loader",
  description: "Chunkifica texto com overlap pra alimentar embeddings/vector store.",
  dialogSize: "wide",
  fields: [],
  customPanel: DocumentLoaderPanel,
  customPanelOwnsMeta: true,
};

// ── Visuais ──────────────────────────────────────────────────────────────
const STICKY_COLORS = [
  { value: "yellow", label: "Amarelo" },
  { value: "blue", label: "Azul" },
  { value: "green", label: "Verde" },
  { value: "pink", label: "Rosa" },
  { value: "purple", label: "Roxo" },
];

const sticky_note: NodeConfigSchema = {
  title: "Sticky note",
  fields: [
    { name: "text", label: "Texto", type: "textarea", rows: 5 },
    { name: "color", label: "Cor", type: "select", options: STICKY_COLORS },
  ],
};

const CONTAINER_COLORS = [
  { value: "slate", label: "Slate" },
  { value: "sky", label: "Sky" },
  { value: "emerald", label: "Emerald" },
  { value: "amber", label: "Amber" },
  { value: "rose", label: "Rose" },
];

// Painel dedicado (S3Panel): seções Operação / Conexão / Teste / Histórico.
// `fields` vazio — toda a validação acontece dentro do painel.
const s3: NodeConfigSchema = {
  title: "S3 (objeto)",
  description: "GET / PUT / DELETE / LIST / HEAD em buckets S3-compatíveis (AWS, R2, MinIO, Spaces).",
  fields: [],
  customPanel: S3Panel,
  customPanelOwnsMeta: true,
};

const container: NodeConfigSchema = {
  title: "Frame / Grupo",
  fields: [
    { name: "label", label: "Título", type: "text", placeholder: "Grupo" },
    { name: "color", label: "Cor", type: "select", options: CONTAINER_COLORS },
  ],
};

// ── Registry ─────────────────────────────────────────────────────────────
export const NODE_CONFIG_SCHEMAS: Record<string, NodeConfigSchema> = {
  start,
  manual_trigger,
  stop_and_error,
  transform,
  ai_agent,
  webhook_trigger,
  end,
  noop,
  http_request,
  postgres,
  redis,
  code,
  respond_to_webhook,
  if: if_,
  switch: switch_,
  split_in_batches,
  wait,
  execute_workflow,
  set_variable,
  date_time,
  crypto,
  item_lists,
  aggregate,
  ai_chat,
  embeddings,
  vector_store,
  chat_memory,
  document_loader,
  s3,
  sticky_note,
  container,
};

export function getNodeConfigSchema(nodeType: string | undefined): NodeConfigSchema | null {
  if (!nodeType) return null;
  return NODE_CONFIG_SCHEMAS[nodeType] ?? null;
}
