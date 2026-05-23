import { useEffect, useId, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";

import * as foldersApi from "~/services/folders";
import type { Folder } from "~/services/folders";
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
  /** Pasta-pai onde a nova pasta será criada (null = raiz). */
  parentId: string | null;
  /** Callback opcional disparado após criação bem-sucedida. */
  onCreated?: (folder: Folder) => void;
};

export function FolderCreateDialog({ open, onOpenChange, parentId, onCreated }: Props) {
  const nameId = useId();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (input: { name: string; parentId: string | null }) =>
      foldersApi.create({ name: input.name, parentId: input.parentId }),
    onSuccess: (folder) => {
      // Invalida tudo de "folders" — listas (de qualquer parent) e paths.
      queryClient.invalidateQueries({ queryKey: queryKeys.folders.all });
      onCreated?.(folder);
      onOpenChange(false);
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : "Falha ao criar pasta.");
    },
  });

  useEffect(() => {
    // Reset cada vez que o dialog reabre — evita carregar valor da última tentativa.
    if (open) {
      setName("");
      setError(null);
      mutation.reset();
    }
    // mutation.reset é estável; não precisa entrar nas deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (trimmed.length === 0) {
      setError("Informe um nome.");
      return;
    }
    setError(null);
    mutation.mutate({ name: trimmed, parentId });
  }

  const saving = mutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Nova pasta</DialogTitle>
            <DialogDescription>
              {parentId
                ? "A pasta será criada dentro da pasta atual."
                : "A pasta será criada na raiz."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor={nameId}>Nome</Label>
            <Input
              id={nameId}
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={120}
              placeholder="Ex.: Marketing"
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
              Criar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
