/**
 * Store de execução em foco — alimenta o overlay visual no canvas e o
 * inspector lateral de cada nó.
 *
 * Por que Zustand aqui (e não TanStack Query)?
 *   - Cada `WorkflowNode` lê apenas o status do **seu** nodeId. Com seletor
 *     fino, só o nó cujo status mudou re-renderiza — TanStack Query
 *     re-renderizaria o canvas inteiro a cada `setQueryData`.
 *   - É estado derivado e efêmero: o painel de execuções alimenta com base
 *     nos steps que vêm do SSE/REST; o canvas e o inspector só leem.
 *
 * Guardamos o `RunStep` inteiro (input/output/error/duration/timings) porque
 * o inspector lateral precisa de tudo — não só do status. Indexado por
 * `nodeId` pra que cada nó leia o seu sem varrer a lista.
 */
import { create } from "zustand";

import type { RunStep, StepStatus } from "~/services/runs";

export type NodeExecutionStatus = StepStatus;

type ExecutionState = {
  /** Run em foco — `null` significa "sem overlay de execução". */
  focusedRunId: string | null;
  /** Step completo (input/output/…) por nodeId do run em foco. */
  stepsByNodeId: Record<string, RunStep>;
  /**
   * Alimenta o store a partir da lista de steps de um run. Faz índice por
   * `nodeId` numa única passada — chamado pelo `RunDetailPanel` quando os
   * steps chegam via REST/SSE.
   */
  setFocused: (runId: string | null, steps?: RunStep[]) => void;
  /**
   * Atualiza um único step (chamado por eventos de step do SSE pra evitar
   * substituir a lista inteira a cada tick).
   */
  upsertStep: (step: RunStep) => void;
  clear: () => void;
};

function indexByNodeId(steps: RunStep[]): Record<string, RunStep> {
  const out: Record<string, RunStep> = {};
  for (const s of steps) {
    // Se o mesmo nó aparece duas vezes (split-in-batches etc.), o último
    // ganha — é o comportamento esperado pelo inspector ("último estado").
    out[s.nodeId] = s;
  }
  return out;
}

export const useExecutionStore = create<ExecutionState>()((set) => ({
  focusedRunId: null,
  stepsByNodeId: {},
  setFocused: (runId, steps = []) =>
    set({ focusedRunId: runId, stepsByNodeId: indexByNodeId(steps) }),
  upsertStep: (step) =>
    set((s) => ({ stepsByNodeId: { ...s.stepsByNodeId, [step.nodeId]: step } })),
  clear: () => set({ focusedRunId: null, stepsByNodeId: {} }),
}));

/** Selector helper — status do nó pro overlay no canvas. */
export function selectNodeStatus(
  nodeId: string,
): (s: ExecutionState) => NodeExecutionStatus | undefined {
  return (s) => s.stepsByNodeId[nodeId]?.status;
}
