/**
 * Porte mínimo do `renderTemplate` do engine
 * (back/src/lib/engine/template.ts) para uso no front.
 *
 * Usado pelo `NodeConfigDialog` pra mostrar uma pré-visualização viva
 * do que um campo `{{ ... }}` resolverá em runtime, dado um sample
 * context — não tem efeitos colaterais e nunca lança.
 */

const TEMPLATE_RE = /\{\{\s*([^}]+?)\s*\}\}/g;
const WHOLE_TEMPLATE_RE = /^\{\{\s*([^}]+?)\s*\}\}$/;
const ANY_TEMPLATE_RE = /\{\{\s*[^}]+?\s*\}\}/;

/** Detecta se uma string contém ao menos um `{{ … }}`. */
export function hasTemplate(value: unknown): boolean {
  return typeof value === "string" && ANY_TEMPLATE_RE.test(value);
}

function resolvePath(obj: unknown, path: string): unknown {
  const parts = path.split(".");
  let current: unknown = obj;
  for (const part of parts) {
    if (current == null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

export function renderTemplate(value: unknown, ctx: Record<string, unknown>): unknown {
  if (typeof value === "string") {
    const whole = value.match(WHOLE_TEMPLATE_RE);
    if (whole) return resolvePath(ctx, whole[1]!);
    return value.replace(TEMPLATE_RE, (_, expr: string) => {
      const resolved = resolvePath(ctx, expr.trim());
      if (resolved == null) return "";
      return typeof resolved === "string" ? resolved : JSON.stringify(resolved);
    });
  }
  if (Array.isArray(value)) return value.map((v) => renderTemplate(v, ctx));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = renderTemplate(v, ctx);
    }
    return out;
  }
  return value;
}

/**
 * Sample context default — usado quando o canvas não fornece um real
 * (ex: último run). Estrutura espelha `ExecutionContext` do engine.
 */
export const DEFAULT_SAMPLE_CONTEXT: Record<string, unknown> = {
  input: {
    id: "01HGX9...",
    email: "user@example.com",
    payload: { items: [1, 2, 3] },
  },
  vars: {
    currentUser: { id: "user-1", name: "Maria" },
    threshold: 10,
  },
  env: {
    DATABASE_URL: "postgres://…",
    API_KEY: "…",
  },
  steps: {
    fetch: { body: { id: 42, name: "Item" }, rows: [{ id: 1 }, { id: 2 }] },
    "ai-1": { text: "Resposta do modelo" },
  },
};
