/**
 * Painel dedicado pro nó `wait`. Seções:
 *
 *   Modo       — ms / segundos / until (timestamp ISO) com presets
 *   Teste      — só testa quando ≤ 10s (proteção do browser)
 *   Histórico  — últimas execuções
 *
 * Persiste em `values`:
 *   ms?: number  | seconds?: number | until?: string ISO  — exatamente um
 */
import { useMemo, useState } from "react";
import { useFieldError } from "./use-field-error";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CalendarClock, Clock, History, Loader2, Send, Timer } from "lucide-react";

import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Sections, type SectionItem } from "~/components/ui/sections";
import { cn } from "~/lib/utils";
import { queryKeys } from "~/lib/query-keys";
import * as nodesApi from "~/services/workflow-nodes";
import type { NodeInvocation } from "~/services/workflow-nodes";

import { useWorkflowId } from "../workflow-context";
import type { CustomPanelProps } from "./types";

type Mode = "ms" | "seconds" | "until";

const MAX_TEST_MS = 10_000;
const MAX_REAL_MS = 3_600_000;

const SECTIONS = [
  { id: "mode", label: "Espera", icon: Clock },
  { id: "test", label: "Teste", icon: Send },
  { id: "history", label: "Histórico", icon: History },
] as const satisfies ReadonlyArray<SectionItem>;

type SectionId = (typeof SECTIONS)[number]["id"];

function readNumber(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}
function readString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function inferMode(values: Record<string, unknown>): Mode {
  if (typeof values.until === "string") return "until";
  if (typeof values.seconds === "number") return "seconds";
  return "ms";
}

const PRESETS_MS: { label: string; ms: number }[] = [
  { label: "1s", ms: 1000 },
  { label: "5s", ms: 5000 },
  { label: "30s", ms: 30_000 },
  { label: "1min", ms: 60_000 },
  { label: "5min", ms: 300_000 },
  { label: "15min", ms: 900_000 },
  { label: "1h", ms: 3_600_000 },
];

export function WaitPanel({ values, onChange, onError, nodeId }: CustomPanelProps) {
  const [section, setSection] = useState<SectionId>("mode");
  const workflowId = useWorkflowId() ?? "";

  const mode = inferMode(values);
  const ms = readNumber(values.ms);
  const seconds = readNumber(values.seconds);
  const until = readString(values.until);

  const noneSet = ms === undefined && seconds === undefined && until === "";
  useFieldError(onError, "wait", noneSet ? "Informe ms, seconds ou until." : null);

  return (
    <Sections
      sections={SECTIONS as unknown as SectionItem<SectionId>[]}
      value={section}
      onValueChange={setSection}
      ariaLabel="Seções do nó Wait"
    >
      {section === "mode" && (
        <ModeSection mode={mode} values={values} onChange={onChange} noneSet={noneSet} />
      )}
      {section === "test" && (
        <TestSection workflowId={workflowId} nodeId={nodeId} values={values} mode={mode} ms={ms} seconds={seconds} until={until} />
      )}
      {section === "history" && <HistorySection workflowId={workflowId} nodeId={nodeId} />}
    </Sections>
  );
}

/* -------------------------------------------------------------------------- */
/* Modo                                                                       */
/* -------------------------------------------------------------------------- */

