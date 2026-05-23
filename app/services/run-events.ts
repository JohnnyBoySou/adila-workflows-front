/**
 * Consumer de Server-Sent Events para um workflow run.
 *
 * O backend (Elysia + Redis pub/sub) expõe:
 *   GET /workflows/:workflowId/runs/:runId/stream
 *
 * Eventos emitidos (cada um vem como `event: <type>` + `data: <json>`):
 *   - `snapshot`        — estado inicial: { run, steps }
 *   - `run-start`       — worker pegou o job e marcou running
 *   - `step-start`      — nó começou a executar
 *   - `step-success`    — nó terminou OK (com output e duração)
 *   - `step-failed`     — nó falhou (com error e duração)
 *   - `run-success`     — run completou com sucesso (terminal)
 *   - `run-failed`      — run falhou (terminal)
 *   - `run-cancelled`   — cancelamento cooperativo (terminal)
 *   - `ping`            — heartbeat a cada 20s (não exposto ao consumidor)
 *
 * Em terminais o servidor fecha o stream; o EventSource pode tentar reconectar
 * automaticamente — por isso a gente chama `close()` explicitamente no handler.
 *
 * Auth: EventSource só carrega cookies (com `withCredentials`); não suporta
 * Authorization header. O backend aceita ambos, então cookie basta.
 */
import { API_BASE_URL } from "./index";

/* -------------------------------------------------------------------------- */
/* Tipos espelhando src/lib/run-events.ts no backend                           */
/* -------------------------------------------------------------------------- */

export type RunStatus = "queued" | "running" | "success" | "failed" | "cancelled";
export type StepStatus = "running" | "success" | "failed";

export type RunStepSnapshot = {
  id: string;
  runId: string;
  index: number;
  nodeId: string;
  nodeType: string;
  status: StepStatus;
  output: Record<string, unknown> | null;
  error: Record<string, unknown> | null;
  startedAt: string | null;
  finishedAt: string | null;
  durationMs: number | null;
};

export type RunSnapshot = {
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

export type SnapshotEvent = {
  type: "snapshot";
  run: RunSnapshot;
  steps: RunStepSnapshot[];
};

export type RunLifecycleEvent = {
  type: "run-start" | "run-success" | "run-failed" | "run-cancelled";
  runId: string;
  at: string;
  data?: Record<string, unknown>;
};

export type StepEvent = {
  type: "step-start" | "step-success" | "step-failed";
  runId: string;
  at: string;
  step: {
    index: number;
    nodeId: string;
    nodeType: string;
    status: StepStatus;
    output?: Record<string, unknown> | null;
    error?: Record<string, unknown> | null;
    durationMs?: number | null;
  };
};

export type RunStreamEvent = SnapshotEvent | RunLifecycleEvent | StepEvent;

const TERMINAL_TYPES = new Set<RunStreamEvent["type"]>([
  "run-success",
  "run-failed",
  "run-cancelled",
]);

/* -------------------------------------------------------------------------- */
/* Handlers                                                                    */
/* -------------------------------------------------------------------------- */

export type RunStreamHandlers = {
  onSnapshot?: (event: SnapshotEvent) => void;
  onRunStart?: (event: RunLifecycleEvent) => void;
  onStepStart?: (event: StepEvent) => void;
  onStepSuccess?: (event: StepEvent) => void;
  onStepFailed?: (event: StepEvent) => void;
  onRunSuccess?: (event: RunLifecycleEvent) => void;
  onRunFailed?: (event: RunLifecycleEvent) => void;
  onRunCancelled?: (event: RunLifecycleEvent) => void;
  /** Recebe todos os eventos — útil pra logar/depurar. */
  onAny?: (event: RunStreamEvent) => void;
  /** Erro de conexão SSE (network, 404, 401). */
  onError?: (err: Event) => void;
};

/** Controlador devolvido pela subscribe — chame `close()` para encerrar. */
export type RunStreamSubscription = {
  close: () => void;
  readonly closed: boolean;
};

/* -------------------------------------------------------------------------- */
/* subscribeToRunEvents                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Abre um EventSource para o run e dispara handlers conforme os eventos
 * chegam. Auto-fecha em eventos terminais para evitar reconexão silenciosa
 * do navegador.
 */
export function subscribeToRunEvents(
  workflowId: string,
  runId: string,
  handlers: RunStreamHandlers,
): RunStreamSubscription {
  // `API_BASE_URL` pode ser `/api` (proxy) ou absoluto (`https://api...`).
  // EventSource aceita ambos — relativo resolve contra o origin atual.
  const url = `${API_BASE_URL}/workflows/${workflowId}/runs/${runId}/stream`;
  const es = new EventSource(url, { withCredentials: true });

  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    es.close();
  };

  const parse = <T extends RunStreamEvent>(raw: MessageEvent): T | null => {
    try {
      return JSON.parse(raw.data) as T;
    } catch {
      // Servidor não deveria mandar payload inválido; ignora silenciosamente.
      return null;
    }
  };

  const dispatch = (event: RunStreamEvent) => {
    handlers.onAny?.(event);
    if (TERMINAL_TYPES.has(event.type)) {
      // Backend já vai fechar o stream; só evitamos o auto-retry do EventSource.
      close();
    }
  };

  es.addEventListener("snapshot", (e) => {
    const evt = parse<SnapshotEvent>(e as MessageEvent);
    if (!evt) return;
    handlers.onSnapshot?.(evt);
    dispatch(evt);
  });

  es.addEventListener("run-start", (e) => {
    const evt = parse<RunLifecycleEvent>(e as MessageEvent);
    if (!evt) return;
    handlers.onRunStart?.(evt);
    dispatch(evt);
  });

  es.addEventListener("step-start", (e) => {
    const evt = parse<StepEvent>(e as MessageEvent);
    if (!evt) return;
    handlers.onStepStart?.(evt);
    dispatch(evt);
  });

  es.addEventListener("step-success", (e) => {
    const evt = parse<StepEvent>(e as MessageEvent);
    if (!evt) return;
    handlers.onStepSuccess?.(evt);
    dispatch(evt);
  });

  es.addEventListener("step-failed", (e) => {
    const evt = parse<StepEvent>(e as MessageEvent);
    if (!evt) return;
    handlers.onStepFailed?.(evt);
    dispatch(evt);
  });

  es.addEventListener("run-success", (e) => {
    const evt = parse<RunLifecycleEvent>(e as MessageEvent);
    if (!evt) return;
    handlers.onRunSuccess?.(evt);
    dispatch(evt);
  });

  es.addEventListener("run-failed", (e) => {
    const evt = parse<RunLifecycleEvent>(e as MessageEvent);
    if (!evt) return;
    handlers.onRunFailed?.(evt);
    dispatch(evt);
  });

  es.addEventListener("run-cancelled", (e) => {
    const evt = parse<RunLifecycleEvent>(e as MessageEvent);
    if (!evt) return;
    handlers.onRunCancelled?.(evt);
    dispatch(evt);
  });

  // `ping` é só heartbeat — não propagamos.
  es.addEventListener("ping", () => {});

  es.onerror = (err) => {
    handlers.onError?.(err);
    // Em runs terminais o servidor fecha — o EventSource gera onerror nesse
    // caso também. Se já estamos fechados, não faz sentido propagar mais.
    if (es.readyState === EventSource.CLOSED) close();
  };

  return {
    close,
    get closed() {
      return closed;
    },
  };
}
