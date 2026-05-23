import { $fetch, unwrap } from "./index";

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
