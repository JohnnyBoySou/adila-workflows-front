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
import { SwitchPanel } from "./switch-panel";

// ── Gatilhos / Saída ─────────────────────────────────────────────────────
const start: NodeConfigSchema = {
  title: "Início (manual)",
  description: "Disparado pelo botão Play do editor. Não exige configuração.",
  fields: [],
};

const webhook_trigger: NodeConfigSchema = {
  title: "Webhook",
  description:
    "Disparado por POST em URL pública. O body JSON vira o input do run (acessível como steps[<id>].body).",
  fields: [
    {
      name: "responseMode",
      label: "Modo de resposta",
      type: "select",
      description:
        "Async: responde 202 imediatamente. Sync: aguarda o run terminar e devolve o output (ou o body de um respond_to_webhook).",
      options: [
        { value: "async", label: "Async — 202 imediato" },
        { value: "sync", label: "Sync — espera o run" },
      ],
    },
    {
      name: "responseTimeoutMs",
      label: "Timeout sync (ms)",
      type: "number",
      min: 1000,
      max: 120_000,
      placeholder: "30000",
      description: "Só usado em modo sync. Máx 120000 (2min).",
      visibleWhen: (v) => v.responseMode === "sync",
    },
  ],
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

const redis: NodeConfigSchema = {
  title: "Redis",
  fields: [
    {
      name: "connectionString",
      label: "Connection string",
      type: "text",
      required: true,
      placeholder: "{{ env.REDIS_URL }}",
    },
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
};

const code: NodeConfigSchema = {
  title: "Código JavaScript",
  description: "Snippet JS executado pelo engine; o retorno vira o output do nó.",
  fields: [
    { name: "code", label: "Corpo da função", type: "code", language: "js", required: true },
    { name: "timeoutMs", label: "Timeout (ms)", type: "number", min: 0 },
  ],
  customPanel: CodePanel,
};

const respond_to_webhook: NodeConfigSchema = {
  title: "Responder webhook",
  description: "Envia a resposta HTTP custom em workflows disparados via webhook síncrono.",
  fields: [
    {
      name: "status",
      label: "Status code",
      type: "number",
      min: 100,
      max: 599,
      placeholder: "200",
    },
    { name: "headers", label: "Headers", type: "kv" },
    {
      name: "body",
      label: "Body",
      type: "json",
      description: "Pode ser objeto, string ou null.",
    },
  ],
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
  fields: [
    {
      name: "items",
      label: "Coleção (template)",
      type: "text",
      required: true,
      placeholder: "{{ steps.fetch.rows }}",
      description: "Expressão que resolva pra array.",
    },
    {
      name: "batchSize",
      label: "Tamanho do lote",
      type: "number",
      min: 1,
      placeholder: "10",
    },
  ],
};

const wait: NodeConfigSchema = {
  title: "Aguardar",
  description: "Use exatamente um dos modos abaixo (ms, segundos ou data absoluta).",
  fields: [
    { name: "ms", label: "Milissegundos", type: "number", min: 0, placeholder: "500" },
    { name: "seconds", label: "Segundos", type: "number", min: 0, placeholder: "30" },
    {
      name: "until",
      label: "Até (ISO 8601)",
      type: "text",
      placeholder: "2026-06-01T10:00:00Z",
    },
  ],
};

const execute_workflow: NodeConfigSchema = {
  title: "Sub-workflow",
  description: "Executa outro workflow do org como sub-run síncrono.",
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
  description:
    "Use `variables` (chave/valor) para várias de uma vez, ou `name` + `value` pra uma única.",
  fields: [
    { name: "variables", label: "Variáveis (kv)", type: "kv" },
    { name: "name", label: "Nome (modo único)", type: "text", placeholder: "currentUser" },
    {
      name: "value",
      label: "Valor (modo único)",
      type: "text",
      placeholder: "{{ steps.fetch.user }}",
    },
  ],
};

const DATE_OPS = [
  { value: "now", label: "now" },
  { value: "parse", label: "parse" },
  { value: "format", label: "format" },
  { value: "add", label: "add" },
  { value: "diff", label: "diff" },
];

const DATE_UNITS = [
  { value: "ms", label: "milissegundos" },
  { value: "seconds", label: "segundos" },
  { value: "minutes", label: "minutos" },
  { value: "hours", label: "horas" },
  { value: "days", label: "dias" },
];

const date_time: NodeConfigSchema = {
  title: "Data e hora",
  fields: [
    { name: "operation", label: "Operação", type: "select", required: true, options: DATE_OPS },
    {
      name: "value",
      label: "Valor",
      type: "text",
      placeholder: "2026-05-22 ou {{ input.date }}",
      visibleWhen: (v) =>
        v.operation === "parse" || v.operation === "format" || v.operation === "add",
    },
    {
      name: "format",
      label: "Formato",
      type: "text",
      placeholder: "YYYY-MM-DD HH:mm:ss",
      visibleWhen: (v) => v.operation === "format",
    },
    {
      name: "amount",
      label: "Quantidade",
      type: "number",
      visibleWhen: (v) => v.operation === "add",
    },
    {
      name: "unit",
      label: "Unidade",
      type: "select",
      options: DATE_UNITS,
      visibleWhen: (v) => v.operation === "add" || v.operation === "diff",
    },
    {
      name: "from",
      label: "De",
      type: "text",
      placeholder: "{{ input.start }}",
      visibleWhen: (v) => v.operation === "diff",
    },
    {
      name: "to",
      label: "Até",
      type: "text",
      placeholder: "{{ input.end }}",
      visibleWhen: (v) => v.operation === "diff",
    },
  ],
};

const CRYPTO_OPS = [
  { value: "hash", label: "hash" },
  { value: "hmac", label: "hmac" },
  { value: "uuid", label: "uuid" },
  { value: "random", label: "random" },
  { value: "base64", label: "base64" },
];

const HASH_ALGOS = [
  { value: "md5", label: "MD5" },
  { value: "sha1", label: "SHA-1" },
  { value: "sha256", label: "SHA-256" },
  { value: "sha512", label: "SHA-512" },
];

const ENCODINGS = [
  { value: "hex", label: "hex" },
  { value: "base64", label: "base64" },
];

const crypto: NodeConfigSchema = {
  title: "Crypto",
  fields: [
    { name: "operation", label: "Operação", type: "select", required: true, options: CRYPTO_OPS },
    {
      name: "algorithm",
      label: "Algoritmo",
      type: "select",
      options: HASH_ALGOS,
      visibleWhen: (v) => v.operation === "hash" || v.operation === "hmac",
    },
    {
      name: "value",
      label: "Valor",
      type: "textarea",
      rows: 3,
      visibleWhen: (v) =>
        v.operation === "hash" || v.operation === "hmac" || v.operation === "base64",
    },
    {
      name: "secret",
      label: "Secret",
      type: "text",
      placeholder: "{{ env.SIGN_SECRET }}",
      visibleWhen: (v) => v.operation === "hmac",
    },
    {
      name: "encoding",
      label: "Encoding",
      type: "select",
      options: ENCODINGS,
      visibleWhen: (v) =>
        v.operation === "hash" || v.operation === "hmac" || v.operation === "random",
    },
    {
      name: "bytes",
      label: "Bytes",
      type: "number",
      min: 1,
      placeholder: "32",
      visibleWhen: (v) => v.operation === "random",
    },
    {
      name: "mode",
      label: "Modo",
      type: "select",
      options: [
        { value: "encode", label: "encode" },
        { value: "decode", label: "decode" },
      ],
      visibleWhen: (v) => v.operation === "base64",
    },
  ],
};

const LIST_OPS = [
  { value: "filter", label: "filter" },
  { value: "sort", label: "sort" },
  { value: "slice", label: "slice" },
  { value: "distinct", label: "distinct" },
  { value: "length", label: "length" },
  { value: "reverse", label: "reverse" },
];

const FILTER_OPS = [
  { value: "eq", label: "= (eq)" },
  { value: "neq", label: "≠ (neq)" },
  { value: "gt", label: ">" },
  { value: "gte", label: "≥" },
  { value: "lt", label: "<" },
  { value: "lte", label: "≤" },
  { value: "contains", label: "contains" },
  { value: "truthy", label: "truthy" },
  { value: "falsy", label: "falsy" },
];

const item_lists: NodeConfigSchema = {
  title: "Listas",
  fields: [
    { name: "operation", label: "Operação", type: "select", required: true, options: LIST_OPS },
    {
      name: "items",
      label: "Items (template)",
      type: "text",
      placeholder: "{{ steps.fetch.rows }}",
      description: "Expressão que resolva pra array.",
    },
    {
      name: "field",
      label: "Campo (dot-path)",
      type: "text",
      placeholder: "user.email",
      visibleWhen: (v) =>
        v.operation === "filter" || v.operation === "sort" || v.operation === "distinct",
    },
    {
      name: "op",
      label: "Comparador",
      type: "select",
      options: FILTER_OPS,
      visibleWhen: (v) => v.operation === "filter",
    },
    {
      name: "value",
      label: "Valor de comparação",
      type: "text",
      visibleWhen: (v) => v.operation === "filter" && v.op !== "truthy" && v.op !== "falsy",
    },
    {
      name: "order",
      label: "Ordem",
      type: "select",
      options: [
        { value: "asc", label: "ascendente" },
        { value: "desc", label: "descendente" },
      ],
      visibleWhen: (v) => v.operation === "sort",
    },
    {
      name: "start",
      label: "Start",
      type: "number",
      visibleWhen: (v) => v.operation === "slice",
    },
    {
      name: "end",
      label: "End",
      type: "number",
      visibleWhen: (v) => v.operation === "slice",
    },
  ],
};

const AGG_OPS = [
  { value: "count", label: "count" },
  { value: "sum", label: "sum" },
  { value: "avg", label: "avg" },
  { value: "min", label: "min" },
  { value: "max", label: "max" },
  { value: "group_by", label: "group_by" },
];

const aggregate: NodeConfigSchema = {
  title: "Agregação",
  fields: [
    { name: "operation", label: "Operação", type: "select", required: true, options: AGG_OPS },
    {
      name: "items",
      label: "Items (template)",
      type: "text",
      placeholder: "{{ steps.query.rows }}",
    },
    {
      name: "field",
      label: "Campo",
      type: "text",
      placeholder: "amount",
      visibleWhen: (v) =>
        v.operation === "sum" ||
        v.operation === "avg" ||
        v.operation === "min" ||
        v.operation === "max",
    },
    {
      name: "by",
      label: "Agrupar por (campo)",
      type: "text",
      placeholder: "status",
      visibleWhen: (v) => v.operation === "group_by",
    },
    {
      name: "aggs",
      label: "Agregações adicionais",
      type: "json",
      placeholder: '{ "total": { "op": "sum", "field": "amount" } }',
      visibleWhen: (v) => v.operation === "group_by",
    },
  ],
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

const embeddings: NodeConfigSchema = {
  title: "Embeddings",
  description: "Use `text` para um único embed ou `texts` para batch.",
  fields: [
    {
      name: "model",
      label: "Modelo",
      type: "text",
      placeholder: "text-embedding-3-small",
    },
    { name: "text", label: "Texto único", type: "textarea", rows: 3 },
    { name: "texts", label: "Texts (batch)", type: "stringList" },
  ],
};

const VECTOR_OPS = [
  { value: "insert", label: "insert" },
  { value: "search", label: "search" },
];

const vector_store: NodeConfigSchema = {
  title: "Vector store",
  description: "Conecta-se a um Postgres externo com extensão pgvector.",
  fields: [
    {
      name: "connectionString",
      label: "Connection string",
      type: "text",
      required: true,
      placeholder: "{{ env.VECTOR_DB_URL }}",
    },
    { name: "table", label: "Tabela", type: "text", placeholder: "documents" },
    { name: "operation", label: "Operação", type: "select", required: true, options: VECTOR_OPS },
    {
      name: "content",
      label: "Conteúdo",
      type: "textarea",
      rows: 4,
      visibleWhen: (v) => v.operation === "insert",
    },
    {
      name: "embedding",
      label: "Embedding (number[])",
      type: "json",
      placeholder: "[0.012, -0.034, ...]",
      description: "Vetor numérico. Tipicamente vindo de `{{ steps.embed.embedding }}`.",
    },
    {
      name: "metadata",
      label: "Metadata",
      type: "json",
      visibleWhen: (v) => v.operation === "insert",
    },
    {
      name: "topK",
      label: "Top K",
      type: "number",
      min: 1,
      placeholder: "5",
      visibleWhen: (v) => v.operation === "search",
    },
  ],
};

const CHAT_OPS = [
  { value: "load", label: "load" },
  { value: "append", label: "append" },
];

const chat_memory: NodeConfigSchema = {
  title: "Memória de chat",
  fields: [
    {
      name: "connectionString",
      label: "Connection string",
      type: "text",
      required: true,
      placeholder: "{{ env.MEMORY_DB_URL }}",
    },
    { name: "table", label: "Tabela", type: "text", placeholder: "chat_messages" },
    { name: "sessionId", label: "Session ID", type: "text", required: true },
    { name: "operation", label: "Operação", type: "select", required: true, options: CHAT_OPS },
    {
      name: "limit",
      label: "Limite",
      type: "number",
      min: 1,
      placeholder: "20",
      visibleWhen: (v) => v.operation === "load",
    },
    {
      name: "role",
      label: "Role",
      type: "select",
      options: [
        { value: "user", label: "user" },
        { value: "assistant", label: "assistant" },
        { value: "system", label: "system" },
      ],
      visibleWhen: (v) => v.operation === "append",
    },
    {
      name: "content",
      label: "Conteúdo",
      type: "textarea",
      rows: 4,
      visibleWhen: (v) => v.operation === "append",
    },
  ],
};

const document_loader: NodeConfigSchema = {
  title: "Document loader",
  description: "Faz chunking do texto pra alimentar embeddings/vector store.",
  fields: [
    { name: "text", label: "Texto", type: "textarea", required: true, rows: 6 },
    { name: "chunkSize", label: "Chunk size", type: "number", min: 1, placeholder: "1000" },
    { name: "chunkOverlap", label: "Chunk overlap", type: "number", min: 0, placeholder: "200" },
    { name: "metadata", label: "Metadata", type: "json" },
  ],
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
  sticky_note,
  container,
};

export function getNodeConfigSchema(nodeType: string | undefined): NodeConfigSchema | null {
  if (!nodeType) return null;
  return NODE_CONFIG_SCHEMAS[nodeType] ?? null;
}
