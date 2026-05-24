import { useEffect, useState } from "react";

import { subscribeNotifications, type NotifyPayload } from "~/lib/notify";

type ActiveNotification = Required<Pick<NotifyPayload, "id">> & NotifyPayload;

/**
 * Renderiza o stack de toasts no canto inferior direito. Montar uma vez
 * na raiz da árvore (root.tsx ou layout) — `notify()` em qualquer lugar
 * dispara.
 */
export function NotificationsHost() {
  const [items, setItems] = useState<ActiveNotification[]>([]);

  useEffect(() => {
    return subscribeNotifications((n) => {
      setItems((prev) => [...prev, n]);
      const ttl = n.durationMs ?? 5000;
      setTimeout(() => {
        setItems((prev) => prev.filter((p) => p.id !== n.id));
      }, ttl);
    });
  }, []);

  if (items.length === 0) return null;

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-80 flex-col gap-2">
      {items.map((n) => (
        <div
          key={n.id}
          className="pointer-events-auto rounded-md border bg-popover px-3 py-2 text-popover-foreground shadow-md"
        >
          <div className="text-sm font-medium">{n.title}</div>
          {n.description ? (
            <div className="mt-0.5 line-clamp-3 text-xs text-muted-foreground">{n.description}</div>
          ) : null}
        </div>
      ))}
    </div>
  );
}
