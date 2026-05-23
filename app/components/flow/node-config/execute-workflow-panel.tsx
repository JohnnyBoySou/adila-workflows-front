/**
 * Painel dedicado pro nó `execute_workflow`.
 *
 * O essencial é trocar o UUID-na-mão por um **picker** que lista os
 * workflows do org. Em cima disso:
 *   - Mostra um card do workflow alvo com nome / status / "abrir em nova aba".
 *   - Detecta o trigger do alvo (start / webhook_trigger) e descreve o shape
 *     de `input` esperado — útil pra quem vai compor o JSON.
 *   - Avisa quando o usuário tenta apontar pro próprio workflow (recursão
 *     direta — o engine não tem detecção de ciclo, derrubaria o worker).
 *   - Mantém `environmentId` e `timeoutMs` num bloco "avançado" mais discreto.
 *
 * Shape persistido em `values` (idêntico ao schema atual):
 *   workflowId: string
 *   input?: unknown (JSON)
 *   environmentId?: string
 *   timeoutMs?: number
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  Check,
  ChevronsUpDown,
  ExternalLink,
  Loader2,
  Search,
  Workflow as WorkflowIcon,
  X,
} from "lucide-react";

import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Textarea } from "~/components/ui/textarea";
import * as workflowsApi from "~/services/workflows";
import type { WorkflowSummary } from "~/services/workflows";
import { queryKeys } from "~/lib/query-keys";
import { cn } from "~/lib/utils";
import { useWorkflowId } from "../workflow-context";

import type { CustomPanelProps } from "./types";

const STATUS_TONE: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  active: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  paused: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  archived: "bg-zinc-500/15 text-zinc-700 dark:text-zinc-400",
};

/* -------------------------------------------------------------------------- */
/* Painel                                                                      */
/* -------------------------------------------------------------------------- */

