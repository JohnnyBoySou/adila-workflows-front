import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FolderIcon as Folder, Home, Loader2 } from "lucide-react";

import * as foldersApi from "~/services/folders";
import * as workflowsApi from "~/services/workflows";
import type { Folder as FolderType } from "~/services/folders";
import { queryKeys } from "~/lib/query-keys";
import { cn } from "~/lib/utils";

import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workflowId: string;
  /** Pasta atual do workflow — fica desabilitada na seleção (sem destino). */
  currentFolderId: string | null;
};

type FlatFolder = { folder: FolderType; depth: number };

/**
 * Caminha a árvore de pastas (BFS) e devolve uma lista achatada com a
 * profundidade pra indentar visualmente. Volume esperado é pequeno; se um
 * dia escalarmos, vale um endpoint dedicado no backend.
 */
async function loadFolderTree(): Promise<FlatFolder[]> {
  const out: FlatFolder[] = [];
  async function walk(parentId: string | null, depth: number) {
    const children = await foldersApi.list({ parentId: parentId ?? "root" });
    children.sort((a, b) => a.name.localeCompare(b.name));
    // DFS pré-ordem: precisa ser sequencial (paralelo alteraria ordem visual).
    for (const child of children) {
      out.push({ folder: child, depth });
      // eslint-disable-next-line no-await-in-loop -- travessia em profundidade intencional
      await walk(child.id, depth + 1);
    }
  }
  await walk(null, 0);
  return out;
}

export function WorkflowMoveDialog({ open, onOpenChange, workflowId, currentFolderId }: Props) {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<string | null>(currentFolderId);
  const [error, setError] = useState<string | null>(null);

  // Só carrega a árvore quando o dialog está aberto — evita request à toa.
  const treeQuery = useQuery({
    queryKey: ["folders", "tree"],
    queryFn: loadFolderTree,
    enabled: open,
  });

  const mutation = useMutation({
    mutationFn: (target: string | null) => workflowsApi.update(workflowId, { folderId: target }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.workflows.all });
      onOpenChange(false);
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : "Falha ao mover.");
    },
  });

  useEffect(() => {
    if (open) {
      setSelected(currentFolderId);
      setError(null);
      mutation.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, currentFolderId]);

  const sameLocation = selected === currentFolderId;
  const saving = mutation.isPending;

  function submit() {
    if (sameLocation) {
      onOpenChange(false);
      return;
    }
    setError(null);
    mutation.mutate(selected);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Mover workflow</DialogTitle>
          <DialogDescription>Escolha a pasta de destino.</DialogDescription>
        </DialogHeader>

        <div className="max-h-72 overflow-y-auto rounded-md border">
          <FolderPickerRow
            label="Raiz"
            icon={<Home className="size-4" />}
            depth={0}
            selected={selected === null}
            onClick={() => setSelected(null)}
          />
          {treeQuery.isPending ? (
            <div className="flex items-center gap-2 px-3 py-3 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Carregando pastas…
            </div>
          ) : treeQuery.error ? (
            <p className="px-3 py-3 text-sm text-destructive">
              {treeQuery.error instanceof Error
                ? treeQuery.error.message
                : "Falha ao carregar pastas."}
            </p>
          ) : (
            (treeQuery.data ?? []).map(({ folder, depth }) => (
              <FolderPickerRow
                key={folder.id}
                label={folder.name}
                icon={<Folder className="size-4" />}
                depth={depth + 1}
                selected={selected === folder.id}
                onClick={() => setSelected(folder.id)}
              />
            ))
          )}
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
          <Button type="button" onClick={submit} disabled={saving || sameLocation}>
            {saving && <Loader2 className="size-4 animate-spin" />}
            Mover
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FolderPickerRow({
  label,
  icon,
  depth,
  selected,
  onClick,
}: {
  label: string;
  icon: React.ReactNode;
  depth: number;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{ paddingLeft: `${depth * 16 + 12}px` }}
      className={cn(
        "flex w-full cursor-pointer items-center gap-2 py-2 pr-3 text-left text-sm transition-colors hover:bg-muted/60",
        selected && "bg-muted text-foreground",
      )}
    >
      {icon}
      <span className="truncate">{label}</span>
    </button>
  );
}
