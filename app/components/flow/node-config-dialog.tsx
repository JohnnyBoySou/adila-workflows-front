/**
 * Dialog genérico que renderiza qualquer `NodeConfigSchema`.
 *
 * Aberto via duplo-clique num nó no canvas. Trabalha com um estado local
 * `draft` desde o open; só persiste de volta em `node.data` quando o
 * usuário clica em "Salvar". O canvas marca dirty via mudança em
 * `nodes` — o `onDirtyChange` no Flow já cuida do save debounced.
 */
import { useEffect, useMemo, useState } from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { Button } from "~/components/ui/button";

import { FieldRenderer } from "./node-config/fields";
import { getNodeConfigSchema } from "./node-config/schemas";
import type { FieldDef, NodeConfigSchema } from "./node-config/types";

export interface NodeConfigDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Tipo do nó no engine (ou "sticky_note"/"container" para visuais). */
  nodeType: string | undefined;
  /** Título do nó (mostrado no header pra dar contexto). */
  nodeTitle?: string;
  /** Valores iniciais — geralmente `node.data` (sem campos meta). */
  values: Record<string, unknown>;
  /** Chamado com o objeto completo de valores ao confirmar. */
  onSave: (next: Record<string, unknown>) => void;
}

export function NodeConfigDialog({
  open,
  onOpenChange,
  nodeType,
  nodeTitle,
  values,
  onSave,
}: NodeConfigDialogProps) {
  const schema = useMemo(() => getNodeConfigSchema(nodeType), [nodeType]);

  // Cópia local — não tocamos no nó até o save. Re-inicializa quando o
  // dialog reabre ou quando o tipo de nó muda.
  const [draft, setDraft] = useState<Record<string, unknown>>(values);

  useEffect(() => {
    if (open) setDraft({ ...values });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, nodeType]);

  if (!schema) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Sem configuração</DialogTitle>
            <DialogDescription>
              Este tipo de nó ({nodeType ?? "?"}) não possui campos editáveis.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  function setFieldValue(name: string, next: unknown) {
    setDraft((prev) => {
      const nextDraft = { ...prev };
      if (next === undefined || next === "" || (Array.isArray(next) && next.length === 0)) {
        delete nextDraft[name];
      } else {
        nextDraft[name] = next;
      }
      return nextDraft;
    });
  }

  function handleSave() {
    onSave(draft);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] flex-col gap-0 sm:max-w-2xl">
        <DialogHeader className="border-b border-border pb-3">
          <DialogTitle className="flex items-center gap-2 text-base">
            {schema.title}
            {nodeTitle && nodeTitle !== schema.title && (
              <span className="text-xs font-normal text-muted-foreground">· {nodeTitle}</span>
            )}
          </DialogTitle>
          {schema.description && (
            <DialogDescription className="text-xs">{schema.description}</DialogDescription>
          )}
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-1 py-4">
          <FieldsList schema={schema} values={draft} onChange={setFieldValue} />
        </div>

        <DialogFooter className="border-t border-border pt-3">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSave}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FieldsList({
  schema,
  values,
  onChange,
}: {
  schema: NodeConfigSchema;
  values: Record<string, unknown>;
  onChange: (name: string, next: unknown) => void;
}) {
  if (schema.fields.length === 0) {
    return (
      <p className="px-3 text-xs text-muted-foreground">
        Sem configuração necessária — este nó funciona com defaults.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-4 px-3">
      {schema.fields.map((field) => {
        if (field.visibleWhen && !field.visibleWhen(values)) return null;
        return (
          <FieldRenderer
            key={field.name}
            field={field as FieldDef}
            value={values[field.name]}
            onChange={(next) => onChange(field.name, next)}
          />
        );
      })}
    </div>
  );
}
