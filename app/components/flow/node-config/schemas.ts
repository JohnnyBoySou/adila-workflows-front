/**
 * Schemas declarativos para cada `NodeType` do engine
 * (back/src/lib/engine/types.ts). Os nomes de campo aqui têm que casar
 * com o que o handler lê em `cfg.X`. Para nós com `operation`
 * discriminadora, usamos `visibleWhen` para esconder campos irrelevantes.
 */
import type { NodeConfigSchema } from "./types";

const STRING_OR_TEMPLATE = "Aceita texto fixo ou template {{ ... }}.";

const HTTP_METHODS = [
  { value: "GET", label: "GET" },
  { value: "POST", label: "POST" },
  { value: "PUT", label: "PUT" },
  { value: "PATCH", label: "PATCH" },
  { value: "DELETE", label: "DELETE" },
  { value: "HEAD", label: "HEAD" },
];

// ── Gatilhos / Saída ─────────────────────────────────────────────────────
const start: NodeConfigSchema = {
  title: "Início",
  description: "Ponto de entrada do workflow. Não exige configuração.",
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
const http_request: NodeConfigSchema = {
  title: "Requisição HTTP",
  fields: [
    {
      name: "url",
      label: "URL",
      type: "text",
      required: true,
      placeholder: "https://api.exemplo.com/recurso",
      description: STRING_OR_TEMPLATE,
    },
    {
      name: "method",
      label: "Método",
      type: "select",
      options: HTTP_METHODS,
    },
    {
      name: "headers",
      label: "Headers",
      type: "kv",
      description: "Chave/valor. Valores também aceitam templates.",
    },
    {
      name: "body",
      label: "Body",
      type: "json",
      description: "Ignorado em GET/HEAD. Objeto vira JSON; string é enviada como está.",
    },
    {
      name: "timeoutMs",
      label: "Timeout (ms)",
      type: "number",
      min: 0,
      placeholder: "10000",
    },
  ],
};

const postgres: NodeConfigSchema = {
  title: "Postgres",
  fields: [
    {
      name: "connectionString",
      label: "Connection string",
      type: "text",
      required: true,
      placeholder: "{{ env.DATABASE_URL }}",
      description: "Tipicamente vem de env vars do ambiente.",
    },
    {
      name: "query",
      label: "Query SQL",
      type: "code",
      language: "sql",
      required: true,
      placeholder: "SELECT id, name FROM users WHERE org_id = $1",
    },
    {
      name: "params",
      label: "Parâmetros",
      type: "json",
      placeholder: '["{{ input.orgId }}"]',
      description: "Array de valores casando com $1, $2…",
    },
  ],
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
  fields: [
    {
      name: "code",
      label: "Corpo da função",
      type: "code",
      language: "js",
      required: true,
      placeholder:
        "// `ctx` expõe { input, vars, env, steps }\nreturn { sum: (ctx.input.items ?? []).reduce((a, b) => a + b, 0) };",
    },
    {
      name: "timeoutMs",
      label: "Timeout (ms)",
      type: "number",
      min: 0,
      placeholder: "2000",
    },
  ],
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
const if_: NodeConfigSchema = {
  title: "Condição (IF)",
  description: "Bifurca em duas arestas rotuladas como `true` e `false`.",
  fields: [
    {
      name: "left",
      label: "Lado esquerdo",
      type: "text",
      placeholder: "{{ steps.fetch.body.id }}",
    },
    {
      name: "op",
      label: "Operador",
      type: "select",
      options: [
        { value: "eq", label: "= (eq)" },
        { value: "neq", label: "≠ (neq)" },
        { value: "gt", label: "> (gt)" },
        { value: "gte", label: "≥ (gte)" },
        { value: "lt", label: "< (lt)" },
        { value: "lte", label: "≤ (lte)" },
        { value: "contains", label: "contains" },
        { value: "truthy", label: "truthy" },
        { value: "falsy", label: "falsy" },
      ],
    },
    {
      name: "right",
      label: "Lado direito",
      type: "text",
      placeholder: "valor ou {{ template }}",
      visibleWhen: (v) => v.op !== "truthy" && v.op !== "falsy",
    },
  ],
};

const switch_: NodeConfigSchema = {
  title: "Switch",
  description:
    "Avalia `value` contra cada caso e segue a aresta com `label` correspondente. Sem match, usa `default`.",
  fields: [
    { name: "value", label: "Valor a comparar", type: "text", required: true },
    {
      name: "cases",
      label: "Casos",
      type: "json",
      placeholder:
        '[\n  { "match": "active", "label": "ativo" },\n  { "match": "off", "label": "inativo" }\n]',
      description: "Array de objetos `{ match, label }`.",
    },
    { name: "default", label: "Label default", type: "text", placeholder: "default" },
  ],
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
  fields: [
    {
      name: "workflowId",
      label: "Workflow ID",
      type: "text",
      required: true,
      placeholder: "uuid do workflow alvo",
    },
    {
      name: "input",
      label: "Input",
      type: "json",
      description: "Objeto passado como `input` do sub-run.",
    },
    {
      name: "environmentId",
      label: "Environment ID",
      type: "text",
      placeholder: "(opcional)",
    },
    {
      name: "timeoutMs",
      label: "Timeout (ms)",
      type: "number",
      min: 0,
      placeholder: "60000 (default 60s, máx 5min)",
    },
  ],
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
