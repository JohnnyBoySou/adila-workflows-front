/**
 * Store de execução em foco — alimenta o overlay visual no canvas.
 *
 * Por que Zustand aqui (e não TanStack Query)?
 *   - Cada `WorkflowNode` lê apenas o status do **seu** nodeId. Com seletor
 *     fino, só o nó cujo status mudou re-renderiza — TanStack Query
 *     re-renderizaria o canvas inteiro a cada `setQueryData`.
 *   - É estado derivado e efêmero: o painel de execuções alimenta com base
 *     nos steps que vêm do SSE/REST; o canvas só lê.
 */
import { create } from "zustand";

import type { StepStatus } from "~/services/runs";

export type NodeExecutionStatus = StepStatus;

type ExecutionState = {
  /** Run em foco — `null` significa "sem overlay de execução". */
  focusedRunId: string | null;
  /** Status por nodeId do workflow no run em foco. */
  statusByNodeId: Record<string, NodeExecutionStatus>;
  setFocused: (
    runId: string | null,
    statuses?: Record<string, NodeExecutionStatus>,
  ) => void;
  setNodeStatus: (nodeId: string, status: NodeExecutionStatus) => void;
  clear: () => void;
};

export const useExecutionStore = create<ExecutionState>()((set) => ({
  focusedRunId: null,
  statusByNodeId: {},
  setFocused: (runId, statuses = {}) =>
    set({ focusedRunId: runId, statusByNodeId: { ...statuses } }),
  setNodeStatus: (nodeId, status) =>
    set((s) => ({ statusByNodeId: { ...s.statusByNodeId, [nodeId]: status } })),
  clear: () => set({ focusedRunId: null, statusByNodeId: {} }),
}));
