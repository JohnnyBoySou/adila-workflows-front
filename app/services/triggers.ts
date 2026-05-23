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

  lastTriggeredAt: string | null;
  lastRunId: string | null;

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
};

export type CreateCronTriggerInput = {
  type: "cron";
  name: string;
  enabled?: boolean;
  environmentId?: string | null;
  nodeId?: string | null;
  cronExpression: string;
  timezone?: string;
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
 * URL pública para chamar o webhook. Inclui o token — qualquer um com essa
 * URL dispara o workflow, então trate como segredo.
 */
export function webhookUrl(token: string): string {
  const base = API_BASE_URL.replace(/\/$/, "");
  return `${base}/hooks/${token}`;
}
