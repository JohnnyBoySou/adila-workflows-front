/**
 * Painel dedicado pro nó `schedule_trigger` (Cron Trigger).
 *
 * Dois modos, ambos resolvendo numa `cronExpression` padrão (5 campos) que o
 * scheduler (`back/src/features/triggers/scheduler.ts`) consome via BullMQ:
 *
 *   Intervalo — every N (minutos/horas/dias) ou semanal num dia da semana.
 *               Gera a cron automaticamente.
 *   Cron      — expressão crua, pra quem quer controle total.
 *
 * Persiste em `values`:
 *   cronExpression: string   — sempre a cron resolvida (consumida pelo backend)
 *   timezone?: string        — IANA tz (default UTC)
 *   _scheduleMode/_every/_unit/_weekday — helpers editor-only pra round-trip da UI
 */
import { useMemo } from "react";
import { CalendarClock, Clock, Code2 } from "lucide-react";

import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { cn } from "~/lib/utils";

import type { CustomPanelProps } from "./types";
import { useFieldError } from "./use-field-error";

type Mode = "interval" | "cron";
type Unit = "minutes" | "hours" | "days" | "weeks";

const UNIT_OPTIONS: { value: Unit; label: string }[] = [
  { value: "minutes", label: "Minutos" },
  { value: "hours", label: "Horas" },
  { value: "days", label: "Dias" },
  { value: "weeks", label: "Semanas" },
];

const WEEKDAYS = [
  { value: "1", label: "Segunda" },
  { value: "2", label: "Terça" },
  { value: "3", label: "Quarta" },
  { value: "4", label: "Quinta" },
  { value: "5", label: "Sexta" },
  { value: "6", label: "Sábado" },
  { value: "0", label: "Domingo" },
];

// Cron de 5 campos: minuto hora dia-do-mês mês dia-da-semana.
const CRON_RE = /^(\S+\s+){4}\S+$/;

function readString(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}
function readNumber(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

/** Traduz intervalo (every/unit) numa cron padrão de 5 campos. */
function intervalToCron(every: number, unit: Unit, weekday: string): string {
  const n = Math.max(1, Math.floor(every));
  switch (unit) {
    case "minutes":
      return `*/${n} * * * *`;
    case "hours":
      return `0 */${n} * * *`;
    case "days":
      return `0 0 */${n} * *`;
    case "weeks":
      // Cron não tem "a cada N semanas" — semanal num dia da semana.
      return `0 0 * * ${weekday}`;
  }
}

function inferMode(values: Record<string, unknown>): Mode {
  const m = readString(values._scheduleMode);
  if (m === "cron" || m === "interval") return m;
  // Sem helper salvo: se já tem cronExpression mas nada de intervalo, assume cron.
  return values.cronExpression && values._unit === undefined ? "cron" : "interval";
}

export function ScheduleTriggerPanel({ values, onChange, onError }: CustomPanelProps) {
  const mode = inferMode(values);
  const every = readNumber(values._every, 5);
  const unit = (readString(values._unit, "minutes") as Unit) || "minutes";
  const weekday = readString(values._weekday, "1");
  const timezone = readString(values.timezone, "UTC");
  const cronExpression = readString(values.cronExpression);

  const cronValid = mode === "cron" ? CRON_RE.test(cronExpression.trim()) : true;
  const cronEmpty = mode === "cron" && cronExpression.trim() === "";

  useFieldError(
    onError,
    "cronExpression",
    cronEmpty
      ? "Informe a cron expression."
      : !cronValid
        ? "Cron inválida — use 5 campos (min hora dia mês dia-semana)."
        : null,
  );

  // Preview da cron resolvida no modo intervalo.
  const resolvedCron = useMemo(
    () => (mode === "interval" ? intervalToCron(every, unit, weekday) : cronExpression),
    [mode, every, unit, weekday, cronExpression],
  );

  const setMode = (next: Mode) => {
    if (next === "interval") {
      onChange({
        _scheduleMode: "interval",
        cronExpression: intervalToCron(every, unit, weekday),
      });
    } else {
      onChange({ _scheduleMode: "cron" });
    }
  };

  const updateInterval = (patch: { every?: number; unit?: Unit; weekday?: string }) => {
    const nextEvery = patch.every ?? every;
    const nextUnit = patch.unit ?? unit;
    const nextWeekday = patch.weekday ?? weekday;
    onChange({
      _scheduleMode: "interval",
      _every: nextEvery,
      _unit: nextUnit,
      _weekday: nextWeekday,
      cronExpression: intervalToCron(nextEvery, nextUnit, nextWeekday),
    });
  };

  return (
    <div className="space-y-5">
      {/* Seletor de modo */}
      <div className="inline-flex rounded-md border border-border bg-muted/40 p-0.5">
        <button
          type="button"
          onClick={() => setMode("interval")}
          className={cn(
            "flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium transition",
            mode === "interval"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <Clock className="size-3.5" />
          Intervalo
        </button>
        <button
          type="button"
          onClick={() => setMode("cron")}
          className={cn(
            "flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium transition",
            mode === "cron"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <Code2 className="size-3.5" />
          Cron
        </button>
      </div>

      {mode === "interval" ? (
        <div className="space-y-4">
          <div className="flex items-end gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="schedule-every">A cada</Label>
              <Input
                id="schedule-every"
                type="number"
                min={1}
                value={every}
                onChange={(e) => updateInterval({ every: Number(e.target.value) || 1 })}
                className="w-24"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Unidade</Label>
              <Select value={unit} onValueChange={(v) => updateInterval({ unit: v as Unit })}>
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {UNIT_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {unit === "weeks" && (
            <div className="space-y-1.5">
              <Label>Dia da semana</Label>
              <Select value={weekday} onValueChange={(v) => updateInterval({ weekday: v })}>
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {WEEKDAYS.map((d) => (
                    <SelectItem key={d.value} value={d.value}>
                      {d.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-1.5">
          <Label htmlFor="schedule-cron">Cron expression</Label>
          <Input
            id="schedule-cron"
            value={cronExpression}
            placeholder="0 9 * * *"
            onChange={(e) => onChange({ _scheduleMode: "cron", cronExpression: e.target.value })}
            className={cn("font-mono", !cronValid && !cronEmpty && "border-destructive")}
          />
          <p className="text-[11px] text-muted-foreground">
            5 campos: minuto hora dia-do-mês mês dia-da-semana. Ex.:{" "}
            <code className="rounded bg-muted px-1">0 9 * * 1-5</code> = 9h em dias úteis.
          </p>
        </div>
      )}

      {/* Timezone */}
      <div className="space-y-1.5">
        <Label htmlFor="schedule-tz">Timezone</Label>
        <Input
          id="schedule-tz"
          value={timezone}
          placeholder="UTC"
          onChange={(e) => onChange({ timezone: e.target.value })}
          className="w-64 font-mono"
        />
        <p className="text-[11px] text-muted-foreground">
          IANA tz (ex.: <code className="rounded bg-muted px-1">America/Sao_Paulo</code>). Default UTC.
        </p>
      </div>

      {/* Preview da cron resolvida */}
      <div className="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-xs">
        <CalendarClock className="size-4 text-muted-foreground" />
        <span className="text-muted-foreground">Cron resolvida:</span>
        <code className="font-mono font-medium">{resolvedCron || "—"}</code>
      </div>
    </div>
  );
}
