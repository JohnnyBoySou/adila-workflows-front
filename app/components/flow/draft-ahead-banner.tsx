/**
 * Banner sutil que avisa quando o draft no editor está à frente da versão
 * que está rodando em produção.
 *
 * Heurística de "versão em produção":
 *  1. Se existir trigger pinado (`workflowVersionId != null`), usa a versão
 *     pinada com o maior `version` — é o que dispara via cron/webhook.
 *  2. Se nenhum trigger estiver pinado, cai pra última versão publicada
 *     (que é o que `ensureLatest` resolveria no dispatch automático).
 *  3. Se não existir nenhuma versão publicada, não renderiza nada
 *     (workflow nunca foi publicado).
 *
 * Comparação: `JSON.stringify(definition)` — não é canônico igual ao hash
 * do backend, então pode dar falso positivo se houver reordenação de
 * chaves. Aceitamos isso: o backend deduplica via hash na hora do publicar,
 * então um falso positivo só causa um "publicar" que devolve a versão
 * existente, sem criar registro novo.
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";

import { Button } from "~/components/ui/button";
import { queryKeys } from "~/lib/query-keys";
import * as triggersApi from "~/services/triggers";
import * as workflowVersionsApi from "~/services/workflow-versions";

type Props = {
  workflowId: string;
  draftDefinition: unknown;
  onPublish: () => void;
  publishing?: boolean;
};

export function DraftAheadBanner({ workflowId, draftDefinition, onPublish, publishing }: Props) {
  const versionsQuery = useQuery({
    queryKey: queryKeys.workflowVersions.list(workflowId),
    queryFn: () => workflowVersionsApi.list(workflowId),
    enabled: Boolean(workflowId),
  });
  const triggersQuery = useQuery({
    queryKey: queryKeys.triggers.list(workflowId),
    queryFn: () => triggersApi.list(workflowId),
    enabled: Boolean(workflowId),
  });

  const prodVersion = useMemo(() => {
    const versions = versionsQuery.data ?? [];
    if (versions.length === 0) return null;
    const triggers = triggersQuery.data ?? [];
    const pinnedIds = new Set(
      triggers.map((t) => t.workflowVersionId).filter((id): id is string => Boolean(id)),
    );
    const pinned = versions.filter((v) => pinnedIds.has(v.id));
    if (pinned.length > 0) {
      return pinned.reduce((acc, v) => (v.version > acc.version ? v : acc));
    }
    return versions.reduce((acc, v) => (v.version > acc.version ? v : acc));
  }, [versionsQuery.data, triggersQuery.data]);

  const isAhead = useMemo(() => {
    if (!prodVersion) return false;
    try {
      return JSON.stringify(draftDefinition) !== JSON.stringify(prodVersion.definition);
    } catch {
      return false;
    }
  }, [prodVersion, draftDefinition]);

  if (!prodVersion || !isAhead) return null;

  const nextVersion = prodVersion.version + 1;

  return (
    <div className="pointer-events-auto flex items-center gap-3 rounded-full border border-amber-300/60 bg-amber-50/95 px-3 py-1.5 text-xs shadow-sm backdrop-blur dark:border-amber-500/40 dark:bg-amber-950/80">
      <AlertTriangle className="size-3.5 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
      <span className="text-amber-900 dark:text-amber-100">
        Draft à frente da versão em produção (v{prodVersion.version}).
      </span>
      <Button
        size="sm"
        variant="ghost"
        className="h-6 px-2 text-xs text-amber-900 hover:bg-amber-100 dark:text-amber-100 dark:hover:bg-amber-900/40"
        onClick={onPublish}
        disabled={publishing}
      >
        {publishing ? "Publicando…" : `Publicar v${nextVersion}`}
      </Button>
    </div>
  );
}
