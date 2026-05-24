/**
 * Bus de notificações in-app simples (sem dependência externa).
 * Quem produz chama `notify({ title, description, ... })`. Quem consome
 * monta `<NotificationsHost />` (componente irmão) — apenas uma vez na
 * raiz da árvore — e ele renderiza um stack de toasts no canto.
 */
export type NotifyPayload = {
  id?: string;
  title: string;
  description?: string;
  durationMs?: number;
};

type Listener = (payload: Required<Pick<NotifyPayload, "id">> & NotifyPayload) => void;

const listeners = new Set<Listener>();

export function notify(payload: NotifyPayload): void {
  const id = payload.id ?? `n_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const enriched = { ...payload, id, durationMs: payload.durationMs ?? 5000 };
  for (const l of listeners) l(enriched);
}

export function subscribeNotifications(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
