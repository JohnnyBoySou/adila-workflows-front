/**
 * Dialog genérico que renderiza qualquer `NodeConfigSchema`.
 *
 * Aberto via duplo-clique num nó no canvas. Trabalha com um estado local
 * `draft` desde o open; só persiste de volta em `node.data` quando o
 * usuário clica em "Salvar". O canvas marca dirty via mudança em
 * `nodes` — o `onDirtyChange` no Flow já cuida do save debounced.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronRight, GripVertical, Maximize2, Pencil, Pin, PinOff } from "lucide-react";

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
import { NODE_ICON_MAP } from "./node-library";
import { JsonTree } from "./json-tree";

/** Metadados editor-only do card no canvas (só nós executáveis). */
export interface NodeMeta {
  title?: string;
  description?: string;
  /** Override hex pra cor do ícone. Quando vazio cai no default do nodeType. */
  iconColor?: string;
}

/** Paleta de cores rápida pra customização do ícone do nó. */
const ICON_COLOR_PALETTE = [
  "#10b981", // emerald
  "#0ea5e9", // sky
  "#f59e0b", // amber
  "#ef4444", // rose
  "#8b5cf6", // violet
  "#ec4899", // pink
  "#14b8a6", // teal
  "#f97316", // orange
  "#6366f1", // indigo
  "#64748b", // slate
];

/**
 * Item de input pra exibir na coluna esquerda — cada upstream contribui
 * com seu próprio output. O usuário arrasta paths daqui pros campos
 * (coluna meio). N8N usa estrutura similar com `$('Node').item.json`.
 */
export type UpstreamInput = {
  /** ID do nó upstream (usado pra construir `steps.<id>.path`). */
  nodeId: string;
  /** Label humano (título customizado ou nodeType). */
  label: string;
  /** Output bruto do step desse upstream no run focado (ou pinned data). */
  output: unknown;
  /** `true` quando o dado veio de pinned data — mostra ícone amarelo. */
  pinned?: boolean;
};

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

  /**
   * Dados de upstream pra coluna esquerda (Input). Quando vazio/undefined,
   * o layout colapsa pra 1 coluna (Parameters apenas) — comportamento
   * original. Quando passado, mostra árvore JSON arrastável.
   */
  upstreamInputs?: UpstreamInput[];
  /** Output do próprio node no run focado (pra coluna direita). */
  outputData?: unknown;
  /** `true` se output deste nó está pinado. Toggle via `onTogglePin`. */
  outputPinned?: boolean;
  /**
   * `true` quando `outputData` é um exemplo gerado (não veio de run real nem
   * de pin). Mostra banner "Exemplo — execute pra ver o real" no topo.
   */
  outputIsSample?: boolean;
  /** Pin/unpin do output atual — quando ausente, botão fica oculto. */
  onTogglePin?: () => void;
  /**
   * Abre editor de output (JSON livre) — útil pra forjar saídas e testar
   * o downstream sem rodar API/IA. Salvar no editor pina o JSON digitado.
   */
  onEditOutput?: () => void;
}

