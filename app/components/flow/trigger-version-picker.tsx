/**
 * Picker de versão do trigger.
 *
 * Mostra a versão atualmente pinada (ou "Latest (auto)" quando null), permite
 * trocar via dropdown e confirma a promoção num dialog antes de chamar a API.
 *
 * Reusável em qualquer painel que liste triggers — hoje plugado em
 * `webhook-trigger-extras.tsx`.
 */
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Tag } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { Button } from "~/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { queryKeys } from "~/lib/query-keys";
import * as triggersApi from "~/services/triggers";
import * as workflowVersionsApi from "~/services/workflow-versions";
import type { VersionDiff, WorkflowVersion } from "~/services/workflow-versions";

const LATEST_VALUE = "__latest__";

const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

type Props = {
  workflowId: string;
  triggerId: string;
  triggerName: string;
  /** Versão atualmente pinada — `null` significa "latest auto". */
  currentVersionId: string | null;
};

export function TriggerVersionPicker({
  workflowId,
  triggerId,
  triggerName,
  currentVersionId,
}: Props) {
  const queryClient = useQueryClient();
  const [pending, setPending] = useState<{
    nextVersionId: string | null;
    nextVersion: WorkflowVersion | null;
  } | null>(null);

  const versionsQuery = useQuery({
    queryKey: queryKeys.workflowVersions.list(workflowId),
    queryFn: () => workflowVersionsApi.list(workflowId),
  });

  const versions = versionsQuery.data ?? [];

  const currentVersion = useMemo(
    () => versions.find((v) => v.id === currentVersionId) ?? null,
    [versions, currentVersionId],
  );

  const promoteMutation = useMutation({
    mutationFn: (versionId: string | null) =>
      triggersApi.promote(workflowId, triggerId, versionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.triggers.list(workflowId) });
      setPending(null);
    },
  });

  function onSelect(value: string) {
    const nextVersionId = value === LATEST_VALUE ? null : value;
    if (nextVersionId === currentVersionId) return;
    const nextVersion = nextVersionId
      ? versions.find((v) => v.id === nextVersionId) ?? null
      : null;
    setPending({ nextVersionId, nextVersion });
  }

  if (versionsQuery.isPending) {
    return (
      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
        <Loader2 className="size-3 animate-spin" /> Carregando versões…
      </div>
    );
  }

  const selectValue = currentVersionId ?? LATEST_VALUE;

  return (
    <>
      <div className="flex items-center gap-2 text-xs">
        <Tag className="size-3.5 text-muted-foreground" aria-hidden />
        <span className="text-muted-foreground">Versão:</span>
        <Select value={selectValue} onValueChange={onSelect}>
          <SelectTrigger className="h-7 min-w-[160px] flex-1 text-xs">
            <SelectValue placeholder="Latest (auto)" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={LATEST_VALUE}>Latest (auto)</SelectItem>
            {versions.map((v) => (
              <SelectItem key={v.id} value={v.id}>
                v{v.version}
                {v.name ? ` — ${v.name}` : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Dialog open={pending !== null} onOpenChange={(open) => !open && setPending(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Promover trigger &ldquo;{triggerName}&rdquo;?</DialogTitle>
            <DialogDescription>
              Esta ação altera qual versão do workflow será executada nos próximos disparos
              deste trigger. Runs em andamento não são afetados.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 rounded-md border border-border bg-muted/30 p-3 text-sm">
            <Row label="De">
              {currentVersion
                ? `v${currentVersion.version}${
                    currentVersion.name ? ` — ${currentVersion.name}` : ""
                  }`
                : "Latest (auto)"}
            </Row>
            <Row label="Para">
              {pending?.nextVersion
                ? `v${pending.nextVersion.version}${
                    pending.nextVersion.name ? ` — ${pending.nextVersion.name}` : ""
                  }`
                : "Latest (auto)"}
            </Row>
            {pending?.nextVersion && (
              <Row label="Publicada em">
                {dateFormatter.format(new Date(pending.nextVersion.createdAt))}
              </Row>
            )}
          </div>

          {pending && currentVersion && pending.nextVersion && (
            <DiffSummary
              workflowId={workflowId}
              fromId={currentVersion.id}
              toId={pending.nextVersion.id}
            />
          )}

          {promoteMutation.isError && (
            <p className="text-xs text-destructive">
              Falha ao promover. Tente novamente.
            </p>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setPending(null)}
              disabled={promoteMutation.isPending}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={() => pending && promoteMutation.mutate(pending.nextVersionId)}
              disabled={promoteMutation.isPending}
            >
              {promoteMutation.isPending && <Loader2 className="size-4 animate-spin" />}
              Promover
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function DiffSummary({
  workflowId,
  fromId,
  toId,
}: {
  workflowId: string;
  fromId: string;
  toId: string;
}) {
  const diffQuery = useQuery({
    queryKey: ["workflow-version-diff", workflowId, fromId, toId],
    queryFn: () => workflowVersionsApi.diff(workflowId, fromId, toId),
    staleTime: 60_000,
  });

  if (diffQuery.isPending) {
    return (
      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="size-3 animate-spin" /> Calculando diferenças…
      </p>
    );
  }
  if (diffQuery.isError || !diffQuery.data) {
    return <p className="text-xs text-muted-foreground">Diff indisponível.</p>;
  }

  return <DiffSummaryView diff={diffQuery.data.diff} />;
}

function DiffSummaryView({ diff }: { diff: VersionDiff }) {
  const { added, removed, changed } = diff.nodes;
  const empty =
    added.length === 0 &&
    removed.length === 0 &&
    changed.length === 0 &&
    diff.edges.added === 0 &&
    diff.edges.removed === 0;

  if (empty) {
    return (
      <p className="text-xs text-muted-foreground">
        Nenhuma diferença detectada entre as versões (mesmo grafo, mesma config).
      </p>
    );
  }

  return (
    <div className="space-y-1.5 text-xs">
      <p className="font-medium">Mudanças:</p>
      <ul className="space-y-1 text-muted-foreground">
        {added.length > 0 && (
          <li>
            <span className="text-emerald-600 dark:text-emerald-400">
              +{added.length}
            </span>{" "}
            {added.length === 1 ? "nó adicionado" : "nós adicionados"}
          </li>
        )}
        {removed.length > 0 && (
          <li>
            <span className="text-rose-600 dark:text-rose-400">−{removed.length}</span>{" "}
            {removed.length === 1 ? "nó removido" : "nós removidos"}
          </li>
        )}
        {changed.length > 0 && (
          <li>
            <span className="text-amber-600 dark:text-amber-400">~{changed.length}</span>{" "}
            {changed.length === 1 ? "nó alterado" : "nós alterados"}
          </li>
        )}
        {(diff.edges.added > 0 || diff.edges.removed > 0) && (
          <li>
            Conexões: {diff.edges.added > 0 && `+${diff.edges.added}`}
            {diff.edges.added > 0 && diff.edges.removed > 0 && " / "}
            {diff.edges.removed > 0 && `−${diff.edges.removed}`}
          </li>
        )}
      </ul>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[6rem_1fr] items-baseline gap-2">
      <span className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className="font-medium">{children}</span>
    </div>
  );
}
