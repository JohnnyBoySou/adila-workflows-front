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
import { queryKeys } from "~/lib/query-keys";
import { cn } from "~/lib/utils";
import * as workflowVersionsApi from "~/services/workflow-versions";
import type { WorkflowVersion } from "~/services/workflow-versions";
import * as workflowsApi from "~/services/workflows";
import * as triggersApi from "~/services/triggers";

type Props = {
  workflowId: string;
};

const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

/**
 * Lista as versões publicadas de um workflow. Marca como "ativa" qualquer
 * versão referenciada por pelo menos um trigger (pin explícito).
 *
 * Restaurar e Comparar ficam como placeholders desabilitados — dependem
 * dos endpoints do backend que ainda não foram entregues (Fase 2 do TODO
 * de pipeline).
 */
export function WorkflowVersionsPanel({ workflowId }: Props) {
  const [restoreTarget, setRestoreTarget] = useState<WorkflowVersion | null>(null);
  const [releaseTarget, setReleaseTarget] = useState<WorkflowVersion | null>(null);
  const versionsQuery = useQuery({
    queryKey: queryKeys.workflowVersions.list(workflowId),
    queryFn: () => workflowVersionsApi.list(workflowId),
  });

  const triggersQuery = useQuery({
    queryKey: queryKeys.triggers.list(workflowId),
    queryFn: () => triggersApi.list(workflowId),
  });

  const activeVersionIds = useMemo(() => {
    const ids = new Set<string>();
    for (const trigger of triggersQuery.data ?? []) {
      if (trigger.workflowVersionId) ids.add(trigger.workflowVersionId);
    }
    return ids;
  }, [triggersQuery.data]);

  if (versionsQuery.isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Carregando versões…
      </div>
    );
  }

  if (versionsQuery.isError) {
    return (
      <div className="text-sm text-destructive">
        Falha ao carregar versões. Tente novamente.
      </div>
    );
  }

  const versions = versionsQuery.data ?? [];

  if (versions.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
        Nenhuma versão publicada ainda. Use o botão de publicar na barra
        superior para criar a primeira.
      </div>
    );
  }

  return (
    <>
      <ul className="divide-y divide-border rounded-md border border-border">
        {versions.map((v) => {
          const isActive = activeVersionIds.has(v.id);
          return (
            <li
              key={v.id}
              className="flex items-center justify-between gap-4 px-4 py-3 text-sm"
            >
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <Tag className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                <div className="flex min-w-0 flex-1 flex-col">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">v{v.version}</span>
                    {v.name && (
                      <span className="truncate text-muted-foreground">— {v.name}</span>
                    )}
                    {isActive && (
                      <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
                        Ativa
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {dateFormatter.format(new Date(v.createdAt))}
                  </span>
                </div>
              </div>
              <div className="flex shrink-0 gap-1">
                <ActionButton
                  onClick={() => setReleaseTarget(v)}
                  title="Promover esta versão em todos os triggers do workflow"
                >
                  Release
                </ActionButton>
                <ActionButton onClick={() => setRestoreTarget(v)}>Restaurar</ActionButton>
                <ActionButton disabled title="Em breve">
                  Comparar
                </ActionButton>
              </div>
            </li>
          );
        })}
      </ul>

      <RestoreDialog
        workflowId={workflowId}
        target={restoreTarget}
        onClose={() => setRestoreTarget(null)}
      />

      <ReleaseDialog
        workflowId={workflowId}
        target={releaseTarget}
        triggers={triggersQuery.data ?? []}
        onClose={() => setReleaseTarget(null)}
      />
    </>
  );
}

function ReleaseDialog({
  workflowId,
  target,
  triggers,
  onClose,
}: {
  workflowId: string;
  target: WorkflowVersion | null;
  triggers: { id: string; name: string; workflowVersionId: string | null }[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const releaseMutation = useMutation({
    mutationFn: (versionId: string) =>
      workflowsApi.promoteBulk(workflowId, { workflowVersionId: versionId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.triggers.list(workflowId) });
      onClose();
    },
  });

  const triggerCount = triggers.length;
  const alreadyOnTarget = target
    ? triggers.filter((t) => t.workflowVersionId === target.id).length
    : 0;
  const willChange = triggerCount - alreadyOnTarget;

  return (
    <Dialog open={target !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            Release: promover v{target?.version} em todos os triggers?
          </DialogTitle>
          <DialogDescription>
            Aponta todos os triggers do workflow para esta versão em uma
            operação atômica. Não há janela onde metade dos triggers roda uma
            versão e metade roda outra.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1 rounded-md border border-border bg-muted/30 p-3 text-sm">
          <p>
            <span className="font-medium">{triggerCount}</span>{" "}
            {triggerCount === 1 ? "trigger no workflow" : "triggers no workflow"}
          </p>
          {triggerCount > 0 && (
            <p className="text-muted-foreground text-xs">
              {willChange === 0
                ? "Todos já apontam para esta versão — nada muda."
                : `${willChange} ${
                    willChange === 1 ? "trigger será atualizado" : "triggers serão atualizados"
                  }${alreadyOnTarget > 0 ? ` (${alreadyOnTarget} já na versão)` : ""}.`}
            </p>
          )}
          {triggerCount === 0 && (
            <p className="text-muted-foreground text-xs">
              Sem triggers cadastrados — operação não tem efeito.
            </p>
          )}
        </div>

        {releaseMutation.isError && (
          <p className="text-xs text-destructive">Falha ao promover. Tente novamente.</p>
        )}

        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={onClose}
            disabled={releaseMutation.isPending}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={() => target && releaseMutation.mutate(target.id)}
            disabled={releaseMutation.isPending || triggerCount === 0 || willChange === 0}
          >
            {releaseMutation.isPending && <Loader2 className="size-4 animate-spin" />}
            Promover {willChange > 0 ? `(${willChange})` : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RestoreDialog({
  workflowId,
  target,
  onClose,
}: {
  workflowId: string;
  target: WorkflowVersion | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const restoreMutation = useMutation({
    mutationFn: (versionId: string) => workflowVersionsApi.restore(workflowId, versionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.workflows.detail(workflowId) });
      // O canvas usa key={workflow.id} e não re-hidrata em mudança de
      // definition. Reload completo garante que o usuário vê a versão
      // restaurada sem estado stale — ação explícita do usuário, aceitável.
      window.location.reload();
    },
  });

  return (
    <Dialog open={target !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Restaurar v{target?.version} como rascunho?</DialogTitle>
          <DialogDescription>
            Substitui o conteúdo atual do canvas pelo desta versão. NÃO promove
            triggers nem publica uma nova versão — você ainda precisa publicar
            para que ela rode em produção. A versão atual fica preservada no
            histórico.
          </DialogDescription>
        </DialogHeader>

        {restoreMutation.isError && (
          <p className="text-xs text-destructive">
            Falha ao restaurar. Tente novamente.
          </p>
        )}

        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={onClose}
            disabled={restoreMutation.isPending}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={() => target && restoreMutation.mutate(target.id)}
            disabled={restoreMutation.isPending}
          >
            {restoreMutation.isPending && <Loader2 className="size-4 animate-spin" />}
            Restaurar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ActionButton({
  children,
  disabled,
  title,
  onClick,
}: {
  children: React.ReactNode;
  disabled?: boolean;
  title?: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      title={title}
      onClick={onClick}
      className={cn(
        "rounded-md px-2.5 py-1 text-xs transition-colors",
        disabled
          ? "cursor-not-allowed text-muted-foreground/60"
          : "text-foreground hover:bg-muted",
      )}
    >
      {children}
    </button>
  );
}
