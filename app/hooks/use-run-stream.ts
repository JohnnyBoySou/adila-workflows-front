/**
 * React hook que conecta no SSE de um run e expõe estado declarativo:
 *
 *   const { run, steps, status, error, isConnected } = useRunStream(workflowId, runId);
 *
 * Como funciona:
 *   - Recebe o snapshot inicial e popula `run` + `steps`.
 *   - Aplica step-start / step-success / step-failed na lista (upsert por index).
 *   - Aplica run-start / run-success / run-failed / run-cancelled em `status`
 *     e copia o output/error pra `run`.
 *   - Quando `runId` muda ou o componente desmonta, fecha o EventSource.
 *
 * Passa `enabled={false}` (ou `runId` nulo) pra não abrir conexão — útil quando
 * o run ainda nem foi criado.
 */
import { useEffect, useRef, useState } from "react";
import {
  subscribeToRunEvents,
  type RunSnapshot,
  type RunStepSnapshot,
  type RunStreamSubscription,
  type StepEvent,
  type RunLifecycleEvent,
} from "~/services/run-events";

export type UseRunStreamResult = {
  run: RunSnapshot | null;
  steps: RunStepSnapshot[];
  /** Atalho derivado de `run.status`; `null` enquanto não chegou o snapshot. */
  status: RunSnapshot["status"] | null;
  /** `true` enquanto o EventSource está aberto. */
  isConnected: boolean;
  /** Último erro de conexão SSE (se houve). */
  error: Event | null;
};

export type UseRunStreamOptions = {
  enabled?: boolean;
};

export function useRunStream(
  workflowId: string | null | undefined,
  runId: string | null | undefined,
  options: UseRunStreamOptions = {},
): UseRunStreamResult {
  const { enabled = true } = options;

  const [run, setRun] = useState<RunSnapshot | null>(null);
  const [steps, setSteps] = useState<RunStepSnapshot[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<Event | null>(null);

  // Guarda a sub atual pra fechar em re-runs do efeito.
  const subRef = useRef<RunStreamSubscription | null>(null);

  useEffect(() => {
    if (!enabled || !workflowId || !runId) return;

    // Reset ao trocar de run, senão o usuário vê resíduo do anterior.
    setRun(null);
    setSteps([]);
    setError(null);
    setIsConnected(true);

    const sub = subscribeToRunEvents(workflowId, runId, {
      onSnapshot: (evt) => {
        setRun(evt.run);
        setSteps(evt.steps);
      },
      onStepStart: (evt) => upsertStep(setSteps, evt),
      onStepSuccess: (evt) => upsertStep(setSteps, evt),
      onStepFailed: (evt) => upsertStep(setSteps, evt),
      onRunStart: (evt) => applyRunLifecycle(setRun, evt, "running"),
      onRunSuccess: (evt) => {
        applyRunLifecycle(setRun, evt, "success");
        setIsConnected(false);
      },
      onRunFailed: (evt) => {
        applyRunLifecycle(setRun, evt, "failed");
        setIsConnected(false);
      },
      onRunCancelled: (evt) => {
        applyRunLifecycle(setRun, evt, "cancelled");
        setIsConnected(false);
      },
      onError: (err) => {
        setError(err);
        // Se já fechou (terminal), não desmarca conectado novamente.
        if (sub.closed) setIsConnected(false);
      },
    });
    subRef.current = sub;

    return () => {
      sub.close();
      subRef.current = null;
      setIsConnected(false);
    };
  }, [workflowId, runId, enabled]);

  return {
    run,
    steps,
    status: run?.status ?? null,
    isConnected,
    error,
  };
}

/* -------------------------------------------------------------------------- */
/* Helpers — vivem fora pra evitar recriar a cada render                       */
/* -------------------------------------------------------------------------- */

function upsertStep(
  setSteps: React.Dispatch<React.SetStateAction<RunStepSnapshot[]>>,
  evt: StepEvent,
): void {
  setSteps((prev) => {
    // Match por `index` é o identificador estável durante a execução —
    // step-start e step-success do mesmo nó compartilham o mesmo index.
    const existingIdx = prev.findIndex((s) => s.index === evt.step.index);
    const next: RunStepSnapshot = {
      // Preserva campos que só o snapshot inicial tem (id, runId, startedAt),
      // se estiverem disponíveis — senão preenche com defaults razoáveis.
      id: existingIdx >= 0 ? prev[existingIdx]!.id : `pending-${evt.step.index}`,
      runId: evt.runId,
      index: evt.step.index,
      nodeId: evt.step.nodeId,
      nodeType: evt.step.nodeType,
      status: evt.step.status,
      output: evt.step.output ?? null,
      error: evt.step.error ?? null,
      startedAt:
        existingIdx >= 0
          ? (prev[existingIdx]!.startedAt ?? evt.at)
          : evt.type === "step-start"
            ? evt.at
            : null,
      finishedAt: evt.type === "step-start" ? null : evt.at,
      durationMs: evt.step.durationMs ?? null,
    };
    if (existingIdx >= 0) {
      const copy = prev.slice();
      copy[existingIdx] = next;
      return copy;
    }
    return [...prev, next];
  });
}

function applyRunLifecycle(
  setRun: React.Dispatch<React.SetStateAction<RunSnapshot | null>>,
  evt: RunLifecycleEvent,
  status: RunSnapshot["status"],
): void {
  setRun((prev) => {
    if (!prev) {
      // Caso raro: lifecycle antes do snapshot. Cria um stub mínimo que UI
      // pode renderizar — campos faltando ficam null/defaults.
      return {
        id: evt.runId,
        workflowId: "",
        workflowVersionId: null,
        organizationId: "",
        status,
        input: null,
        output: (evt.data?.output as Record<string, unknown> | undefined) ?? null,
        error: status === "failed" ? ((evt.data as Record<string, unknown>) ?? null) : null,
        jobId: null,
        cancelRequested: false,
        createdAt: evt.at,
        startedAt: status === "running" ? evt.at : null,
        finishedAt:
          status === "success" || status === "failed" || status === "cancelled" ? evt.at : null,
      };
    }
    const next: RunSnapshot = { ...prev, status };
    if (status === "running" && !prev.startedAt) {
      next.startedAt = evt.at;
    }
    if (status === "success" || status === "failed" || status === "cancelled") {
      next.finishedAt = evt.at;
    }
    if (status === "success" && evt.data?.output) {
      next.output = evt.data.output as Record<string, unknown>;
    }
    if (status === "failed" && evt.data) {
      next.error = evt.data as Record<string, unknown>;
    }
    return next;
  });
}
