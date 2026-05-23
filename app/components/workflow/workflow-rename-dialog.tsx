import { useEffect, useId, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";

import * as workflowsApi from "~/services/workflows";
import { queryKeys } from "~/lib/query-keys";

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

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workflowId: string;
  currentName: string;
};

/**
 * Renomeia um workflow via PATCH. Estado local é descartado se o usuário
 * cancelar. Após sucesso, invalida `["workflows"]` para refletir o novo
 * nome nas listas em cache.
 */
export function WorkflowRenameDialog({ open, onOpenChange, workflowId, currentName }: Props) {
  const nameId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const [name, setName] = useState(currentName);
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (newName: string) => workflowsApi.update(workflowId, { name: newName }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.workflows.all });
      onOpenChange(false);
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : "Falha ao renomear.");
    },
  });

  // Resync ao abrir — evita carregar o nome antigo se outra ação tiver
  // alterado o workflow desde a última renderização.
  useEffect(() => {
    if (open) {
      setName(currentName);
      setError(null);
      mutation.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, currentName]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (trimmed.length === 0) {
      setError("Informe um nome.");
      return;
    }
    if (trimmed === currentName) {
      onOpenChange(false);
      return;
    }
    setError(null);
    mutation.mutate(trimmed);
  }

  const saving = mutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Renomear workflow</DialogTitle>
            <DialogDescription>O novo nome aparecerá em toda a listagem.</DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor={nameId}>Nome</Label>
            <Input
              ref={inputRef}
              id={nameId}
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={120}
              disabled={saving}
            />
          </div>

          {error && (
            <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={saving || name.trim().length === 0}>
              {saving && <Loader2 className="size-4 animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
