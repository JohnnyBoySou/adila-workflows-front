/**
 * Service de utilitários por-node (independente do tipo).
 *
 * Espelha as rotas em `/workflows/:id/nodes/:nodeId/...` do backend.
 */
import { $fetch, unwrap } from "./index";

export type NodeInvocationStatus =
  | "pending"
  | "running"
  | "success"
  | "failed"
  | "skipped"
  | "cancelled";

export type NodeInvocation = {
  id: string;
  runId: string;
  status: NodeInvocationStatus;
  input: Record<string, unknown>;
  output: Record<string, unknown> | null;
  error: Record<string, unknown> | null;
  startedAt: string | null;
  finishedAt: string | null;
  durationMs: number | null;
  createdAt: string;
};

export type DryRunHttpInput = {
  config: Record<string, unknown>;
  input?: Record<string, unknown>;
};

export type DryRunS3Input = {
  config: Record<string, unknown>;
  input?: Record<string, unknown>;
  environmentId?: string | null;
};

export type DryRunResponse =
  | { ok: true; output: Record<string, unknown>; durationMs: number }
  | { ok: false; error: string; durationMs: number };

/** Alias mantido por compatibilidade — usado pelo painel http_request. */
export type DryRunHttpResponse = DryRunResponse;

export function listInvocations(
  workflowId: string,
  nodeId: string,
  limit = 25,
): Promise<NodeInvocation[]> {
  return unwrap(
    $fetch<NodeInvocation[]>(
      `/workflows/${workflowId}/nodes/${encodeURIComponent(nodeId)}/invocations?limit=${limit}`,
    ),
  );
}

export function dryRunHttp(
  workflowId: string,
  nodeId: string,
  body: DryRunHttpInput,
): Promise<DryRunResponse> {
  return unwrap(
    $fetch<DryRunResponse>(
      `/workflows/${workflowId}/nodes/${encodeURIComponent(nodeId)}/dry-run-http`,
      { method: "POST", body },
    ),
  );
}

export function dryRunS3(
  workflowId: string,
  nodeId: string,
  body: DryRunS3Input,
): Promise<DryRunResponse> {
  return unwrap(
    $fetch<DryRunResponse>(
      `/workflows/${workflowId}/nodes/${encodeURIComponent(nodeId)}/dry-run-s3`,
      { method: "POST", body },
    ),
  );
}

export type DryRunVectorInput = DryRunS3Input;

export function dryRunVector(
  workflowId: string,
  nodeId: string,
  body: DryRunVectorInput,
): Promise<DryRunResponse> {
  return unwrap(
    $fetch<DryRunResponse>(
      `/workflows/${workflowId}/nodes/${encodeURIComponent(nodeId)}/dry-run-vector`,
      { method: "POST", body },
    ),
  );
}
