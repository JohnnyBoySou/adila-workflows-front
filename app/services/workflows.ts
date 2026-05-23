/**
 * Service de workflows.
 *
 * Wrapper fino por cima do `$fetch` configurado em `~/services`. Reflete o
 * shape real do backend (Elysia / Drizzle) — não adicionar campos que não
 * existem no servidor.
 */
import { $fetch, unwrap } from "./index";

/* -------------------------------------------------------------------------- */
/* Tipos                                                                       */
/* -------------------------------------------------------------------------- */

export type WorkflowStatus = "draft" | "active" | "paused" | "archived";

/** Resumo retornado pela rota de listagem (linha da tabela `workflows`). */
export type WorkflowSummary = {
  id: string;
  organizationId: string;
  folderId: string | null;
  name: string;
  description: string | null;
  status: WorkflowStatus;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

export type Workflow = WorkflowSummary & {
  definition: Record<string, unknown>;
};

export type ListWorkflowsParams = {
  limit?: number;
  offset?: number;
  status?: WorkflowStatus;
  /** `"root"` → workflows sem pasta; UUID → workflows de uma pasta. */
  folderId?: string | "root";
};

export type Paginated<T> = {
  items: T[];
  total: number;
  limit: number;
  offset: number;
};

export type CreateWorkflowInput = {
  name: string;
  description?: string;
  folderId?: string | null;
  definition?: Record<string, unknown>;
};

export type UpdateWorkflowInput = {
  name?: string;
  description?: string | null;
  status?: WorkflowStatus;
  folderId?: string | null;
  definition?: Record<string, unknown>;
};

/* -------------------------------------------------------------------------- */
/* Chamadas                                                                    */
/* -------------------------------------------------------------------------- */

export function list(params: ListWorkflowsParams = {}): Promise<Paginated<WorkflowSummary>> {
  return unwrap(
    $fetch<Paginated<WorkflowSummary>>("/workflows", {
      query: {
        ...(params.limit !== undefined && { limit: params.limit }),
        ...(params.offset !== undefined && { offset: params.offset }),
        ...(params.status && { status: params.status }),
        ...(params.folderId && { folderId: params.folderId }),
      },
    }),
  );
}

export function get(id: string): Promise<Workflow> {
  return unwrap($fetch<Workflow>(`/workflows/${id}`));
}

export function create(input: CreateWorkflowInput): Promise<Workflow> {
  return unwrap(
    $fetch<Workflow>("/workflows", {
      method: "POST",
      body: input,
    }),
  );
}

export function update(id: string, input: UpdateWorkflowInput): Promise<Workflow> {
  return unwrap(
    $fetch<Workflow>(`/workflows/${id}`, {
      method: "PATCH",
      body: input,
    }),
  );
}

export function remove(id: string): Promise<void> {
  return unwrap(
    $fetch<void>(`/workflows/${id}`, {
      method: "DELETE",
    }),
  );
}

/** Dispara uma execução manual do workflow. */
export function run(
  id: string,
  opts: { environmentId?: string; input?: Record<string, unknown> } = {},
): Promise<{ runId: string; jobId?: string }> {
  return unwrap(
    $fetch<{ runId: string; jobId?: string }>(`/workflows/${id}/run`, {
      method: "POST",
      body: opts,
    }),
  );
}
