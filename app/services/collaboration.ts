/**
 * Cliente da gateway de colaboração em tempo real.
 *
 * O backend expõe um serviço Elysia separado em PORT+1 (ver `scripts/realtime.ts`)
 * com:
 *   GET  /rooms/:workflowId/document   → snapshot + patches yjs
 *   POST /rooms/:workflowId/snapshot   → upload de snapshot (owner/admin)
 *   GET  /rooms/:workflowId/presence   → snapshot da presença + TTLs
 *   WS   /ws/:workflowId               → presença + yjs.update broadcast
 *
 * Em dev, `VITE_API_URL=http://localhost:3000` → realtime em `:3001`.
 * Em prod, defina `VITE_REALTIME_URL` apontando para o gateway publicado.
 */
import { API_BASE_URL } from "./index";

/**
 * Deriva URL do realtime a partir da URL da API:
 *  - dev (http + porta explícita): `PORT + 1` (ex.: 3000 → 3001)
 *  - prod (https sem porta): troca subdomain `api.` por `realtime.`
 *    (ex.: https://api.foo.com → https://realtime.foo.com)
 *
 * Convenção de prod evita depender de `VITE_REALTIME_URL` em build —
 * env de Vite tem que estar setada no momento do `vite build`, e isso
 * varia entre PaaS (build args vs runtime). O override segue funcionando
 * pra quem precisar.
 */
function deriveRealtimeFromApi(apiUrl: string): string {
  try {
    const u = new URL(apiUrl, typeof window !== "undefined" ? window.location.origin : "http://localhost");
    if (u.protocol === "https:" && !u.port) {
      u.hostname = u.hostname.replace(/^api\./, "realtime.");
      return u.toString().replace(/\/$/, "");
    }
    const basePort = u.port ? Number(u.port) : 80;
    u.port = String(basePort + 1);
    return u.toString().replace(/\/$/, "");
  } catch {
    return apiUrl;
  }
}

const RAW_RT = import.meta.env.VITE_REALTIME_URL as string | undefined;
export const REALTIME_HTTP_URL: string = RAW_RT ?? deriveRealtimeFromApi(API_BASE_URL);
export const REALTIME_WS_URL: string = REALTIME_HTTP_URL.replace(/^http/, "ws");

export type Cursor = { x: number; y: number };
export type Viewport = { x: number; y: number; zoom: number };

export type Presence = {
  userId: string;
  workflowId: string;
  cursor: Cursor;
  selectedNodeId?: string;
  viewport?: Viewport;
  updatedAt: number;
};

export type PresenceSnapshot = {
  workflowId: string;
  ttlSeconds: number;
  heartbeatSeconds: number;
  users: Presence[];
};

export type DocumentSnapshot = {
  workflowId: string;
  snapshot: { id: string; updateBase64: string } | null;
  patches: Array<{ id: string; updateBase64: string; at: string }>;
};

export type AwarenessEvent =
  | { type: "room.ready"; workflowId: string; connectionId: string }
  | { type: "user.joined"; workflowId: string; presence: Presence }
  | { type: "user.left"; workflowId: string; userId: string }
  | { type: "cursor.move"; workflowId: string; presence: Presence }
  | { type: "node.selected"; workflowId: string; presence: Presence }
  | { type: "viewport.changed"; workflowId: string; presence: Presence }
  | { type: "yjs.update"; workflowId: string; updateBase64: string; at: number }
  | { type: "error"; error: string };

export type OutgoingMessage = {
  type:
    | "user.joined"
    | "cursor.move"
    | "node.selected"
    | "viewport.changed"
    | "yjs.update";
  userId: string;
  cursor?: Cursor;
  selectedNodeId?: string;
  viewport?: Viewport;
  updateBase64?: string;
};

export async function fetchDocument(workflowId: string): Promise<DocumentSnapshot> {
  const res = await fetch(`${REALTIME_HTTP_URL}/rooms/${workflowId}/document`, {
    credentials: "include",
  });
  if (!res.ok) throw new Error(`document fetch failed: ${res.status}`);
  return res.json();
}

export async function fetchPresence(workflowId: string): Promise<PresenceSnapshot> {
  const res = await fetch(`${REALTIME_HTTP_URL}/rooms/${workflowId}/presence`, {
    credentials: "include",
  });
  if (!res.ok) throw new Error(`presence fetch failed: ${res.status}`);
  return res.json();
}

export function buildWsUrl(workflowId: string): string {
  return `${REALTIME_WS_URL}/ws/${workflowId}`;
}
