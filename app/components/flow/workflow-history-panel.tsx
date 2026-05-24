/**
 * Timeline de eventos do pipeline de versionamento por workflow.
 *
 * Consome `GET /audit-logs?workflowId=:id` filtrando pelos verbos relevantes:
 * `workflow_version.published`, `workflow_version.renamed`,
 * `trigger.promoted`, `workflow.restored_from_version`, `workflow.promoted`
 * (bulk). Ignora ruído (`trigger.updated`, `workflow.updated`) pra a aba
 * funcionar como "histórico de release", não "auditoria geral".
 */
import { useQuery } from "@tanstack/react-query";
import { Clock, GitBranch, RotateCcw, Rocket, Tag } from "lucide-react";

import { queryKeys } from "~/lib/query-keys";
import * as auditLogs from "~/services/audit-logs";

type Props = {
  workflowId: string;
};

const RELEASE_ACTIONS = new Set<string>([
  "workflow_version.published",
  "workflow_version.renamed",
  "trigger.promoted",
  "workflow.promoted",
  "workflow.restored_from_version",
]);

export function WorkflowHistoryPanel({ workflowId }: Props) {
  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.auditLogs.byWorkflow(workflowId),
    queryFn: () => auditLogs.list({ workflowId, limit: 100 }),
    enabled: Boolean(workflowId),
  });

  if (isLoading) {
    return <p className="px-1 text-xs text-muted-foreground">Carregando histórico…</p>;
  }
  if (error) {
    return (
      <p className="px-1 text-xs text-destructive">
        Falha ao carregar histórico — verifique permissões (admin+).
      </p>
    );
  }
  const events = (data ?? []).filter((e) => RELEASE_ACTIONS.has(e.action));

  if (events.length === 0) {
    return (
      <p className="px-1 text-xs text-muted-foreground">
        Nenhum evento de release ainda. Publique uma versão pra começar a timeline.
      </p>
    );
  }

  return (
    <ol className="flex flex-col gap-3">
      {events.map((e) => (
        <li
          key={e.id}
          className="flex items-start gap-3 rounded-md border border-border bg-card px-3 py-2.5"
        >
          <ActionIcon action={e.action} />
          <div className="min-w-0 flex-1">
            <p className="text-sm">{describe(e)}</p>
            <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
              <Clock className="size-3" aria-hidden />
              {formatDate(e.createdAt)}
              {e.actorUserId && (
                <>
                  <span aria-hidden>·</span>
                  <span className="truncate" title={e.actorUserId}>
                    {e.actorUserId}
                  </span>
                </>
              )}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}

function ActionIcon({ action }: { action: string }) {
  const cls = "size-4 shrink-0 text-muted-foreground";
  if (action === "workflow_version.published") return <Tag className={cls} aria-hidden />;
  if (action === "workflow_version.renamed") return <Tag className={cls} aria-hidden />;
  if (action === "trigger.promoted") return <Rocket className={cls} aria-hidden />;
  if (action === "workflow.promoted") return <Rocket className={cls} aria-hidden />;
  if (action === "workflow.restored_from_version") return <RotateCcw className={cls} aria-hidden />;
  return <GitBranch className={cls} aria-hidden />;
}

function describe(e: auditLogs.AuditLog): React.ReactNode {
  const m = e.metadata as Record<string, unknown>;
  const v = typeof m.version === "number" ? `v${m.version}` : undefined;
  switch (e.action) {
    case "workflow_version.published":
      return (
        <>
          Publicou <strong>{v ?? "versão"}</strong>
          {typeof m.name === "string" && m.name ? <> — “{m.name}”</> : null}
        </>
      );
    case "workflow_version.renamed":
      return (
        <>
          Renomeou {v ?? "versão"}: <em>{labelOrEmpty(m.from)}</em> → <em>{labelOrEmpty(m.to)}</em>
        </>
      );
    case "trigger.promoted":
      return (
        <>
          Promoveu trigger <code className="text-xs">{stringOr(m.triggerName, e.resourceId)}</code>{" "}
          {m.from && m.to ? (
            <>
              de <code className="text-xs">{shortId(m.from)}</code> → <code className="text-xs">{shortId(m.to)}</code>
            </>
          ) : m.to ? (
            <>para <code className="text-xs">{shortId(m.to)}</code></>
          ) : (
            <>(despinpinou — volta a latest)</>
          )}
        </>
      );
    case "workflow.promoted":
      return (
        <>
          Release bulk — promoveu {countTriggers(m)} trigger(s) para{" "}
          <code className="text-xs">{shortId(m.workflowVersionId)}</code>
        </>
      );
    case "workflow.restored_from_version":
      return (
        <>
          Restaurou {v ?? "versão"} como draft (pendente de publicação)
        </>
      );
    default:
      return <code className="text-xs">{e.action}</code>;
  }
}

function labelOrEmpty(v: unknown): string {
  if (typeof v === "string" && v) return v;
  return "sem nome";
}

function stringOr(v: unknown, fallback: string | null): string {
  if (typeof v === "string" && v) return v;
  return fallback ?? "—";
}

function shortId(v: unknown): string {
  if (typeof v !== "string") return "—";
  return v.length > 8 ? `${v.slice(0, 8)}…` : v;
}

function countTriggers(m: Record<string, unknown>): number {
  const ids = m.triggerIds;
  if (Array.isArray(ids)) return ids.length;
  const promoted = m.promoted;
  if (Array.isArray(promoted)) return promoted.length;
  return 0;
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}
