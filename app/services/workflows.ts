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
  /** Busca substring case-insensitive sobre o nome. */
  q?: string;
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
        ...(params.q && params.q.trim() && { q: params.q.trim() }),
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

/* -------------------------------------------------------------------------- */
/* Import a partir do n8n                                                      */
/* -------------------------------------------------------------------------- */

/** Resumo de quantos nós o importer conseguiu mapear, ignorou ou marcou como não suportados. */
export type N8nImportSummary = {
  total: number;
  mapped: number;
  unsupported: number;
  skipped: number;
  /** Lista (ordenada) dos `type` do n8n que não temos handler ainda. */
  unsupportedTypes: string[];
};

export type ImportFromN8nInput = {
  /** JSON cru exportado pelo n8n. */
  workflow: Record<string, unknown>;
  /** Override do nome (opcional). */
  name?: string;
  /** UUID da pasta de destino, ou null pra raiz. */
  folderId?: string | null;
};

export function importFromN8n(
  input: ImportFromN8nInput,
): Promise<{ workflow: Workflow; summary: N8nImportSummary }> {
  return unwrap(
    $fetch<{ workflow: Workflow; summary: N8nImportSummary }>("/workflows/import/n8n", {
      method: "POST",
      body: input,
    }),
  );
}

/** Dispara uma execução manual do workflow. */
export function run(
  id: string,
  opts: {
    environmentId?: string;
    input?: Record<string, unknown>;
    /** Outputs pinados pelo editor — pulam o handler do nó no executor. */
    pinnedData?: Record<string, Record<string, unknown>>;
  } = {},
): Promise<{ runId: string; jobId?: string }> {
  return unwrap(
    $fetch<{ runId: string; jobId?: string }>(`/workflows/${id}/run`, {
      method: "POST",
      body: opts,
    }),
  );
}