export function ExecuteWorkflowPanel({ values, onChange, onError }: CustomPanelProps) {
  const currentWorkflowId = useWorkflowId();
  const workflowId = typeof values.workflowId === "string" ? values.workflowId : "";
  const environmentId =
    typeof values.environmentId === "string" ? values.environmentId : "";
  const timeoutMs =
    typeof values.timeoutMs === "number" ? values.timeoutMs : undefined;

  // Lista do org. Limit alto pra evitar paginação dentro do picker — em
  // orgs muito grandes (>200) cairíamos num search server-side.
  const listQuery = useQuery({
    queryKey: [...queryKeys.workflows.all, "picker"] as const,
    queryFn: () => workflowsApi.list({ limit: 200 }),
    staleTime: 30_000,
  });

  // `?? []` cria nova ref a cada render; memoiza pra evitar invalidar
  // os useMemo abaixo e disparar refetch do detail query.
  const items = useMemo(() => listQuery.data?.items ?? [], [listQuery.data]);

  // Detalhe do alvo selecionado — pra mostrar shape do trigger.
  const detailQuery = useQuery({
    queryKey: queryKeys.workflows.detail(workflowId),
    queryFn: () => workflowsApi.get(workflowId),
    enabled: !!workflowId,
    staleTime: 10_000,
  });

  const selected = useMemo(
    () => items.find((w) => w.id === workflowId),
    [items, workflowId],
  );

  // Validação: workflowId obrigatório + alerta de recursão.
  useEffect(() => {
    onError?.(
      "workflowId",
      workflowId.trim() === "" ? "Selecione o workflow alvo." : null,
    );
  }, [workflowId, onError]);

  const isSelfReference =
    !!currentWorkflowId && workflowId === currentWorkflowId;

  return (
    <div className="flex flex-col gap-5">
      <WorkflowPicker
        items={items}
        loading={listQuery.isPending}
        selected={selected ?? null}
        rawId={workflowId}
        currentWorkflowId={currentWorkflowId}
        onSelect={(w) => onChange({ workflowId: w?.id ?? "" })}
      />

      {isSelfReference && (
        <div className="flex items-start gap-2 rounded-md border border-rose-500/30 bg-rose-500/5 p-3 text-xs text-rose-700 dark:text-rose-400">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          <span>
            Este nó aponta pro workflow corrente. O engine vai entrar em recursão e quebrar — selecione um workflow diferente.
          </span>
        </div>
      )}

      {selected && (
        <SelectedWorkflowCard
          workflow={selected}
          detailLoading={detailQuery.isPending}
          definition={detailQuery.data?.definition}
        />
      )}

      <InputEditor
        value={values.input}
        onChange={(v) => onChange({ input: v })}
        onError={(msg) => onError?.("input", msg)}
        triggerHint={triggerHint(detailQuery.data?.definition)}
      />

      <AdvancedBlock
        environmentId={environmentId}
        timeoutMs={timeoutMs}
        onEnvironmentChange={(v) => onChange({ environmentId: v === "" ? undefined : v })}
        onTimeoutChange={(v) => onChange({ timeoutMs: v })}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Picker                                                                      */
/* -------------------------------------------------------------------------- */

function WorkflowPicker({
  items,
  loading,
  selected,
  rawId,
  currentWorkflowId,
  onSelect,
}: {
  items: WorkflowSummary[];
  loading: boolean;
  selected: WorkflowSummary | null;
  rawId: string;
  currentWorkflowId: string | null;
  onSelect: (w: WorkflowSummary | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Fecha ao clicar fora.
  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  useEffect(() => {
    if (open) {
      setQuery("");
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (w) =>
        w.name.toLowerCase().includes(q) ||
        (w.description ?? "").toLowerCase().includes(q) ||
        w.id.toLowerCase().includes(q),
    );
  }, [items, query]);

  // ID conhecido mas não está na lista (workflow deletado / fora do org)?
  const danglingId = rawId && !selected && !loading;

  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-xs font-medium">Workflow alvo</Label>
      <div ref={rootRef} className="relative">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className={cn(
            "flex w-full items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-left text-sm shadow-xs transition-colors hover:bg-muted/40 focus:outline-none focus:ring-2 focus:ring-ring",
            danglingId && "border-amber-500/50",
          )}
        >
          <WorkflowIcon className="size-4 shrink-0 text-muted-foreground" />
          {selected ? (
            <>
              <span className="flex-1 truncate font-medium">{selected.name}</span>
              <StatusBadge status={selected.status} />
            </>
          ) : rawId ? (
            <span className="flex-1 truncate font-mono text-xs text-amber-700 dark:text-amber-400">
              {rawId} (workflow não encontrado)
            </span>
          ) : (
            <span className="flex-1 text-muted-foreground">Selecionar workflow…</span>
          )}
          <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" />
        </button>

        {open && (
          <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-md border border-border bg-popover shadow-md">
            <div className="flex items-center gap-2 border-b border-border px-2 py-1.5">
              <Search className="size-3.5 text-muted-foreground" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar por nome…"
                aria-label="Buscar workflow por nome"
                className="flex-1 bg-transparent text-sm outline-none"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  className="text-muted-foreground hover:text-foreground"
                  aria-label="Limpar busca"
                >
                  <X className="size-3.5" />
                </button>
              )}
            </div>

            <div className="max-h-64 overflow-auto">
              {loading ? (
                <div className="flex items-center justify-center gap-2 px-3 py-6 text-xs text-muted-foreground">
                  <Loader2 className="size-3.5 animate-spin" /> Carregando workflows…
                </div>
              ) : filtered.length === 0 ? (
                <div className="px-3 py-6 text-center text-xs text-muted-foreground">
                  Nenhum workflow {query ? "casou com a busca" : "encontrado"}.
                </div>
              ) : (
                filtered.map((w) => {
                  const isSelf = w.id === currentWorkflowId;
                  const isSelected = w.id === rawId;
                  return (
                    <button
                      type="button"
                      key={w.id}
                      onClick={() => {
                        onSelect(w);
                        setOpen(false);
                      }}
                      className={cn(
                        "flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-muted/60",
                        isSelected && "bg-muted/40",
                      )}
                    >
                      <Check
                        className={cn(
                          "size-3.5 shrink-0",
                          isSelected ? "opacity-100" : "opacity-0",
                        )}
                      />
                      <div className="flex min-w-0 flex-1 flex-col">
                        <span className="flex items-center gap-1.5 truncate font-medium">
                          {w.name}
                          {isSelf && (
                            <span className="rounded bg-rose-500/15 px-1 py-px text-[9px] font-normal text-rose-700 dark:text-rose-400">
                              próprio
                            </span>
                          )}
                        </span>
                        {w.description && (
                          <span className="truncate text-xs text-muted-foreground">
                            {w.description}
                          </span>
                        )}
                      </div>
                      <StatusBadge status={w.status} />
                    </button>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>
      <p className="text-[11px] text-muted-foreground">
        O sub-run executa de forma síncrona dentro deste nó — o output do alvo vira{" "}
        <code className="font-mono">steps[&lt;id&gt;].output</code>.
      </p>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium",
        STATUS_TONE[status] ?? STATUS_TONE.draft,
      )}
    >
      {status}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* Card do workflow selecionado                                                */
/* -------------------------------------------------------------------------- */

function SelectedWorkflowCard({
  workflow,
  detailLoading,
  definition,
}: {
  workflow: WorkflowSummary;
  detailLoading: boolean;
  definition: Record<string, unknown> | undefined;
}) {
  const trigger = useMemo(() => findTrigger(definition), [definition]);

  return (
    <div className="rounded-lg border border-border bg-muted/20 p-3">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-0.5">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-medium">{workflow.name}</span>
            <StatusBadge status={workflow.status} />
          </div>
          {workflow.description && (
            <span className="truncate text-xs text-muted-foreground">
              {workflow.description}
            </span>
          )}
        </div>
        <Button asChild size="sm" variant="ghost" className="gap-1.5">
          <a
            href={`/flow/${workflow.id}`}
            target="_blank"
            rel="noopener noreferrer"
            title="Abrir workflow em nova aba"
          >
            <ExternalLink className="size-3.5" />
            Abrir
          </a>
        </Button>
      </div>

      <div className="flex items-center gap-1.5 border-t border-border pt-2 text-[11px] text-muted-foreground">
        <span className="font-medium text-foreground">Trigger:</span>
        {detailLoading ? (
          <span className="inline-flex items-center gap-1">
            <Loader2 className="size-3 animate-spin" /> carregando…
          </span>
        ) : trigger ? (
          <span className="rounded bg-background px-1.5 py-0.5 font-mono">{trigger}</span>
        ) : (
          <span className="text-amber-700 dark:text-amber-400">não encontrado</span>
        )}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Input editor (JSON)                                                         */
/* -------------------------------------------------------------------------- */

function InputEditor({
  value,
  onChange,
  onError,
  triggerHint,
}: {
  value: unknown;
  onChange: (v: unknown) => void;
  onError: (msg: string | null) => void;
  triggerHint: string | null;
}) {
  // Mantém texto cru editável; só faz parse quando muda. Erro de sintaxe
  // sobe via onError, travando o Salvar.
  const initial = useRef(toJsonText(value));
  const [text, setText] = useState(initial.current);

  // Sincroniza quando o `values.input` vier de fora (ex.: reset ao abrir).
  useEffect(() => {
    const next = toJsonText(value);
    if (next !== text && next !== initial.current) {
      // Não sobrescreve enquanto o usuário digita; só na primeira renderização
      // ou quando o valor externo realmente diverge do snapshot.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  function handleChange(next: string) {
    setText(next);
    if (next.trim() === "") {
      onChange(undefined);
      onError(null);
      return;
    }
    try {
      const parsed = JSON.parse(next);
      onChange(parsed);
      onError(null);
    } catch (e) {
      onError((e as Error).message);
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor="exec-wf-input" className="text-xs font-medium">
        Input do sub-run
      </Label>
      <Textarea
        id="exec-wf-input"
        value={text}
        onChange={(e) => handleChange(e.target.value)}
        placeholder={triggerHint ?? '{ "key": "{{ steps.fetch.body.id }}" }'}
        rows={6}
        spellCheck={false}
        className="font-mono text-xs"
      />
      <p className="text-[11px] text-muted-foreground">
        Objeto JSON passado como <code className="font-mono">ctx.input</code> do sub-run. Templates{" "}
        <code className="font-mono">{"{{ ... }}"}</code> são resolvidos contra o ctx atual antes do envio.
      </p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Advanced                                                                    */
/* -------------------------------------------------------------------------- */

function AdvancedBlock({
  environmentId,
  timeoutMs,
  onEnvironmentChange,
  onTimeoutChange,
}: {
  environmentId: string;
  timeoutMs: number | undefined;
  onEnvironmentChange: (v: string) => void;
  onTimeoutChange: (v: number | undefined) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <details
      open={open}
      onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}
      className="rounded-lg border border-dashed border-border"
    >
      <summary className="cursor-pointer select-none px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground">
        Avançado
      </summary>
      <div className="grid grid-cols-2 gap-3 border-t border-border p-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="exec-wf-env" className="text-xs">
            Environment ID
          </Label>
          <Input
            id="exec-wf-env"
            value={environmentId}
            onChange={(e) => onEnvironmentChange(e.target.value)}
            placeholder="(opcional)"
            spellCheck={false}
          />
          <p className="text-[11px] text-muted-foreground">
            Força o sub-run em um environment específico. Vazio = mesmo do pai.
          </p>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="exec-wf-timeout" className="text-xs">
            Timeout (ms)
          </Label>
          <Input
            id="exec-wf-timeout"
            type="number"
            min={0}
            value={timeoutMs ?? ""}
            onChange={(e) =>
              onTimeoutChange(e.target.value === "" ? undefined : Number(e.target.value))
            }
            placeholder="60000"
          />
          <p className="text-[11px] text-muted-foreground">
            Default 60s, máximo 5min.
          </p>
        </div>
      </div>
    </details>
  );
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

function toJsonText(v: unknown): string {
  if (v === undefined || v === null) return "";
  if (typeof v === "string") return v;
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return "";
  }
}

interface DefinitionLike {
  nodes?: Array<{ id?: string; type?: string }>;
}

/** Acha o trigger do workflow alvo — espelha `findStart` do executor. */
function findTrigger(definition: unknown): string | null {
  if (!definition || typeof definition !== "object") return null;
  const def = definition as DefinitionLike;
  const nodes = Array.isArray(def.nodes) ? def.nodes : [];
  const trigger = nodes.find((n) => n?.type === "start" || n?.type === "webhook_trigger");
  return trigger?.type ?? null;
}

function triggerHint(definition: unknown): string | null {
  const t = findTrigger(definition);
  if (!t) return null;
  if (t === "webhook_trigger") {
    return '{\n  "body": { /* o que viria no POST do webhook */ }\n}';
  }
  // start manual: input é livre — sugerimos um objeto vazio só pra dar shape.
  return '{\n  /* objeto passado como ctx.input no sub-run */\n}';
}
