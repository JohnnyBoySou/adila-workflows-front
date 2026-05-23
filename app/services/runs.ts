/**
 * Service de execuções (workflow runs).
 *
 * Espelha as rotas em `/workflows/:id/runs` do backend.
 */
import { $fetch, unwrap } from "./index";

export type RunStatus = "queued" | "running" | "success" | "failed" | "cancelled";
export type StepStatus = "running" | "success" | "failed";

export type WorkflowRun = {
  id: string;
  workflowId: string;
  workflowVersionId: string | null;
  organizationId: string;
  status: RunStatus;
  input: Record<string, unknown> | null;
  output: Record<string, unknown> | null;
  error: Record<string, unknown> | null;
  jobId: string | null;
  cancelRequested: boolean;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
};

export type RunStep = {
  id: string;
  runId: string;
  index: number;
  nodeId: string;
  nodeType: string;
  status: StepStatus;
  /** Input que o nó recebeu — útil pra debug e pra alimentar templates no editor. */
  input: Record<string, unknown>;
  output: Record<string, unknown> | null;
  error: Record<string, unknown> | null;
  startedAt: string | null;
  finishedAt: string | null;
  durationMs: number | null;
};

export type ListRunsParams = {
  status?: RunStatus;
  limit?: number;
  offset?: number;
};

export function list(workflowId: string, params: ListRunsParams = {}): Promise<WorkflowRun[]> {
  return unwrap(
    $fetch<WorkflowRun[]>(`/workflows/${workflowId}/runs`, {
      query: {
        ...(params.status && { status: params.status }),
        ...(params.limit !== undefined && { limit: params.limit }),
        ...(params.offset !== undefined && { offset: params.offset }),
      },
    }),
  );
}

export function get(workflowId: string, runId: string): Promise<WorkflowRun> {
  return unwrap($fetch<WorkflowRun>(`/workflows/${workflowId}/runs/${runId}`));
}

export function listSteps(workflowId: string, runId: string): Promise<RunStep[]> {
  return unwrap($fetch<RunStep[]>(`/workflows/${workflowId}/runs/${runId}/steps`));
}

export function rerun(workflowId: string, runId: string): Promise<WorkflowRun> {
  return unwrap(
    $fetch<WorkflowRun>(`/workflows/${workflowId}/runs/${runId}/rerun`, { method: "POST" }),
  );
}

export function cancel(workflowId: string, runId: string): Promise<WorkflowRun> {
  return unwrap(
    $fetch<WorkflowRun>(`/workflows/${workflowId}/runs/${runId}/cancel`, { method: "POST" }),
  );
}