export function NodeConfigDialog({
  open,
  onOpenChange,
  nodeId,
  nodeType,
  meta,
  values,
  onSave,
  upstreamInputs,
  outputData,
  outputPinned,
  outputIsSample,
  onTogglePin,
  onEditOutput,
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
  const containerRef = useRef<HTMLDivElement>(null);

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

  // Resize livre das 3 colunas — guardamos a fração (0-1) das colunas left
  // e right; meio = 1 - left - right. Persiste no localStorage.
  // IMPORTANTE: hooks ANTES do early return `if (!schema)`.
  const [colSplit, setColSplit] = useState<{ left: number; right: number }>(() => {
    if (typeof window === "undefined") return { left: 0.28, right: 0.28 };
    try {
      const v = window.localStorage.getItem("adila.dialog.colSplit");
      if (v) {
        const p = JSON.parse(v);
        if (typeof p.left === "number" && typeof p.right === "number") return p;
      }
    } catch {
      /* fallback */
    }
    return { left: 0.28, right: 0.28 };
  });
  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("adila.dialog.colSplit", JSON.stringify(colSplit));
    }
  }, [colSplit]);
  const resetCols = useCallback(() => setColSplit({ left: 0.28, right: 0.28 }), []);

  // sampleContext pro customPanel (também antes do early return)
  const sampleContext = useMemo(() => {
    if (!upstreamInputs || upstreamInputs.length === 0) return undefined;
    const steps: Record<string, Record<string, unknown>> = {};
    let input: Record<string, unknown> | undefined;
    for (const up of upstreamInputs) {
      const out = up.output && typeof up.output === "object" ? (up.output as Record<string, unknown>) : {};
      steps[up.nodeId] = out;
      if (!input) input = out;
    }
    return { input, vars: {}, env: {}, steps };
  }, [upstreamInputs]);

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
  const currentTitle = metaDraft.title?.trim() || schema?.title || nodeType || "Sem configuração";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "flex flex-col gap-0 h-[95vh] !max-w-[95vw] sm:!max-w-[95vw]",
        )}
      >
        <DialogHeader className="-mx-4 -mt-4 rounded-t-xl border-b border-border bg-muted/50 px-4 pb-3 pt-4">
          {showMeta ? (
            <div className="flex items-start gap-3 pr-6">
              <NodeIconSwatch
                nodeType={nodeType}
                color={metaDraft.iconColor}
                onChange={(next) => setMetaDraft({ ...metaDraft, iconColor: next })}
              />
              <div className="min-w-0 flex-1 space-y-1">
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
            </div>
          ) : (
            <div className="flex items-start gap-3">
              <NodeIconSwatch nodeType={nodeType} color={undefined} />
              <div className="min-w-0 flex-1">
                <DialogTitle>{currentTitle}</DialogTitle>
                {schema.description && (
                  <DialogDescription className="text-xs">{schema.description}</DialogDescription>
                )}
              </div>
            </div>
          )}
        </DialogHeader>

        {/* Layout 3 colunas estilo n8n: SEMPRE renderizado (mesmo sem dados).
            Larguras controladas por `colSplit` (frações) e ajustáveis via drag
            nas divisórias verticais. Reset pra 28%/44%/28% via botão "↺". */}
        {true ? (
          <div
            className="flex flex-1 overflow-hidden border-t border-border"
            ref={containerRef}
          >
            {/* ── Input (esquerda) ───────────────────────────────────────── */}
            <div
              className="flex flex-col overflow-hidden bg-muted/20"
              style={{ flexBasis: `${colSplit.left * 100}%`, flexGrow: 0, flexShrink: 0 }}
            >
              <div className="border-b border-border bg-muted/40 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Input — arraste pra um campo
              </div>
              <div className="flex-1 overflow-y-auto py-2">
                {upstreamInputs && upstreamInputs.length > 0 ? (
                  upstreamInputs.map((up) => (
                    <UpstreamSection key={up.nodeId} upstream={up} />
                  ))
                ) : (
                  <p className="px-3 py-2 text-[11px] italic text-muted-foreground">
                    Sem dados de entrada. Execute o workflow ou conecte um upstream.
                  </p>
                )}
              </div>
            </div>

            {/* Resize handle entre Input e Parameters */}
            <ResizeHandle
              onDrag={(deltaPx) => {
                if (!containerRef.current) return;
                const w = containerRef.current.offsetWidth || 1;
                setColSplit((s) => {
                  const next = Math.min(0.6, Math.max(0.1, s.left + deltaPx / w));
                  return { ...s, left: next };
                });
              }}
            />

            {/* ── Parameters (meio) ──────────────────────────────────────── */}
            <div
              className="flex flex-col overflow-hidden"
              style={{
                flexBasis: `${(1 - colSplit.left - colSplit.right) * 100}%`,
                flexGrow: 1,
                flexShrink: 1,
                minWidth: 200,
              }}
            >
              <div className="flex items-center justify-between border-b border-border bg-muted/40 px-3 py-1.5">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Parâmetros
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={resetCols}
                  className="h-6 gap-1 px-2 text-[11px]"
                  title="Resetar larguras das colunas (28% / 44% / 28%)"
                >
                  <Maximize2 className="size-3" />
                  Reset
                </Button>
              </div>
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
                      sampleContext={sampleContext}
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
                ) : visibleFields.length > 0 ? (
                  <FieldsList
                    schema={schema}
                    values={draft}
                    errors={allErrors}
                    onChange={setFieldValue}
                    onParseError={setParseError}
                  />
                ) : null}
                {nodeType === "webhook_trigger" && workflowId && nodeId && (
                  <div className="px-3">
                    <WebhookTriggerExtras workflowId={workflowId as string} nodeId={nodeId as string} />
                  </div>
                )}
              </div>
            </div>

            {/* Resize handle entre Parameters e Output */}
            <ResizeHandle
              onDrag={(deltaPx) => {
                if (!containerRef.current) return;
                const w = containerRef.current.offsetWidth || 1;
                setColSplit((s) => {
                  const next = Math.min(0.6, Math.max(0.1, s.right - deltaPx / w));
                  return { ...s, right: next };
                });
              }}
            />

            {/* ── Output (direita) ───────────────────────────────────────── */}
            <div
              className="flex flex-col overflow-hidden bg-muted/20"
              style={{ flexBasis: `${colSplit.right * 100}%`, flexGrow: 0, flexShrink: 0 }}
            >
              <div className="flex items-center justify-between border-b border-border bg-muted/40 px-3 py-1.5">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Output
                  {outputPinned && " (pinado)"}
                  {outputIsSample && !outputPinned && (
                    <span className="ml-1.5 rounded bg-sky-500/15 px-1.5 py-0.5 text-[9px] font-medium normal-case tracking-normal text-sky-600 dark:text-sky-400">
                      exemplo
                    </span>
                  )}
                </span>
                <div className="flex items-center gap-1">
                  {onEditOutput && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={onEditOutput}
                      className="h-6 gap-1 px-2 text-[11px]"
                      title="Editar JSON — abre editor pra colocar/alterar valores do output. Útil pra forjar respostas e testar downstream sem rodar a tarefa."
                    >
                      <Pencil className="size-3" />
                      Editar
                    </Button>
                  )}
                  {onTogglePin && (
                    <Button
                      variant={outputPinned ? "default" : "ghost"}
                      size="sm"
                      onClick={onTogglePin}
                      className={cn(
                        "h-6 gap-1 px-2 text-[11px]",
                        outputPinned && "bg-amber-500 text-white hover:bg-amber-600",
                      )}
                      title={
                        outputPinned
                          ? "Remover pin — node volta a executar normalmente"
                          : "Pinar output — próximas execuções pulam este nó e usam este JSON"
                      }
                    >
                      {outputPinned ? (
                        <>
                          <PinOff className="size-3" />
                          Despinar
                        </>
                      ) : (
                        <>
                          <Pin className="size-3" />
                          Pinar
                        </>
                      )}
                    </Button>
                  )}
                </div>
              </div>
              <div className="flex-1 overflow-y-auto py-2">
                {outputIsSample && !outputPinned && (
                  <div className="mx-3 mb-2 rounded-md border border-sky-500/30 bg-sky-500/5 px-2.5 py-1.5 text-[10px] text-sky-700 dark:text-sky-300">
                    Exemplo de payload — execute o workflow ou pine pra usar dados reais.
                    Use os campos abaixo pra montar templates <code className="rounded bg-sky-500/10 px-1">{`{{ prev.body.X }}`}</code>.
                  </div>
                )}
                <JsonTree
                  data={outputData}
                  buildExpression={(path) => buildSelfExpression(nodeId, path)}
                />
              </div>
            </div>
          </div>
        ) : (
        <div
          className={cn(
            "flex-1 overflow-y-auto py-4",
            nodeType === "http_request" ? "px-0" : "px-1",
          )}
        >
          <CustomPanelOrFields
            schema={schema}
            visibleFieldsLength={visibleFields.length}
            nodeId={nodeId}
            nodeType={nodeType}
            draft={draft}
            setDraft={setDraft}
            errors={allErrors}
            onParseError={setParseError}
            setFieldValue={setFieldValue}
            metaDraft={metaDraft}
            setMetaDraft={setMetaDraft}
            showMeta={showMeta}
          />
          {nodeType === "webhook_trigger" && workflowId && nodeId && (
            <div className="px-3">
              <WebhookTriggerExtras workflowId={workflowId as string} nodeId={nodeId as string} />
            </div>
          )}
        </div>
        )}

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

