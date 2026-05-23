/**
 * Cliente HTTP central da aplicação.
 *
 * Padronizamos todas as chamadas ao backend através de uma única instância
 * do `createFetch` do `@better-fetch/fetch`. Vantagens:
 *   - Inferência de tipos do response sem precisar tipar manualmente cada chamada.
 *   - Hooks centralizados (onRequest / onResponse / onError) para auth, telemetria
 *     e tratamento de 401.
 *   - Retry, timeout e validação por schema (Zod / StandardSchema) opcionais
 *     por chamada.
 *
 * Cada arquivo de domínio em `~/services/<dominio>.ts` importa o `$fetch`
 * exportado aqui — nunca chame `fetch` global direto.
 */
import {
  createFetch,
  BetterFetchError,
  type BetterFetchResponse,
  type ErrorContext,
  type RequestContext,
} from "@better-fetch/fetch";

/* -------------------------------------------------------------------------- */
/* Configuração                                                                */
/* -------------------------------------------------------------------------- */

/**
 * URL base do backend. Defina em `.env`:
 *   VITE_API_URL=https://api.exemplo.com
 *
 * Em dev sem env definida, cai em `/api` (útil pra proxy do Vite).
 */
export const API_BASE_URL: string = (import.meta.env.VITE_API_URL as string | undefined) ?? "/api";

/* -------------------------------------------------------------------------- */
/* Auth token (in-memory + localStorage no client)                             */
/* -------------------------------------------------------------------------- */

const TOKEN_KEY = "workflows.auth_token";

// Memória viva — `localStorage` é só persistência. Em SSR, fica `null`.
let authToken: string | null = null;

function readPersistedToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

// Hidrata do storage assim que o módulo carrega no cliente.
if (typeof window !== "undefined") {
  authToken = readPersistedToken();
}

export function getAuthToken(): string | null {
  return authToken;
}

export function setAuthToken(token: string | null): void {
  authToken = token;
  if (typeof window === "undefined") return;
  try {
    if (token) window.localStorage.setItem(TOKEN_KEY, token);
    else window.localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage indisponível (modo privado, quota) — segue só em memória */
  }
}

/* -------------------------------------------------------------------------- */
/* Hook de 401 — o app registra como reagir (ex.: redirect /auth)              */
/* -------------------------------------------------------------------------- */

type UnauthorizedHandler = () => void;
let onUnauthorizedHandler: UnauthorizedHandler | null = null;

export function onUnauthorized(handler: UnauthorizedHandler | null): void {
  onUnauthorizedHandler = handler;
}

/* -------------------------------------------------------------------------- */
/* Cliente $fetch                                                              */
/* -------------------------------------------------------------------------- */

export const $fetch = createFetch({
  baseURL: API_BASE_URL,
  // Envia cookies em chamadas cross-origin (caso o backend use sessão por cookie).
  credentials: "include",
  // Timeout padrão de 15s — pode ser sobrescrito por chamada.
  timeout: 15_000,
  // Retry leve para erros transientes; não tenta de novo em 4xx.
  retry: {
    type: "linear",
    attempts: 2,
    delay: 300,
  },

  hooks: {
    onRequest(ctx: RequestContext) {
      const token = getAuthToken();
      if (token) {
        ctx.headers.set("Authorization", `Bearer ${token}`);
      }
      // Garante JSON por padrão quando há body sem Content-Type definido.
      if (ctx.body && !ctx.headers.has("Content-Type")) {
        ctx.headers.set("Content-Type", "application/json");
      }
      return ctx;
    },
    onError(ctx: ErrorContext) {
      if (ctx.response?.status === 401) {
        setAuthToken(null);
        onUnauthorizedHandler?.();
      }
    },
  },
});

/* -------------------------------------------------------------------------- */
/* Tipos compartilhados                                                        */
/* -------------------------------------------------------------------------- */

/** Formato esperado do corpo de erro vindo do backend. */
export type ApiErrorBody = {
  message?: string;
  code?: string;
  details?: unknown;
};

export { BetterFetchError };
export type { BetterFetchResponse };

/**
 * Açúcar para chamadas onde queremos só o `data` e estourar exceção em erro.
 * Use quando o consumidor não precisa do par discriminado `{ data, error }`.
 *
 * Exemplo:
 *   const user = await unwrap($fetch<User>("/me"));
 */
export async function unwrap<T>(
  promise: Promise<BetterFetchResponse<T, ApiErrorBody>>,
): Promise<T> {
  const res = await promise;
  if (res.error) {
    const body = res.error as ApiErrorBody & { message?: string };
    throw new Error(body.message ?? "Erro na requisição");
  }
  return res.data as T;
}
