import { motion } from "framer-motion";
import { CheckCircle2, Clock, XCircle, type LucideIcon } from "lucide-react";

import { cn } from "~/lib/utils";

type ExecutionStatus = "success" | "running" | "failed";

type Execution = {
  id: string;
  status: ExecutionStatus;
  trigger: string;
  startedAt: string;
  duration: string;
};

const STATUS_META: Record<
  ExecutionStatus,
  { icon: LucideIcon; label: string; color: string; dot: string }
> = {
  success: {
    icon: CheckCircle2,
    label: "Sucesso",
    color: "text-emerald-600",
    dot: "bg-emerald-500",
  },
  running: { icon: Clock, label: "Em execução", color: "text-sky-600", dot: "bg-sky-500" },
  failed: { icon: XCircle, label: "Falhou", color: "text-rose-600", dot: "bg-rose-500" },
};

const MOCK_EXECUTIONS: Execution[] = [
  {
    id: "exec_01",
    status: "success",
    trigger: "Webhook · /api/leads",
    startedAt: "Há 2 min",
    duration: "1.4s",
  },
  {
    id: "exec_02",
    status: "running",
    trigger: "Manual · lai@300f.com.br",
    startedAt: "Há 5 min",
    duration: "12s",
  },
  {
    id: "exec_03",
    status: "failed",
    trigger: "Agendamento · diário 09:00",
    startedAt: "Hoje 09:00",
    duration: "3.1s",
  },
  {
    id: "exec_04",
    status: "success",
    trigger: "Webhook · /api/leads",
    startedAt: "Ontem 18:42",
    duration: "0.9s",
  },
];

export function ExecutionsView() {
  return (
    <div className="h-full overflow-y-auto bg-background">
      <div className="mx-auto max-w-5xl px-6 py-8">
        <div className="mb-6 flex items-end justify-between">
          <div>
            <h2 className="font-heading text-xl font-medium text-foreground">Execuções</h2>
            <p className="mt-1 text-sm text-muted-foreground">Histórico de runs deste workflow.</p>
          </div>
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-emerald-500" /> 3 sucesso
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-rose-500" /> 1 falha
            </span>
          </div>
        </div>

        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <div className="grid grid-cols-[1.4fr_2fr_1fr_1fr_auto] gap-4 border-b border-border bg-muted/40 px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <span>Status</span>
            <span>Disparo</span>
            <span>Início</span>
            <span>Duração</span>
            <span className="w-16 text-right">ID</span>
          </div>
          <ul>
            {MOCK_EXECUTIONS.map((exec, i) => {
              const meta = STATUS_META[exec.status];
              const Icon = meta.icon;
              return (
                <motion.li
                  key={exec.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.04, type: "spring", stiffness: 360, damping: 30 }}
                  className="grid grid-cols-[1.4fr_2fr_1fr_1fr_auto] items-center gap-4 border-b border-border px-4 py-3 text-sm transition-colors last:border-b-0 hover:bg-muted/30"
                >
                  <span className={cn("inline-flex items-center gap-2 font-medium", meta.color)}>
                    <Icon className="size-4" />
                    {meta.label}
                  </span>
                  <span className="truncate text-foreground">{exec.trigger}</span>
                  <span className="text-muted-foreground">{exec.startedAt}</span>
                  <span className="tabular-nums text-muted-foreground">{exec.duration}</span>
                  <span className="w-16 text-right font-mono text-xs text-muted-foreground">
                    {exec.id}
                  </span>
                </motion.li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
}
