import { cn } from "~/lib/utils";

export type StatusBucket = "ok" | "warn" | "fail" | "empty";

export type StatusBarsProps = {
  buckets: StatusBucket[];
  className?: string;
  /** Altura de cada barra em px. Default: 28. */
  height?: number;
  /** Largura mínima de cada barra em px. Default: 4. */
  minBarWidth?: number;
  /** Espaço entre barras em px. Default: 2. */
  gap?: number;
};

const COLORS: Record<StatusBucket, string> = {
  ok: "bg-emerald-500",
  warn: "bg-amber-400",
  fail: "bg-rose-500",
  empty: "bg-muted",
};

const LABELS: Record<StatusBucket, string> = {
  ok: "Operacional",
  warn: "Degradado",
  fail: "Falha",
  empty: "Sem dados",
};

/**
 * Barras horizontais estilo statuspage — cada bucket vira uma coluna colorida
 * indicando o status agregado daquele intervalo de tempo. Pensado pra dar
 * leitura rápida (verde/amarelo/vermelho) de saúde de um workflow ao longo
 * do tempo.
 */
export function StatusBars({
  buckets,
  className,
  height = 28,
  minBarWidth = 4,
  gap = 2,
}: StatusBarsProps) {
  return (
    <div
      className={cn("flex w-full items-stretch", className)}
      style={{ height, gap }}
      role="img"
      aria-label={`Histórico de status — ${buckets.length} intervalos`}
    >
      {buckets.map((b, i) => (
        <div
          key={i}
          className={cn(
            "flex-1 rounded-sm transition-opacity hover:opacity-70",
            COLORS[b],
          )}
          style={{ minWidth: minBarWidth }}
          title={LABELS[b]}
        />
      ))}
    </div>
  );
}
