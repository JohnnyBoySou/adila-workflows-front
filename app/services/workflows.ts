/**
 * Service de workflows.
 *
 * Exemplo de service de domínio: todas as chamadas passam pelo `$fetch`
 * configurado em `~/services` — sem refazer baseURL, headers ou auth aqui.
 */
import { $fetch, unwrap } from "./index";

/* -------------------------------------------------------------------------- */
/* Tipos                                                                       */
/* -------------------------------------------------------------------------- */

export type WorkflowStatus = "active" | "paused" | "draft";

/** Ambientes lógicos onde workflows são executados. */
export type EnvironmentId = "production" | "staging" | "development";

export type Environment = {
  id: EnvironmentId;
  name: string;
};

/**
 * Pasta dentro de um ambiente. `parentId` define a hierarquia.
 * Pastas raiz têm `parentId: null`.
 */
export type Folder = {
  id: string;
  name: string;
  parentId: string | null;
  environmentId: EnvironmentId;
  updatedAt: string;
};

export type WorkflowSummary = {
  id: string;
  name: string;
  status: WorkflowStatus;
  runsLast24h: number;
  lastRunAt: string | null;
  updatedAt: string;
  folderId: string | null;
  environmentId: EnvironmentId;
};

export type WorkflowNode = {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: Record<string, unknown>;
};

export type WorkflowEdge = {
  id: string;
  source: string;
  target: string;
};

export type Workflow = {
  id: string;
  name: string;
  status: WorkflowStatus;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  createdAt: string;
  updatedAt: string;
};

export type CreateWorkflowInput = {
  name: string;
  nodes?: WorkflowNode[];
  edges?: WorkflowEdge[];
};

export type UpdateWorkflowInput = Partial<CreateWorkflowInput> & {
  status?: WorkflowStatus;
};

/* -------------------------------------------------------------------------- */
/* Chamadas                                                                    */
/* -------------------------------------------------------------------------- */

export function list(): Promise<WorkflowSummary[]> {
  return unwrap($fetch<WorkflowSummary[]>("/workflows"));
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
export function run(id: string): Promise<{ runId: string }> {
  return unwrap(
    $fetch<{ runId: string }>(`/workflows/${id}/run`, {
      method: "POST",
    }),
  );
}
