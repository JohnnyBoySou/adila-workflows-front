import { useEffect, useId, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";

import * as workflowsApi from "~/services/workflows";
import type { Workflow } from "~/services/workflows";
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
import { Textarea } from "~/components/ui/textarea";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pasta onde o novo workflow será criado (null = raiz). */
  folderId: string | null;
  /** Callback opcional após criação bem-sucedida (ex.: navegar pro studio). */
  onCreated?: (workflow: Workflow) => void;
};

export function WorkflowCreateDialog({ open, onOpenChange, folderId, onCreated }: Props) {
  const nameId = useId();
  const descId = useId();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (input: { name: string; description?: string; folderId: string | null }) =>
      workflowsApi.create(input),
    onSuccess: (workflow) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.workflows.all });
      onCreated?.(workflow);
      onOpenChange(false);
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : "Falha ao criar workflow.");
    },
  });

  useEffect(() => {
    if (open) {
      setName("");
      setDescription("");
      setError(null);
      mutation.reset();
    }
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
    const desc = description.trim();
    mutation.mutate({
      name: trimmed,
      ...(desc.length > 0 && { description: desc }),
      folderId,
    });
  }

  const saving = mutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Novo workflow</DialogTitle>
            <DialogDescription>
              {folderId
                ? "O workflow será criado dentro da pasta atual."
                : "O workflow será criado na raiz."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor={nameId}>Nome</Label>
            <Input
              id={nameId}
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={120}
              placeholder="Ex.: Onboarding de lead"
              disabled={saving}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor={descId}>
              Descrição <span className="text-muted-foreground">(opcional)</span>
            </Label>
            <Textarea
              id={descId}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={1000}
              rows={3}
              placeholder="Para que serve este workflow?"
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
