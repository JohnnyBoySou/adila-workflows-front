/**
 * Dialog de "Publicar versão" — orquestra publish + bulk-promote opcional.
 *
 * Fluxo:
 *  1. Usuário abre o dialog (clicando no botão Publicar do top-bar).
 *  2. Preenche nome opcional (sem nome = versão silenciosa numerada).
 *  3. Marca quais triggers vão ser promovidos para esta nova versão.
 *     Por padrão, todos os triggers que JÁ estão pinados na versão "latest"
 *     vêm marcados — preserva o comportamento corrente (release rolling).
 *     Triggers sem pino (rodando ensureLatest) vêm desmarcados — promover
 *     pinaria, mudando o modelo de release.
 *  4. Confirma → POST /versions (publish) + se houver triggerIds selecionados
 *     e a publish criou (ou reusou) uma versão, POST /versions/:id/promote.
 *  5. Mostra resultado por 2s ("v17 publicada — 3 triggers promovidos") e
 *     fecha sozinho.
 *
 * Idempotência: se o draft for byte-idêntico à latest, o publish devolve a
 * versão existente (`alreadyExisted=true`). Promover triggers nessa versão
 * é seguro e idempotente — o bulk-promote só altera triggers que estavam
 * em versões diferentes.
 */
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Loader2, Rocket, Tag } from "lucide-react";

import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { cn } from "~/lib/utils";
import { queryKeys } from "~/lib/query-keys";
import * as triggersApi from "~/services/triggers";
import * as workflowVersionsApi from "~/services/workflow-versions";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workflowId: string;
  /** Garante que edições não-salvas entrem no snapshot publicado. */
  onBeforePublish?: () => void | Promise<void>;
};

type Phase = "form" | "publishing" | "promoting" | "done" | "error";

