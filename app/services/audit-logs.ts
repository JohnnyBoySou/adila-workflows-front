import { $fetch, unwrap } from "./index";

export type AuditLog = {
  id: string;
  organizationId: string;
  actorUserId: string | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  metadata: Record<string, unknown>;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
};

export type ListAuditLogsParams = {
  /** Verbo exato, ex: "trigger.promoted". */
  action?: string;
  resourceType?: string;
  resourceId?: string;
  /** Filtra por `metadata.workflowId` — útil pra timeline por workflow. */
  workflowId?: string;
  actorUserId?: string;
  limit?: number;
  offset?: number;
};

export function list(params: ListAuditLogsParams = {}): Promise<AuditLog[]> {
  const query: Record<string, string> = {};
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    query[k] = String(v);
  }
  return unwrap(
    $fetch<AuditLog[]>("/audit-logs", {
      query: Object.keys(query).length ? query : undefined,
    }),
  );
}
