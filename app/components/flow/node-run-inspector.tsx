/**
 * Inspector lateral de execução por nó.
 *
 * Abre como sheet à direita do canvas quando o usuário clica num nó que
 * tem step registrado no run em foco. Mostra:
 *   - Status + duração + timestamps
 *   - Input recebido pelo nó
 *   - Output emitido (ou erro, se falhou)
 *
 * Lê tudo do `useExecutionStore` — alimentado pelo `RunDetailPanel` da aba
 * Executions. Se o run mudar (usuário seleciona outro), o conteúdo segue.
 *
 * O componente é "controlled by parent" (parent decide `nodeId` e abertura).
 * Mantemos assim porque o canvas e o inspector trocam sinais via callbacks
 * — o store guarda dados, não estado de UI.
 */
import { Ban, CheckCircle2, Loader2, Pin, PinOff, XCircle, type LucideIcon } from "lucide-react";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "~/components/ui/sheet";
import { Button } from "~/components/ui/button";
import { cn } from "~/lib/utils";
import type { RunStep, StepStatus } from "~/services/runs";
import { useExecutionStore } from "~/stores/execution";
import { CopyJsonButton, HighlightedJson } from "./highlighted-json";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  nodeId: string | null;
  /** Título exibido (vem do `data.title` do node ou do nodeType como fallback). */
  nodeLabel?: string;
  /** Se `true`, mostra controle pin/unpin (placeholder até task 11/12 plugar). */
  pinned?: boolean;
  onTogglePin?: () => void;
};

const STATUS_META: Record<
  StepStatus,
  { icon: LucideIcon; label: string; color: string; ring: string }
> = {
  running: { icon: Loader2, label: "Em execução", color: "text-sky-600", ring: "ring-sky-500/40" },
  success: {
    icon: CheckCircle2,
    label: "Sucesso",
    color: "text-emerald-600",
    ring: "ring-emerald-500/40",
  },
  failed: { icon: XCircle, label: "Falhou", color: "text-rose-600", ring: "ring-rose-500/40" },
};

const timeFormatter = new Intl.DateTimeFormat("pt-BR", {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

function formatTime(iso: string | null): string {
  if (!iso) return "—";
  return timeFormatter.format(new Date(iso));
}

function formatDuration(ms: number | null): string {
  if (ms === null) return "—";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(2)}s`;
  const min = Math.floor(ms / 60_000);
  const sec = ((ms % 60_000) / 1000).toFixed(0);
  return `${min}m ${sec}s`;
}

export function NodeRunInspector({
  open,
  onOpenChange,
  nodeId,
  nodeLabel,
  pinned,
  onTogglePin,
}: Props) {
  const step = useExecutionStore((s) => (nodeId ? s.stepsByNodeId[nodeId] : undefined));
  const focusedRunId = useExecutionStore((s) => s.focusedRunId);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        // 480px é o sweet spot — cabe um JSON razoável sem cobrir todo o canvas.
        className="flex w-full flex-col gap-0 p-0 sm:max-w-[480px]"
      >
        <SheetHeader className="space-y-1 border-b border-border px-4 py-3">
          <SheetTitle className="flex items-center gap-2 text-sm font-medium">
            {nodeLabel || step?.nodeType || "Nó"}
            {step && <StatusBadge status={step.status} />}
          </SheetTitle>
          <SheetDescription className="font-mono text-[11px] text-muted-foreground">
            {nodeId ?? "—"}
            {focusedRunId && (
              <>
                <span className="mx-1">·</span>
                run {focusedRunId.slice(0, 8)}
              </>
            )}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto">
          {nodeId == null ? (
            <EmptyState message="Selecione um nó com execução registrada." />
          ) : !step ? (
            <EmptyState
              message={
                focusedRunId
                  ? "Este nó não executou neste run."
                  : "Abra um run na aba Execuções pra inspecionar nós."
              }
            />
          ) : (
            <StepBody step={step} />
          )}
        </div>

        {nodeId && (
          <div className="flex items-center justify-between gap-2 border-t border-border px-4 py-2.5">
            <span className="text-[11px] text-muted-foreground">
              {pinned ? "Saída pinada — próximas runs vão usar este resultado." : ""}
            </span>
            <Button
              size="sm"
              variant={pinned ? "default" : "outline"}
              onClick={onTogglePin}
              disabled={!onTogglePin || !step?.output}
              title={
                pinned
                  ? "Remover pin — execução real volta a rodar"
                  : !step?.output
                    ? "Disponível quando o nó tiver output"
                    : "Pinar saída deste nó pras próximas execuções"
              }
            >
              {pinned ? (
                <>
                  <PinOff className="size-3.5" />
                  Despinar
                </>
              ) : (
                <>
                  <Pin className="size-3.5" />
                  Pinar saída
                </>
              )}
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function StatusBadge({ status }: { status: StepStatus }) {
  const meta = STATUS_META[status];
  const Icon = meta.icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ring-1",
        meta.color,
        meta.ring,
      )}
    >
      <Icon className={cn("size-3", status === "running" && "animate-spin")} />
      {meta.label}
    </span>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="grid place-items-center p-8 text-center">
      <div className="space-y-2">
        <Ban className="mx-auto size-5 text-muted-foreground/50" />
        <p className="text-xs text-muted-foreground">{message}</p>
      </div>
    </div>
  );
}

function StepBody({ step }: { step: RunStep }) {
  return (
    <div className="space-y-3 p-4">
      <div className="grid grid-cols-3 gap-2 rounded-md border border-border bg-muted/30 p-2 text-[11px]">
        <Field label="Início">{formatTime(step.startedAt)}</Field>
        <Field label="Fim">{formatTime(step.finishedAt)}</Field>
        <Field label="Duração">{formatDuration(step.durationMs)}</Field>
      </div>

      <JsonBlock label="Input" data={step.input} placeholder="Sem input." />

      {step.error ? (
        <JsonBlock label="Erro" data={step.error} tone="error" />
      ) : (
        <JsonBlock
          label="Output"
          data={step.output}
          placeholder={
            step.status === "running" ? "Ainda em execução…" : "Sem output."
          }
        />
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium tabular-nums">{children}</dd>
    </div>
  );
}

function JsonBlock({
  label,
  data,
  tone = "default",
  placeholder,
}: {
  label: string;
  data: Record<string, unknown> | null;
  tone?: "default" | "error";
  placeholder?: string;
}) {
  const isEmpty = data === null || (typeof data === "object" && Object.keys(data).length === 0);

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <p
          className={cn(
            "text-[10px] font-semibold uppercase tracking-wide",
            tone === "error" ? "text-destructive" : "text-muted-foreground",
          )}
        >
          {label}
        </p>
        {!isEmpty && data && <CopyJsonButton value={data} />}
      </div>
      <div
        className={cn(
          "rounded-md border bg-background",
          tone === "error" ? "border-destructive/40 bg-destructive/5" : "border-border",
        )}
      >
        {isEmpty ? (
          <p className="px-3 py-2 text-[11px] italic text-muted-foreground">
            {placeholder ?? "—"}
          </p>
        ) : (
          <pre
            className={cn(
              "max-h-96 overflow-auto whitespace-pre-wrap break-words px-3 py-2 font-mono text-[11px] leading-relaxed",
              tone === "error" && "text-destructive/90",
            )}
          >
            {tone === "error" ? (
              JSON.stringify(data, null, 2)
            ) : (
              <HighlightedJson value={data} />
            )}
          </pre>
        )}
      </div>
    </div>
  );
}