export function PublishVersionDialog({
  open,
  onOpenChange,
  workflowId,
  onBeforePublish,
}: Props) {
  const queryClient = useQueryClient();
  const versionsQuery = useQuery({
    queryKey: queryKeys.workflowVersions.list(workflowId),
    queryFn: () => workflowVersionsApi.list(workflowId),
    enabled: open && Boolean(workflowId),
  });
  const triggersQuery = useQuery({
    queryKey: queryKeys.triggers.list(workflowId),
    queryFn: () => triggersApi.list(workflowId),
    enabled: open && Boolean(workflowId),
  });

  const latestVersion = useMemo(() => {
    const versions = versionsQuery.data ?? [];
    if (versions.length === 0) return null;
    return versions.reduce((acc, v) => (v.version > acc.version ? v : acc));
  }, [versionsQuery.data]);

  const triggers = triggersQuery.data ?? [];

  const [name, setName] = useState("");
  const [selectedTriggerIds, setSelectedTriggerIds] = useState<Set<string>>(new Set());
  const [phase, setPhase] = useState<Phase>("form");
  const [resultMsg, setResultMsg] = useState<string>("");
  const [errorMsg, setErrorMsg] = useState<string>("");

  // Reset ao (re)abrir: limpa nome, pré-seleciona triggers já pinados na latest.
  useEffect(() => {
    if (!open) return;
    setName("");
    setPhase("form");
    setResultMsg("");
    setErrorMsg("");
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (!latestVersion) {
      // Sem nenhuma versão ainda: pré-seleciona todos os triggers (primeiro
      // release — faz sentido pinar todo mundo na v1).
      setSelectedTriggerIds(new Set(triggers.map((t) => t.id)));
      return;
    }
    // Pré-seleciona apenas triggers que JÁ estão pinados na latest atual
    // (mantém o modelo de release rolling). Triggers sem pino ficam de fora.
    setSelectedTriggerIds(
      new Set(
        triggers.filter((t) => t.workflowVersionId === latestVersion.id).map((t) => t.id),
      ),
    );
  }, [open, latestVersion, triggers]);

  const toggleTrigger = (id: string) => {
    setSelectedTriggerIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => setSelectedTriggerIds(new Set(triggers.map((t) => t.id)));
  const selectNone = () => setSelectedTriggerIds(new Set());

  const publishMutation = useMutation({
    mutationFn: async () => {
      await onBeforePublish?.();
      setPhase("publishing");
      const pub = await workflowVersionsApi.publish(
        workflowId,
        name.trim() ? { name: name.trim() } : undefined,
      );

      const ids = Array.from(selectedTriggerIds);
      if (ids.length === 0) {
        return { version: pub.version, alreadyExisted: pub.alreadyExisted, promotedCount: 0 };
      }
      // Só promove triggers que NÃO estão já na versão alvo — evita audit
      // log redundante.
      const needsPromote = ids.filter((id) => {
        const t = triggers.find((x) => x.id === id);
        return t?.workflowVersionId !== pub.version.id;
      });
      if (needsPromote.length === 0) {
        return { version: pub.version, alreadyExisted: pub.alreadyExisted, promotedCount: 0 };
      }
      setPhase("promoting");
      const res = await workflowVersionsApi.promoteBulk(workflowId, pub.version.id, needsPromote);
      return {
        version: pub.version,
        alreadyExisted: pub.alreadyExisted,
        promotedCount: res.promoted.length,
      };
    },
    onSuccess: ({ version, alreadyExisted, promotedCount }) => {
      const verbo = alreadyExisted ? "reutilizada" : "publicada";
      const versao = `v${version.version}`;
      const triggerMsg = promotedCount > 0 ? ` — ${promotedCount} trigger(s) promovido(s)` : "";
      setResultMsg(`${versao} ${verbo}${triggerMsg}`);
      setPhase("done");
      queryClient.invalidateQueries({ queryKey: queryKeys.workflowVersions.list(workflowId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.triggers.list(workflowId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.auditLogs.byWorkflow(workflowId) });
      setTimeout(() => onOpenChange(false), 1800);
    },
    onError: (err) => {
      setErrorMsg(err instanceof Error ? err.message : "Falha ao publicar");
      setPhase("error");
    },
  });

  const busy = phase === "publishing" || phase === "promoting";

  return (
    <Dialog open={open} onOpenChange={busy ? undefined : onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Tag className="size-4" aria-hidden /> Publicar versão
          </DialogTitle>
          <DialogDescription>
            Cria um snapshot imutável do workflow. Opcionalmente promove triggers
            para apontar para esta nova versão.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-5 py-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="version-name">
              Nome <span className="text-muted-foreground">(opcional)</span>
            </Label>
            <Input
              id="version-name"
              placeholder='ex: "release Black Friday"'
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={busy || phase === "done"}
              maxLength={120}
            />
            <p className="text-xs text-muted-foreground">
              {latestVersion
                ? `Próxima versão: v${latestVersion.version + 1}. Sem nome = idempotente (se draft = v${latestVersion.version}, reusa).`
                : "Primeira versão do workflow — será v1."}
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <Label className="text-sm">
                Promover triggers para esta versão
                {triggers.length > 0 && (
                  <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                    ({selectedTriggerIds.size}/{triggers.length})
                  </span>
                )}
              </Label>
              {triggers.length > 1 && (
                <div className="flex gap-1 text-xs">
                  <button
                    type="button"
                    onClick={selectAll}
                    disabled={busy || phase === "done"}
                    className="text-muted-foreground hover:text-foreground disabled:opacity-40"
                  >
                    Todos
                  </button>
                  <span aria-hidden className="text-muted-foreground/40">·</span>
                  <button
                    type="button"
                    onClick={selectNone}
                    disabled={busy || phase === "done"}
                    className="text-muted-foreground hover:text-foreground disabled:opacity-40"
                  >
                    Nenhum
                  </button>
                </div>
              )}
            </div>

            {triggersQuery.isLoading ? (
              <p className="text-xs text-muted-foreground">Carregando triggers…</p>
            ) : triggers.length === 0 ? (
              <p className="rounded-md border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
                Nenhum trigger configurado. Você pode publicar mesmo assim — disparos manuais via "test run" sempre usam o draft.
              </p>
            ) : (
              <ul className="flex max-h-56 flex-col gap-1 overflow-y-auto rounded-md border border-border p-1">
                {triggers.map((t) => {
                  const checked = selectedTriggerIds.has(t.id);
                  const pinnedVersion = (versionsQuery.data ?? []).find(
                    (v) => v.id === t.workflowVersionId,
                  );
                  return (
                    <li key={t.id}>
                      <label
                        className={cn(
                          "flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted/60",
                          (busy || phase === "done") && "cursor-not-allowed opacity-60",
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleTrigger(t.id)}
                          disabled={busy || phase === "done"}
                          className="size-3.5 accent-primary"
                        />
                        <span className="min-w-0 flex-1 truncate">
                          {t.name}
                          <span className="ml-1.5 text-xs text-muted-foreground">
                            ({t.type})
                          </span>
                        </span>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {pinnedVersion ? `→ v${pinnedVersion.version}` : "latest"}
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {phase === "error" && (
            <p className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
              {errorMsg}
            </p>
          )}
          {phase === "done" && (
            <p className="flex items-center gap-2 rounded-md border border-emerald-300/40 bg-emerald-50 px-3 py-2 text-xs text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100">
              <Check className="size-3.5" aria-hidden />
              {resultMsg}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancelar
          </Button>
          <Button onClick={() => publishMutation.mutate()} disabled={busy || phase === "done"}>
            {phase === "publishing" ? (
              <><Loader2 className="size-4 animate-spin" /> Publicando…</>
            ) : phase === "promoting" ? (
              <><Loader2 className="size-4 animate-spin" /> Promovendo…</>
            ) : phase === "done" ? (
              <><Check className="size-4" /> Pronto</>
            ) : selectedTriggerIds.size > 0 ? (
              <><Rocket className="size-4" /> Publicar e promover {selectedTriggerIds.size}</>
            ) : (
              <><Tag className="size-4" /> Publicar</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
