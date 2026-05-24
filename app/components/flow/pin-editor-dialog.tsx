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
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        setError("O output deve ser um objeto JSON (ex.: { \"foo\": 1 }).");
        return;
      }
      pinnedDataApi.set(workflowId, nodeId, parsed as Record<string, unknown>);
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
            entradas de teste sem disparar APIs upstream.
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
