/**
 * Dialog genérico que renderiza qualquer `NodeConfigSchema`.
 *
 * Aberto via duplo-clique num nó no canvas. Trabalha com um estado local
 * `draft` desde o open; só persiste de volta em `node.data` quando o
 * usuário clica em "Salvar". O canvas marca dirty via mudança em
 * `nodes` — o `onDirtyChange` no Flow já cuida do save debounced.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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
import { cn } from "~/lib/utils";
import { useWorkflowId } from "./workflow-context";
import { WebhookTriggerExtras } from "./webhook-trigger-extras";

/** Metadados editor-only do card no canvas (só nós executáveis). */
export interface NodeMeta {
  title?: string;
  description?: string;
}

export interface NodeConfigDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** ID do node no canvas — usado por painéis extras (ex.: webhook_trigger). */
  nodeId?: string;
  /** Tipo do nó no engine (ou "sticky_note"/"container" para visuais). */
  nodeType: string | undefined;
  /**
   * Metadados editor-only (título e descrição exibidos no card).
   * Quando definido, o dialog mostra os dois campos no topo. Visuais
   * (sticky/container) não usam esses campos — passe `undefined`.
   */
  meta?: NodeMeta;
  /** Valores iniciais — geralmente `node.data` (sem campos meta). */
  values: Record<string, unknown>;
  /** Chamado com os valores e (se aplicável) o meta atualizado. */
  onSave: (next: Record<string, unknown>, meta?: NodeMeta) => void;
}

export function NodeConfigDialog({
  open,
  onOpenChange,
  nodeId,
  nodeType,
  meta,
  values,
  onSave,
}: NodeConfigDialogProps) {
  const schema = useMemo(() => getNodeConfigSchema(nodeType), [nodeType]);
  const workflowId = useWorkflowId();

  // Cópia local — não tocamos no nó até o save. Re-inicializa quando o
  // dialog reabre ou quando o tipo de nó muda.
  const [draft, setDraft] = useState<Record<string, unknown>>(values);
  const [metaDraft, setMetaDraft] = useState<NodeMeta>(meta ?? {});

  // Erros internos dos editors (atualmente só JSON inválido). Indexado
  // pelo `name` do campo. O Salvar fica disabled enquanto houver entradas.
  const [parseErrors, setParseErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (open) {
      setDraft({ ...values });
      setMetaDraft({ ...(meta ?? {}) });
      setParseErrors({});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, nodeType]);

  const setParseError = useCallback((name: string, msg: string | null) => {
    setParseErrors((prev) => {
      const next = { ...prev };
      if (msg === null) delete next[name];
      else next[name] = msg;
      return next;
    });
  }, []);

  // ── Validação ─────────────────────────────────────────────────────────
  // Campos ocultos por visibleWhen não são validados — não fazem parte
  // do "salvo" lógico do nó. Todos os `useMemo` precisam rodar antes de
  // qualquer early-return: a ordem de hooks não pode variar entre renders
  // (ex.: alternar pra um nodeType sem schema mudaria o número de hooks).
  const visibleFields = useMemo(
    () => (schema ? schema.fields.filter((f) => !f.visibleWhen || f.visibleWhen(draft)) : []),
    [schema, draft],
  );

  const validationErrors = useMemo(() => {
    const errs: Record<string, string> = {};
    for (const f of visibleFields) {
      if (!f.required) continue;
      const v = draft[f.name];
      const empty =
        v === undefined ||
        v === null ||
        v === "" ||
        (Array.isArray(v) && v.length === 0) ||
        (typeof v === "object" && !Array.isArray(v) && Object.keys(v as object).length === 0);
      if (empty) errs[f.name] = "Campo obrigatório.";
    }
    return errs;
  }, [visibleFields, draft]);

  const allErrors = useMemo<Record<string, string>>(
    () => ({ ...validationErrors, ...parseErrors }),
    [validationErrors, parseErrors],
  );

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

  const hasErrors = Object.keys(allErrors).length > 0;

  function handleSave() {
    if (hasErrors) return;
    onSave(draft, meta !== undefined ? metaDraft : undefined);
    onOpenChange(false);
  }

  const showMeta = meta !== undefined;
  const currentTitle = metaDraft.title?.trim() || schema.title;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "flex flex-col gap-0",
          schema.dialogSize === "full"
            ? "h-[95vh] !max-w-[95vw] sm:!max-w-[95vw]"
            : "max-h-[90vh]",
          schema.dialogSize === "full"
            ? ""
            : schema.dialogSize === "wide"
              ? "sm:max-w-6xl"
              : schema.customPanel
                ? "sm:max-w-4xl"
                : "sm:max-w-2xl",
        )}
      >
        <DialogHeader className="-mx-4 -mt-4 rounded-t-xl border-b border-border bg-muted/50 px-4 pb-3 pt-4">
          {showMeta ? (
            <div className="space-y-1 pr-6">
              <DialogTitle asChild>
                <EditableTitle
                  value={metaDraft.title ?? ""}
                  fallback={schema.title}
                  onChange={(next) => setMetaDraft({ ...metaDraft, title: next })}
                />
              </DialogTitle>
              <EditableDescription
                value={metaDraft.description ?? ""}
                placeholder="Duplo-clique para adicionar uma descrição no card"
                onChange={(next) => setMetaDraft({ ...metaDraft, description: next })}
              />
            </div>
          ) : (
            <>
              <DialogTitle>{currentTitle}</DialogTitle>
              {schema.description && (
                <DialogDescription className="text-xs">{schema.description}</DialogDescription>
              )}
            </>
          )}
        </DialogHeader>

        <div
          className={cn(
            "flex-1 overflow-y-auto py-4",
            nodeType === "http_request" ? "px-0" : "px-1",
          )}
        >
          {schema.customPanel ? (
            <div
              className={cn(
                schema.dialogSize === "full" && "h-full",
                nodeType === "http_request" ? "px-1" : "px-3",
              )}
            >
              <schema.customPanel
                values={draft}
                nodeId={nodeId}
                onChange={(patch) =>
                  setDraft((prev) => {
                    const next = { ...prev };
                    for (const [k, v] of Object.entries(patch)) {
                      if (v === undefined) delete next[k];
                      else next[k] = v;
                    }
                    return next;
                  })
                }
                onError={setParseError}
                meta={
                  schema.customPanelOwnsMeta && showMeta ? metaDraft : undefined
                }
                onMetaChange={
                  schema.customPanelOwnsMeta && showMeta
                    ? (next) => setMetaDraft(next)
                    : undefined
                }
              />
            </div>
          ) : (
            <FieldsList
              schema={schema}
              values={draft}
              errors={allErrors}
              onChange={setFieldValue}
              onParseError={setParseError}
            />
          )}
          {nodeType === "webhook_trigger" && workflowId && nodeId && (
            <div className="px-3">
              <WebhookTriggerExtras
                workflowId={workflowId}
                nodeId={nodeId}
                responseMode={draft.responseMode as "async" | "sync" | undefined}
                responseTimeoutMs={draft.responseTimeoutMs as number | undefined}
              />
            </div>
          )}
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
          {hasErrors && (
            <p className="mr-auto text-[11px] text-destructive">
              Corrija os campos destacados para salvar.
            </p>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={hasErrors}>
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Título do card: duplo-clique → input; Enter ou blur comitam, Escape descarta. */
function EditableTitle({
  value,
  fallback,
  onChange,
}: {
  value: string;
  fallback: string;
  onChange: (next: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [buffer, setBuffer] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      setBuffer(value);
      // Foca e seleciona após o input montar.
      requestAnimationFrame(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      });
    }
  }, [editing, value]);

  function commit() {
    onChange(buffer.trim());
    setEditing(false);
  }

  function cancel() {
    setEditing(false);
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="text"
        value={buffer}
        onChange={(e) => setBuffer(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          } else if (e.key === "Escape") {
            e.preventDefault();
            cancel();
          }
        }}
        maxLength={120}
        placeholder={fallback}
        aria-label="Renomear nó"
        className="min-w-0 flex-1 border-b border-primary bg-transparent text-base font-semibold outline-none"
      />
    );
  }

  const displayed = value.trim() || fallback;
  return (
    <span
      role="button"
      tabIndex={0}
      onDoubleClick={() => setEditing(true)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          setEditing(true);
        }
      }}
      title="Duplo-clique para renomear"
      className="-mx-1 cursor-text rounded px-1 hover:bg-muted/60"
    >
      {displayed}
    </span>
  );
}

