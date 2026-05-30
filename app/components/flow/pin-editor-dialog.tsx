import { useEffect, useMemo, useState } from "react";
import { Pin } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { Button } from "~/components/ui/button";
import { pinnedDataApi, usePinnedData } from "~/stores/pinned-data";

export const WORKFLOW_NODE_PIN_EDIT_EVENT = "workflow:node-pin-edit";
export type WorkflowNodePinEditDetail = { nodeId: string };

type PinEditorDialogProps = {
  workflowId: string | null;
  nodeId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function PinEditorDialog({ workflowId, nodeId, open, onOpenChange }: PinEditorDialogProps) {
  const pins = usePinnedData(workflowId ?? "");
  const current = nodeId ? pins[nodeId] : undefined;

  const initialText = useMemo(
    () => (current ? JSON.stringify(current, null, 2) : "{}"),
    [current],
  );
  const [text, setText] = useState(initialText);
  const [error, setError] = useState<string | null>(null);

  // Reset quando reabre num nó diferente — `defaultValue` não recarrega sozinho.
  useEffect(() => {
    if (open) {
      setText(initialText);
      setError(null);
    }
  }, [open, initialText]);

  const isPinned = nodeId != null && nodeId in pins;

  function handleSave() {
    if (!workflowId || !nodeId) return;
    try {
      const parsed = JSON.parse(text);
      if (parsed === null || parsed === undefined) {
        setError("Cole um JSON com conteúdo — objeto ou array de items.");
        return;
      }
      // Aceita tanto objeto quanto array (n8n usa array de items como
      // padrão — `[{...}]`). Quando vier array com 1 item, desempacotamos
      // pra manter compat com handlers que esperam objeto. Arrays com N>1
      // items ficam como `{ items: [...] }` pra preservar a estrutura.
      let normalized: Record<string, unknown>;
      if (Array.isArray(parsed)) {
        if (parsed.length === 0) {
          setError("Array vazio — cole pelo menos 1 item.");
          return;
        }
        if (parsed.length === 1 && typeof parsed[0] === "object" && parsed[0] !== null) {
          normalized = parsed[0] as Record<string, unknown>;
        } else {
          normalized = { items: parsed };
        }
      } else if (typeof parsed === "object") {
        normalized = parsed as Record<string, unknown>;
      } else {
        // Primitivos (string, number, boolean) → envelopa em { value }.
        normalized = { value: parsed };
      }
      pinnedDataApi.set(workflowId, nodeId, normalized);
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "JSON inválido");
    }
  }

  function handleRemove() {
    if (!workflowId || !nodeId) return;
    pinnedDataApi.remove(workflowId, nodeId);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pin className="size-4 text-amber-500" />
            Editar saída pinada
          </DialogTitle>
          <DialogDescription>
            Próximas execuções pulam este nó e usam o JSON abaixo como output. Útil pra fabricar
            entradas de teste sem disparar APIs upstream. Aceita objeto <code className="rounded bg-muted px-1">{`{...}`}</code> ou
            array de items <code className="rounded bg-muted px-1">{`[{...}]`}</code> (padrão n8n) —
            array com 1 item é desempacotado automaticamente.
          </DialogDescription>
        </DialogHeader>

        <textarea
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            if (error) setError(null);
          }}
          spellCheck={false}
          className="h-72 w-full resize-none rounded-md border border-border bg-muted/30 p-3 font-mono text-xs text-foreground outline-none focus:ring-1 focus:ring-ring"
        />

        {error && (
          <p className="text-xs text-destructive" role="alert">
            {error}
          </p>
        )}

        <DialogFooter className="gap-2 sm:justify-between">
          <div>
            {isPinned && (
              <Button variant="ghost" onClick={handleRemove} className="text-destructive">
                Remover pin
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSave}>Salvar</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