function ModeSection({
  mode,
  values,
  onChange,
  noneSet,
}: {
  mode: Mode;
  values: Record<string, unknown>;
  onChange: (patch: Record<string, unknown>) => void;
  noneSet: boolean;
}) {
  function pick(m: Mode) {
    // Limpa as outras chaves pra ficar exatamente uma definida.
    onChange({
      ms: m === "ms" ? readNumber(values.ms) ?? 1000 : undefined,
      seconds: m === "seconds" ? readNumber(values.seconds) ?? 5 : undefined,
      until: m === "until" ? readString(values.until) || new Date(Date.now() + 60_000).toISOString() : undefined,
    });
  }

  return (
    <div className="space-y-4">
      <SectionHeader title="Modo de espera" hint="Exatamente um dos três. Limite: 1h por chamada." />

      <div className="grid grid-cols-3 gap-1.5">
        {(["ms", "seconds", "until"] as const).map((m) => {
          const Icon = m === "until" ? CalendarClock : m === "seconds" ? Clock : Timer;
          const active = m === mode;
          return (
            <button
              key={m}
              type="button"
              onClick={() => pick(m)}
              className={cn(
                "flex items-center gap-2 rounded-md border px-2.5 py-2 text-left transition-colors",
                active ? "border-primary bg-primary/10" : "border-border bg-background hover:border-primary/40",
              )}
            >
              <Icon className={cn("size-4 shrink-0", active ? "text-primary" : "text-muted-foreground")} />
              <div className="min-w-0">
                <p className={cn("text-[12px] font-medium", active && "text-primary")}>
                  {m === "ms" ? "Milissegundos" : m === "seconds" ? "Segundos" : "Até (ISO)"}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  {m === "ms" ? "Precisão alta" : m === "seconds" ? "Conveniência" : "Instante absoluto"}
                </p>
              </div>
            </button>
          );
        })}
      </div>

      {mode === "ms" && (
        <>
          <FieldRow label="ms" hint="Milissegundos. Máximo 3.600.000 (1h).">
            <Input
              type="number"
              min={0}
              max={MAX_REAL_MS}
              value={readNumber(values.ms) ?? ""}
              onChange={(e) => onChange({ ms: e.target.value === "" ? undefined : Number(e.target.value) })}
              className="font-mono text-xs"
              placeholder="1000"
            />
          </FieldRow>
          <PresetsRow current={readNumber(values.ms) ?? 0} onPick={(v) => onChange({ ms: v })} />
        </>
      )}

      {mode === "seconds" && (
        <>
          <FieldRow label="seconds" hint="Equivalente a ms × 1000. Máximo 3600.">
            <Input
              type="number"
              min={0}
              max={3600}
              value={readNumber(values.seconds) ?? ""}
              onChange={(e) => onChange({ seconds: e.target.value === "" ? undefined : Number(e.target.value) })}
              className="font-mono text-xs"
              placeholder="5"
            />
          </FieldRow>
          <PresetsRow
            current={(readNumber(values.seconds) ?? 0) * 1000}
            onPick={(ms) => onChange({ seconds: ms / 1000 })}
          />
        </>
      )}

      {mode === "until" && (
        <FieldRow label="until (ISO 8601)" hint="Espera até o instante. Pode ser template ({{steps.X.expiresAt}}). Se já passou → não espera.">
          <Input
            value={readString(values.until)}
            onChange={(e) => onChange({ until: e.target.value })}
            placeholder="2026-12-31T23:59:59Z"
            className="font-mono text-xs"
          />
          <UntilHint until={readString(values.until)} />
        </FieldRow>
      )}

      {noneSet && (
        <p className="rounded-md border border-amber-500/40 bg-amber-500/5 px-2 py-1.5 text-[10px] text-amber-700 dark:text-amber-400">
          ⚠️ Nenhum valor definido. O run vai falhar com "informe `ms`, `seconds` ou `until`".
        </p>
      )}
    </div>
  );
}

