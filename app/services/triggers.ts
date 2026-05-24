/**
 * Service de triggers (cron + webhook).
 *
 * Espelha as rotas em `/workflows/:id/triggers` do backend.
 * O endpoint público que recebe a chamada do webhook é montado em
 * `/hooks/:token` — montamos a URL a partir do `API_BASE_URL`.
 */
import { $fetch, API_BASE_URL, unwrap } from "./index";

export type TriggerType = "cron" | "webhook";
export type WebhookResponseMode = "async" | "sync";
export type WebhookMethod = "POST" | "GET" | "PUT" | "PATCH" | "DELETE";

export type Trigger = {
  id: string;
  organizationId: string;
  workflowId: string;
  environmentId: string | null;
  /** ID do node no canvas que representa este trigger. Nulo em triggers legacy. */
  nodeId: string | null;
  name: string;
  type: TriggerType;
  enabled: boolean;

  cronExpression: string | null;
  timezone: string | null;

  webhookToken: string | null;
  webhookResponseMode: WebhookResponseMode | null;
  webhookResponseTimeoutMs: number | null;
  /** Métodos HTTP aceitos no /hooks/:token. Default ['POST']. */
  allowedMethods: WebhookMethod[];
  /** True quando há segredo HMAC configurado (não devolve o valor — só presença). */
  hmacSecret: string | null;

  lastTriggeredAt: string | null;
  lastRunId: string | null;

  /**
   * Quando setado, o trigger dispara EXATAMENTE essa versão publicada.
   * Quando `null`, usa a latest published (ou auto-publica o draft na
   * primeira vez via `ensureLatest`).
   */
  workflowVersionId: string | null;

  createdAt: string;
  updatedAt: string;
};

export type CreateWebhookTriggerInput = {
  type: "webhook";
  name: string;
  enabled?: boolean;
  environmentId?: string | null;
  nodeId?: string | null;
  webhookResponseMode?: WebhookResponseMode;
  webhookResponseTimeoutMs?: number;
  allowedMethods?: WebhookMethod[];
  hmacSecret?: string | null;
  workflowVersionId?: string | null;
};

export type CreateCronTriggerInput = {
  type: "cron";
  name: string;
  enabled?: boolean;
  environmentId?: string | null;
  nodeId?: string | null;
  cronExpression: string;
  timezone?: string;
  workflowVersionId?: string | null;
};

export type CreateTriggerInput = CreateWebhookTriggerInput | CreateCronTriggerInput;

export type UpdateTriggerInput = {
  name?: string;
  enabled?: boolean;
  environmentId?: string | null;
  cronExpression?: string;
  timezone?: string;
  webhookResponseMode?: WebhookResponseMode;
  webhookResponseTimeoutMs?: number;
  allowedMethods?: WebhookMethod[];
  hmacSecret?: string | null;
};

export type WebhookInvocation = {
  id: string;
  status: "queued" | "running" | "success" | "failed" | "cancelled";
  input: Record<string, unknown>;
  output: Record<string, unknown> | null;
  error: Record<string, unknown> | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
};

export type WebhookHealth = {
  windowHours: number;
  total: number;
  success: number;
  failed: number;
  /** Taxa entre 0 e 1, ou null quando sem dados. */
  successRate: number | null;
  avgMs: number;
  p95Ms: number;
  series: { bucket: string; total: number; failed: number }[];
};

export function list(workflowId: string, type?: TriggerType): Promise<Trigger[]> {
  return unwrap(
    $fetch<Trigger[]>(`/workflows/${workflowId}/triggers`, {
      query: type ? { type } : undefined,
    }),
  );
}

export function create(workflowId: string, body: CreateTriggerInput): Promise<Trigger> {
  return unwrap(
    $fetch<Trigger>(`/workflows/${workflowId}/triggers`, {
      method: "POST",
      body,
    }),
  );
}

export function update(
  workflowId: string,
  triggerId: string,
  body: UpdateTriggerInput,
): Promise<Trigger> {
  return unwrap(
    $fetch<Trigger>(`/workflows/${workflowId}/triggers/${triggerId}`, {
      method: "PATCH",
      body,
    }),
  );
}

export function remove(workflowId: string, triggerId: string): Promise<void> {
  return unwrap(
    $fetch<void>(`/workflows/${workflowId}/triggers/${triggerId}`, {
      method: "DELETE",
    }),
  );
}

export function rotateToken(workflowId: string, triggerId: string): Promise<Trigger> {
  return unwrap(
    $fetch<Trigger>(`/workflows/${workflowId}/triggers/${triggerId}/rotate-token`, {
      method: "POST",
    }),
  );
}

/**
 * Move o pino de versão do trigger. Passar `null` despinpina (volta a
 * usar a latest published). O backend valida que a versão pertence ao
 * mesmo workflow e registra `trigger.promoted` no audit log.
 */
export function promote(
  workflowId: string,
  triggerId: string,
  workflowVersionId: string | null,
): Promise<Trigger> {
  return unwrap(
    $fetch<Trigger>(`/workflows/${workflowId}/triggers/${triggerId}/promote`, {
      method: "POST",
      body: { workflowVersionId },
    }),
  );
}

export function rotateHmac(
  workflowId: string,
  triggerId: string,
): Promise<{ trigger: Trigger; secret: string }> {
  return unwrap(
    $fetch<{ trigger: Trigger; secret: string }>(
      `/workflows/${workflowId}/triggers/${triggerId}/rotate-hmac`,
      { method: "POST" },
    ),
  );
}

export function clearHmac(workflowId: string, triggerId: string): Promise<Trigger> {
  return unwrap(
    $fetch<Trigger>(`/workflows/${workflowId}/triggers/${triggerId}/hmac`, {
      method: "DELETE",
    }),
  );
}

export function listInvocations(
  workflowId: string,
  triggerId: string,
  limit = 25,
): Promise<WebhookInvocation[]> {
  return unwrap(
    $fetch<WebhookInvocation[]>(
      `/workflows/${workflowId}/triggers/${triggerId}/invocations?limit=${limit}`,
    ),
  );
}

export function health(workflowId: string, triggerId: string): Promise<WebhookHealth> {
  return unwrap(
    $fetch<WebhookHealth>(`/workflows/${workflowId}/triggers/${triggerId}/health`),
  );
}

/**
 * URL pública para chamar o webhook. Inclui o token — qualquer um com essa
 * URL dispara o workflow, então trate como segredo.
 */
export function webhookUrl(token: string): string {
  const base = API_BASE_URL.replace(/\/$/, "");
  return `${base}/hooks/${token}`;
}