/** Descrição do card no header: duplo-clique → input; Enter ou blur comitam, Escape descarta. */
function EditableDescription({
  value,
  placeholder,
  onChange,
}: {
  value: string;
  placeholder: string;
  onChange: (next: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [buffer, setBuffer] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      setBuffer(value);
      requestAnimationFrame(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      });
    }
  }, [editing, value]);

  function commit() {
    onChange(buffer.trim());
    setEditing(false);
  }

  function cancel() {
    setEditing(false);
  }

  const lineClass =
    "block h-5 w-full min-w-0 truncate px-1 text-xs leading-5 -mx-1 rounded hover:bg-muted/60";

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="text"
        value={buffer}
        onChange={(e) => setBuffer(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          } else if (e.key === "Escape") {
            e.preventDefault();
            cancel();
          }
        }}
        maxLength={280}
        placeholder={placeholder}
        aria-label="Descrição do nó no canvas"
        className={cn(
          lineClass,
          "cursor-text border-b border-primary bg-transparent text-muted-foreground outline-none hover:bg-transparent",
        )}
      />
    );
  }

  const displayed = value.trim();
  return (
    <span
      role="button"
      tabIndex={0}
      onDoubleClick={() => setEditing(true)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          setEditing(true);
        }
      }}
      title="Duplo-clique para editar a descrição"
      className={cn(
        lineClass,
        "cursor-text",
        displayed ? "text-muted-foreground" : "text-muted-foreground/60 italic",
      )}
    >
      {displayed || placeholder}
    </span>
  );
}

function FieldsList({
  schema,
  values,
  errors,
  onChange,
  onParseError,
}: {
  schema: NodeConfigSchema;
  values: Record<string, unknown>;
  errors: Record<string, string>;
  onChange: (name: string, next: unknown) => void;
  onParseError: (name: string, msg: string | null) => void;
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
            error={errors[field.name] ?? null}
            onChange={(next) => onChange(field.name, next)}
            onParseError={(msg) => onParseError(field.name, msg)}
          />
        );
      })}
    </div>
  );
}