function PresetsRow({ current, onPick }: { current: number; onPick: (ms: number) => void }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Presets</Label>
      <div className="flex flex-wrap gap-1.5">
        {PRESETS_MS.map((p) => {
          const active = p.ms === current;
          return (
            <button
              key={p.label}
              type="button"
              onClick={() => onPick(p.ms)}
              className={cn(
                "rounded-md border px-2 py-1 font-mono text-[11px] transition-colors",
                active ? "border-primary bg-primary/10 text-primary" : "border-border bg-background text-muted-foreground hover:border-primary/40",
              )}
            >
              {p.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function UntilHint({ until }: { until: string }) {
  if (!until || until.includes("{{")) return null;
  const d = new Date(until);
  if (Number.isNaN(d.getTime())) {
    return <p className="text-[10px] text-destructive">Timestamp inválido.</p>;
  }
  const diffMs = d.getTime() - Date.now();
  if (diffMs <= 0) {
    return (
      <p className="text-[10px] text-amber-700 dark:text-amber-400">
        Já passou — espera 0ms.
      </p>
    );
  }
  const seconds = Math.round(diffMs / 1000);
  const formatted =
    seconds < 60 ? `${seconds}s` :
    seconds < 3600 ? `${Math.round(seconds / 60)}min` :
    `${(seconds / 3600).toFixed(1)}h`;
  return (
    <p className="text-[10px] text-muted-foreground">
      Em {formatted} ({d.toLocaleString("pt-BR")}).
    </p>
  );
}

/* -------------------------------------------------------------------------- */
/* Teste                                                                      */
/* -------------------------------------------------------------------------- */

function TestSection({
  workflowId,
  nodeId,
  values,
  mode,
  ms,
  seconds,
  until,
}: {
  workflowId: string;
  nodeId?: string;
  values: Record<string, unknown>;
  mode: Mode;
  ms?: number;
  seconds?: number;
  until: string;
}) {
  const mutation = useMutation({
    mutationFn: () => nodesApi.dryRunWait(workflowId, nodeId!, { config: values }),
  });

  if (!workflowId || !nodeId) return <EmptyHint>Salve o workflow antes de testar.</EmptyHint>;

  const projected =
    mode === "ms" ? (ms ?? 0) :
    mode === "seconds" ? (seconds ?? 0) * 1000 :
    until && !until.includes("{{") ? Math.max(0, new Date(until).getTime() - Date.now()) :
    0;

  const tooLong = projected > MAX_TEST_MS;

  return (
    <div className="space-y-3">
      <SectionHeader
        title="Disparar agora"
        hint={`A chamada de teste bloqueia até 10s. Esperas maiores rodam só no engine real (max 1h).`}
      />

      <div className="rounded-md border border-dashed border-border bg-muted/20 p-2.5">
        <p className="text-[11px]">
          Espera projetada: <span className="font-mono">{projected.toLocaleString("pt-BR")} ms</span>
        </p>
        {tooLong && (
          <p className="mt-1 text-[10px] text-amber-700 dark:text-amber-400">
            ⚠️ {`>10s — teste recusado. Use um preset menor pra validar.`}
          </p>
        )}
      </div>

      <div className="flex justify-end">
        <Button size="sm" onClick={() => mutation.mutate()} disabled={mutation.isPending || tooLong}>
          {mutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          Esperar e medir
        </Button>
      </div>

      {mutation.data && !mutation.data.ok && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-2 py-1.5">
          <p className="text-[10px] font-medium text-destructive">Handler falhou</p>
          <p className="mt-0.5 break-words font-mono text-[11px] text-destructive/90">{mutation.data.error}</p>
        </div>
      )}

      {mutation.data && mutation.data.ok && (
        <div className="rounded-md border border-emerald-500/40 bg-emerald-500/5 p-2">
          <div className="flex items-center justify-between text-[11px]">
            <span className="font-medium text-emerald-600">
              Esperou {(mutation.data.output.waitedMs as number).toLocaleString("pt-BR")} ms
            </span>
            <span className="text-[10px] tabular-nums text-muted-foreground">
              total {mutation.data.durationMs}ms
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Histórico                                                                  */
/* -------------------------------------------------------------------------- */

function HistorySection({ workflowId, nodeId }: { workflowId: string; nodeId?: string }) {
  const limit = 25;
  const query = useQuery({
    queryKey: queryKeys.workflowNodes.invocations(workflowId, nodeId ?? "", limit),
    queryFn: () => nodesApi.listInvocations(workflowId, nodeId!, limit),
    enabled: Boolean(workflowId && nodeId),
  });

  if (!workflowId || !nodeId) return <EmptyHint>Salve o workflow antes de ver histórico.</EmptyHint>;

  return (
    <div className="space-y-2">
      <SectionHeader title="Últimas esperas" />

      {query.isPending && (
        <div className="flex items-center gap-2 px-2 py-4 text-[11px] text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" /> Carregando…
        </div>
      )}

      {query.data && query.data.length === 0 && <EmptyHint>Nenhuma execução registrada ainda.</EmptyHint>}

      {query.data && query.data.length > 0 && (
        <div className="overflow-hidden rounded-md border border-border bg-background">
          <table className="w-full text-[11px]">
            <thead className="bg-muted/40 text-[10px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-2 py-1.5 text-left">Quando</th>
                <th className="px-2 py-1.5 text-left">Status</th>
                <th className="px-2 py-1.5 text-right">Esperou</th>
              </tr>
            </thead>
            <tbody>
              {query.data.map((inv) => (
                <WaitRow key={inv.id} inv={inv} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function WaitRow({ inv }: { inv: NodeInvocation }) {
  const waited = useMemo(() => {
    if (inv.output && typeof (inv.output as Record<string, unknown>).waitedMs === "number") {
      return `${((inv.output as Record<string, unknown>).waitedMs as number).toLocaleString("pt-BR")} ms`;
    }
    return inv.durationMs !== null ? `~${inv.durationMs}ms` : "—";
  }, [inv]);
  return (
    <tr className="border-t border-border/60">
      <td className="px-2 py-1.5 text-muted-foreground">{new Date(inv.createdAt).toLocaleString("pt-BR")}</td>
      <td className="px-2 py-1.5"><StatusBadge status={inv.status} /></td>
      <td className="px-2 py-1.5 text-right font-mono tabular-nums text-muted-foreground">{waited}</td>
    </tr>
  );
}

function StatusBadge({ status }: { status: NodeInvocation["status"] }) {
  const map: Record<NodeInvocation["status"], string> = {
    success: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
    failed: "border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-400",
    running: "border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-400",
    pending: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400",
    skipped: "border-border bg-muted text-muted-foreground",
    cancelled: "border-border bg-muted text-muted-foreground",
  };
  return <span className={cn("rounded-md border px-1.5 py-0.5 font-mono text-[10px] uppercase", map[status])}>{status}</span>;
}

/* helpers */
function SectionHeader({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="mb-3">
      <h3 className="text-sm font-semibold">{title}</h3>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
function FieldRow({ label, hint, error, children }: { label: string; hint?: string; error?: string | null; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-[11px] font-medium">{label}</Label>
      {children}
      {error ? <p className="text-[10px] text-destructive">{error}</p> : hint ? <p className="text-[10px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
function EmptyHint({ children }: { children: React.ReactNode }) {
  return <div className="rounded-md border border-dashed border-border bg-background/40 px-3 py-4 text-center text-[11px] text-muted-foreground">{children}</div>;
}
