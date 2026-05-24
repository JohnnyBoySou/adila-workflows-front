import { $fetch, unwrap } from "./index";
import type { Trigger } from "./triggers";
import type { Workflow } from "./workflows";

export type WorkflowVersion = {
  id: string;
  workflowId: string;
  version: number;
  name: string | null;
  definitionHash: string | null;
  definition: Record<string, unknown>;
  createdBy: string;
  createdAt: string;
};

export type PublishVersionInput = {
  /** Rótulo opcional — ex: "release Black Friday". Sem nome = versão numerada silenciosa. */
  name?: string;
};

export function list(workflowId: string): Promise<WorkflowVersion[]> {
  return unwrap($fetch<WorkflowVersion[]>(`/workflows/${workflowId}/versions`));
}

export function findById(workflowId: string, versionId: string): Promise<WorkflowVersion | null> {
  return unwrap($fetch<WorkflowVersion>(`/workflows/${workflowId}/versions/${versionId}`));
}

/**
 * Publica o draft atual como versão imutável. Se o draft for idêntico à
 * última versão publicada (mesmo hash), o backend devolve 200 com a versão
 * existente — nenhuma linha nova é criada.
 *
 * Retorna a versão e um flag `alreadyExisted` para o front mostrar feedback
 * adequado ("v3 já era a versão mais recente" vs "v4 publicada").
 */
type PublishResponse = WorkflowVersion & { alreadyExisted: boolean };

export async function publish(
  workflowId: string,
  input?: PublishVersionInput,
): Promise<{ version: WorkflowVersion; alreadyExisted: boolean }> {
  const { alreadyExisted, ...version } = await unwrap(
    $fetch<PublishResponse>(`/workflows/${workflowId}/versions`, {
      method: "POST",
      body: input ?? {},
    }),
  );
  return { version, alreadyExisted };
}

export type VersionDiff = {
  nodes: {
    added: { id: string; type: string; label?: string }[];
    removed: { id: string; type: string; label?: string }[];
    changed: { id: string; type: string; label?: string; fields: string[] }[];
  };
  edges: { added: number; removed: number };
};

export type DiffResponse = {
  from: { id: string; version: number; name: string | null; createdAt: string };
  to: { id: string; version: number; name: string | null; createdAt: string };
  diff: VersionDiff;
};

/**
 * Compara duas versões publicadas. Retorna nodes added/removed/changed e
 * contagem agregada de edges added/removed. `position` (layout) é ignorado.
 */
export function diff(
  workflowId: string,
  fromVersionId: string,
  toVersionId: string,
): Promise<DiffResponse> {
  return unwrap(
    $fetch<DiffResponse>(
      `/workflows/${workflowId}/versions/${fromVersionId}/diff/${toVersionId}`,
    ),
  );
}

/**
 * Restaura a versão como `definition` corrente (draft). NÃO publica nova
 * versão nem promove triggers — só substitui o conteúdo do canvas.
 */
export type PromotedTrigger = {
  trigger: Trigger;
  previousWorkflowVersionId: string | null;
};

export type PromoteBulkResponse = {
  version: WorkflowVersion;
  promoted: PromotedTrigger[];
};

/**
 * Promove N triggers para a mesma versão em uma única chamada. `triggerIds`
 * omitido = todos os triggers do workflow. Rejeita o lote inteiro se algum
 * id não bater (não aceita promoções parciais silenciosas).
 */
export function promoteBulk(
  workflowId: string,
  versionId: string,
  triggerIds?: string[],
): Promise<PromoteBulkResponse> {
  return unwrap(
    $fetch<PromoteBulkResponse>(`/workflows/${workflowId}/versions/${versionId}/promote`, {
      method: "POST",
      body: triggerIds ? { triggerIds } : {},
    }),
  );
}

export function restore(workflowId: string, versionId: string): Promise<Workflow> {
  return unwrap(
    $fetch<Workflow>(`/workflows/${workflowId}/versions/${versionId}/restore`, {
      method: "POST",
    }),
  );
}
