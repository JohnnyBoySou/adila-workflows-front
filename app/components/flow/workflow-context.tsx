/**
 * Contexto leve do canvas — expõe o `workflowId` corrente aos nós.
 *
 * React Flow registra `nodeTypes` como um mapa global; cada `WorkflowNode`
 * é um componente regular dentro da árvore do `ReactFlow`. Usamos context
 * pra evitar passar `workflowId` via `data` (mexer em todos os nodes a cada
 * troca de workflow seria custoso e quebraria o equality do `memo`).
 */
import { createContext, useContext } from "react";

const WorkflowIdContext = createContext<string | null>(null);

export const WorkflowIdProvider = WorkflowIdContext.Provider;

/** Retorna o `workflowId` corrente do canvas — `null` quando fora do provider. */
export function useWorkflowId(): string | null {
  return useContext(WorkflowIdContext);
}