/**
 * Bloco do ícone do nó com paleta opcional. Quando `onChange` é fornecido,
 * o swatch fica clicável e expande a paleta de cores ao lado. Persistência
 * é feita pelo dialog via `metaDraft.iconColor`.
 */
function NodeIconSwatch({
  nodeType,
  color,
  onChange,
}: {
  nodeType: string | undefined;
  color: string | undefined;
  onChange?: (next: string | undefined) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const iconEntry = nodeType ? NODE_ICON_MAP[nodeType] : undefined;
  const Icon = iconEntry?.icon;
  const defaultColorClass = iconEntry?.color ?? "text-muted-foreground";
  const editable = !!onChange;

  // Quando há cor custom, aplicamos via style inline (color + bg com alpha
  // ~15%, achados via hex+"26"). Sem custom, usamos as classes do tailwind
  // do mapa de ícones.
  const swatchStyle = color
    ? { color, backgroundColor: `${color}26` }
    : undefined;

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => editable && setOpen((v) => !v)}
        disabled={!editable}
        title={editable ? "Clique para trocar a cor do ícone" : undefined}
        className={cn(
          "grid size-9 place-items-center rounded-md transition-shadow",
          !color && (iconEntry ? "bg-muted" : "bg-muted"),
          editable && "cursor-pointer hover:ring-2 hover:ring-ring/40",
          open && "ring-2 ring-ring",
        )}
        style={swatchStyle}
        aria-label="Cor do ícone"
      >
        {Icon ? (
          <Icon className={cn("size-4", !color && defaultColorClass)} />
        ) : (
          <span className="size-4 rounded-sm bg-foreground/20" />
        )}
      </button>
      {open && editable && (
        <div className="absolute left-0 top-full z-50 mt-1 flex items-center gap-1 rounded-md border border-border bg-popover p-1.5 shadow-lg">
          {ICON_COLOR_PALETTE.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => {
                onChange?.(c);
                setOpen(false);
              }}
              className={cn(
                "size-5 cursor-pointer rounded-full ring-offset-2 ring-offset-popover transition-transform hover:scale-110",
                color === c && "ring-2 ring-foreground",
              )}
              style={{ backgroundColor: c }}
              aria-label={`Cor ${c}`}
            />
          ))}
          {color && (
            <button
              type="button"
              onClick={() => {
                onChange?.(undefined);
                setOpen(false);
              }}
              className="ml-1 cursor-pointer rounded px-1.5 py-0.5 text-[10px] text-muted-foreground hover:bg-muted hover:text-foreground"
              title="Voltar à cor padrão do tipo"
            >
              Reset
            </button>
          )}
        </div>
      )}
    </div>
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

