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
export type DryRunChatMemoryInput = DryRunS3Input;
export type DryRunEmbeddingsInput = DryRunS3Input;
export type DryRunDocumentLoaderInput = DryRunS3Input;

export type DryRunCodeInput = {
  config: Record<string, unknown>;
  input?: Record<string, unknown>;
  vars?: Record<string, unknown>;
  steps?: Record<string, Record<string, unknown>>;
  environmentId?: string | null;
};

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

export function dryRunChatMemory(
  workflowId: string,
  nodeId: string,
  body: DryRunChatMemoryInput,
): Promise<DryRunResponse> {
  return unwrap(
    $fetch<DryRunResponse>(
      `/workflows/${workflowId}/nodes/${encodeURIComponent(nodeId)}/dry-run-chat-memory`,
      { method: "POST", body },
    ),
  );
}

export function dryRunEmbeddings(
  workflowId: string,
  nodeId: string,
  body: DryRunEmbeddingsInput,
): Promise<DryRunResponse> {
  return unwrap(
    $fetch<DryRunResponse>(
      `/workflows/${workflowId}/nodes/${encodeURIComponent(nodeId)}/dry-run-embeddings`,
      { method: "POST", body },
    ),
  );
}

export function dryRunDocumentLoader(
  workflowId: string,
  nodeId: string,
  body: DryRunDocumentLoaderInput,
): Promise<DryRunResponse> {
  return unwrap(
    $fetch<DryRunResponse>(
      `/workflows/${workflowId}/nodes/${encodeURIComponent(nodeId)}/dry-run-document-loader`,
      { method: "POST", body },
    ),
  );
}

export function dryRunCode(
  workflowId: string,
  nodeId: string,
  body: DryRunCodeInput,
): Promise<DryRunResponse> {
  return unwrap(
    $fetch<DryRunResponse>(
      `/workflows/${workflowId}/nodes/${encodeURIComponent(nodeId)}/dry-run-code`,
      { method: "POST", body },
    ),
  );
}

export type DryRunSplitInput = {
  config: Record<string, unknown>;
  input?: Record<string, unknown>;
  steps?: Record<string, Record<string, unknown>>;
};

export type DryRunSplitResponse =
  | { ok: true; output: Record<string, unknown>; nextLabel?: string; durationMs: number }
  | { ok: false; error: string; durationMs: number };

export function dryRunSplit(
  workflowId: string,
  nodeId: string,
  body: DryRunSplitInput,
): Promise<DryRunSplitResponse> {
  return unwrap(
    $fetch<DryRunSplitResponse>(
      `/workflows/${workflowId}/nodes/${encodeURIComponent(nodeId)}/dry-run-split`,
      { method: "POST", body },
    ),
  );
}

export function dryRunWait(
  workflowId: string,
  nodeId: string,
  body: { config: Record<string, unknown>; input?: Record<string, unknown> },
): Promise<DryRunResponse> {
  return unwrap(
    $fetch<DryRunResponse>(
      `/workflows/${workflowId}/nodes/${encodeURIComponent(nodeId)}/dry-run-wait`,
      { method: "POST", body },
    ),
  );
}

export type DryRunSetVarInput = {
  config: Record<string, unknown>;
  input?: Record<string, unknown>;
  vars?: Record<string, unknown>;
  steps?: Record<string, Record<string, unknown>>;
};

export type DryRunSetVarResponse =
  | { ok: true; output: Record<string, unknown>; vars?: Record<string, unknown>; durationMs: number }
  | { ok: false; error: string; durationMs: number };

export function dryRunSetVariable(
  workflowId: string,
  nodeId: string,
  body: DryRunSetVarInput,
): Promise<DryRunSetVarResponse> {
  return unwrap(
    $fetch<DryRunSetVarResponse>(
      `/workflows/${workflowId}/nodes/${encodeURIComponent(nodeId)}/dry-run-set-variable`,
      { method: "POST", body },
    ),
  );
}

export type DryRunCtxInput = {
  config: Record<string, unknown>;
  input?: Record<string, unknown>;
  vars?: Record<string, unknown>;
  steps?: Record<string, Record<string, unknown>>;
};

export function dryRunRespond(
  workflowId: string,
  nodeId: string,
  body: DryRunCtxInput,
): Promise<DryRunResponse> {
  return unwrap(
    $fetch<DryRunResponse>(
      `/workflows/${workflowId}/nodes/${encodeURIComponent(nodeId)}/dry-run-respond`,
      { method: "POST", body },
    ),
  );
}

export function dryRunAggregate(
  workflowId: string,
  nodeId: string,
  body: DryRunCtxInput,
): Promise<DryRunResponse> {
  return unwrap(
    $fetch<DryRunResponse>(
      `/workflows/${workflowId}/nodes/${encodeURIComponent(nodeId)}/dry-run-aggregate`,
      { method: "POST", body },
    ),
  );
}

export function dryRunDate(
  workflowId: string,
  nodeId: string,
  body: DryRunCtxInput,
): Promise<DryRunResponse> {
  return unwrap(
    $fetch<DryRunResponse>(
      `/workflows/${workflowId}/nodes/${encodeURIComponent(nodeId)}/dry-run-date`,
      { method: "POST", body },
    ),
  );
}
