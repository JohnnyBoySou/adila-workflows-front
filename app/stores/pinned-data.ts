/**
 * Store de saídas pinadas no editor — chave por workflowId.nodeId.
 *
 * Persistido em localStorage pra sobreviver a reloads e troca de aba. Não
 * é enviado ao backend até o usuário disparar um run; aí vira `pinnedData`
 * no body do POST /run e o executor pula o handler do nó.
 *
 * Não usamos zustand/middleware/persist pra evitar dependência extra — a
 * persistência aqui é simples e síncrona (chave única por workflow).
 *
 * Por que por workflowId e não global?
 *   - Outputs são contextuais ao fluxo. Pinar `{foo: 1}` em um workflow não
 *     faz sentido em outro, mesmo que os nodeIds colidissem (são UUIDs, não
 *     colidem, mas o agrupamento é a abstração certa).
 *   - Limpeza fica natural: apagar workflow remove o pin associado (TODO).
 */
import { useSyncExternalStore } from "react";

type WorkflowPins = Record<string, Record<string, unknown>>;
type AllPins = Record<string, WorkflowPins>;

const STORAGE_KEY = "adila.pinned-data.v1";

function readStorage(): AllPins {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") return parsed as AllPins;
    return {};
  } catch {
    return {};
  }
}

function writeStorage(value: AllPins): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    // Storage cheio / safari privado — silencioso. Pin é conveniência, não estado crítico.
  }
}

// Snapshot reativo via useSyncExternalStore. Listeners simples — não tem
// muita coisa pra otimizar (poucas mudanças, poucos consumers).
let snapshot: AllPins = readStorage();
const listeners = new Set<() => void>();

function notify() {
  for (const l of listeners) l();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): AllPins {
  return snapshot;
}

// Sincroniza entre abas do mesmo browser. Não é crítico, mas evita confusão
// se o usuário tem duas abas do mesmo workflow.
if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key !== STORAGE_KEY) return;
    snapshot = readStorage();
    notify();
  });
}

function update(mutator: (current: AllPins) => AllPins): void {
  const next = mutator(snapshot);
  snapshot = next;
  writeStorage(next);
  notify();
}

/* -------------------------------------------------------------------------- */
/* API pública                                                                 */
/* -------------------------------------------------------------------------- */

export const pinnedDataApi = {
  /** Retorna os pins do workflow (vazio se nenhum). */
  get(workflowId: string): Record<string, Record<string, unknown>> {
    return snapshot[workflowId] ?? {};
  },

  set(workflowId: string, nodeId: string, output: Record<string, unknown>): void {
    update((cur) => {
      const wf = { ...(cur[workflowId] ?? {}), [nodeId]: output };
      return { ...cur, [workflowId]: wf };
    });
  },

  remove(workflowId: string, nodeId: string): void {
    update((cur) => {
      const wf = { ...(cur[workflowId] ?? {}) };
      delete wf[nodeId];
      if (Object.keys(wf).length === 0) {
        const next = { ...cur };
        delete next[workflowId];
        return next;
      }
      return { ...cur, [workflowId]: wf };
    });
  },

  clear(workflowId: string): void {
    update((cur) => {
      if (!cur[workflowId]) return cur;
      const next = { ...cur };
      delete next[workflowId];
      return next;
    });
  },
};

/** Hook reativo — retorna o mapa de pins do workflow. */
export function usePinnedData(workflowId: string): Record<string, Record<string, unknown>> {
  // useSyncExternalStore espera referência estável; getSnapshot devolve o
  // mapa global e fazemos slice por workflow aqui (cheap shallow access).
  // Re-render dispara em qualquer mudança de pins — aceitável pelo volume.
  const all = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return all[workflowId] ?? {};
}

/** Hook fino: só checa se um nó está pinado. */
export function useIsPinned(workflowId: string, nodeId: string | null): boolean {
  const map = usePinnedData(workflowId);
  return nodeId != null && nodeId in map;
}