/**
 * Cada upstream vira um bloco colapsável com `label` + JsonTree.
 * Drag de uma folha gera `{{ steps.<upstream.nodeId>.path }}` — formato
 * que o `template.ts` (back) resolve em runtime.
 */
function UpstreamSection({ upstream }: { upstream: UpstreamInput }) {
  // Colapsado por padrão — quando há vários upstreams (cadeia longa),
  // abrir todos cria parede de JSON e atrapalha. User clica pra expandir.
  const [open, setOpen] = useState(false);

  const buildExpression = useCallback(
    (path: Array<string | number>): string => {
      const pathStr = path.map((p) => (typeof p === "number" ? `[${p}]` : p)).join(".");
      const isTriggerLike =
        upstream.nodeId === "" ||
        /^(start|trigger|manual|webhook)/i.test(upstream.nodeId);
      const root = isTriggerLike ? "input" : `steps.${upstream.nodeId}`;
      return `{{ ${pathStr ? `${root}.${pathStr}` : root} }}`;
    },
    [upstream.nodeId],
  );

  // Conta de chaves no top-level pra mostrar preview no header colapsado.
  const topLevelCount =
    upstream.output && typeof upstream.output === "object"
      ? Array.isArray(upstream.output)
        ? upstream.output.length
        : Object.keys(upstream.output).length
      : 0;

  return (
    <div className="border-b border-border/60 last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-1.5 px-3 py-1.5 text-left text-[11px] font-medium text-foreground/80 hover:bg-muted/60"
      >
        {open ? (
          <ChevronDown className="size-3 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="size-3 shrink-0 text-muted-foreground" />
        )}
        {upstream.pinned && (
          <Pin className="size-3 text-amber-500" aria-label="Pinado" />
        )}
        <span className="truncate">{upstream.label}</span>
        <span className="ml-auto text-[10px] text-muted-foreground">
          {Array.isArray(upstream.output) ? `[${topLevelCount}]` : `{${topLevelCount}}`}
        </span>
      </button>
      {open && <JsonTree data={upstream.output} buildExpression={buildExpression} />}
    </div>
  );
}

/**
 * Handle vertical de resize — barra fina draggable entre 2 colunas.
 * Usa pointer events pra cobrir mouse + touch + caneta. O caller recebe
 * `deltaPx` (delta acumulado em px) a cada movimento.
 */
function ResizeHandle({ onDrag }: { onDrag: (deltaPx: number) => void }) {
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      onPointerDown={(e) => {
        e.preventDefault();
        const startX = e.clientX;
        const target = e.currentTarget;
        target.setPointerCapture(e.pointerId);
        let lastX = startX;
        const onMove = (ev: PointerEvent) => {
          const delta = ev.clientX - lastX;
          lastX = ev.clientX;
          if (delta !== 0) onDrag(delta);
        };
        const onUp = (ev: PointerEvent) => {
          target.releasePointerCapture(ev.pointerId);
          target.removeEventListener("pointermove", onMove);
          target.removeEventListener("pointerup", onUp);
        };
        target.addEventListener("pointermove", onMove);
        target.addEventListener("pointerup", onUp);
      }}
      className="group relative w-1 shrink-0 cursor-col-resize bg-border transition-colors hover:bg-primary/60 active:bg-primary"
    >
      {/* área de clique expandida + ícone visual no hover */}
      <div className="absolute inset-y-0 -left-1.5 -right-1.5" />
      <span className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 opacity-0 transition-opacity group-hover:opacity-100">
        <GripVertical className="size-4 text-primary" />
      </span>
    </div>
  );
}

/** Helper exposto pro Output (coluna direita) — usa o próprio nó. */
function buildSelfExpression(
  nodeId: string | undefined,
  path: Array<string | number>,
): string {
  const pathStr = path.map((p) => (typeof p === "number" ? `[${p}]` : p)).join(".");
  const root = nodeId ? `steps.${nodeId}` : "output";
  return `{{ ${pathStr ? `${root}.${pathStr}` : root} }}`;
}

/* -------------------------------------------------------------------------- */
/* CustomPanelOrFields — extraído pra TS estreitar `schema` corretamente.    */
/*                                                                            */
/* Encapsular nesse component permite que o type-narrowing aconteça nos       */
/* parâmetros (não-nulos por contrato) em vez de tentar inline no JSX.        */
/* -------------------------------------------------------------------------- */
function CustomPanelOrFields(props: {
  schema: NodeConfigSchema | null;
  visibleFieldsLength: number;
  nodeId: string | undefined;
  nodeType: string | undefined;
  draft: Record<string, unknown>;
  setDraft: React.Dispatch<React.SetStateAction<Record<string, unknown>>>;
  errors: Record<string, string>;
  onParseError: (k: string, msg: string | null) => void;
  setFieldValue: (k: string, v: unknown) => void;
  metaDraft: NodeMeta;
  setMetaDraft: React.Dispatch<React.SetStateAction<NodeMeta>>;
  showMeta: boolean;
}) {
  const {
    schema,
    visibleFieldsLength,
    nodeId,
    nodeType,
    draft,
    setDraft,
    errors,
    onParseError,
    setFieldValue,
    metaDraft,
    setMetaDraft,
    showMeta,
  } = props;
  if (!schema) return null;
  const CustomPanel = schema.customPanel;
  if (CustomPanel) {
    return (
      <div
        className={cn(
          schema.dialogSize === "full" && "h-full",
          nodeType === "http_request" ? "px-1" : "px-3",
        )}
      >
        <CustomPanel
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
          onError={onParseError}
          meta={schema.customPanelOwnsMeta && showMeta ? metaDraft : undefined}
          onMetaChange={
            schema.customPanelOwnsMeta && showMeta
              ? (next) => setMetaDraft(next)
              : undefined
          }
        />
      </div>
    );
  }
  if (visibleFieldsLength > 0) {
    return (
      <FieldsList
        schema={schema}
        values={draft}
        errors={errors}
        onChange={setFieldValue}
        onParseError={onParseError}
      />
    );
  }
  return null;
}
