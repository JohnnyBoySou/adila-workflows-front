import { motion } from "framer-motion";

import { cn } from "~/lib/utils";

type Level = {
  score: number;
  label: string;
  color: string;
};

const LEVELS: Level[] = [
  { score: 0, label: "Muito fraca", color: "bg-destructive" },
  { score: 1, label: "Fraca", color: "bg-destructive" },
  { score: 2, label: "Razoável", color: "bg-orange-500" },
  { score: 3, label: "Média", color: "bg-yellow-500" },
  { score: 4, label: "Forte", color: "bg-green-500" },
  { score: 5, label: "Excelente", color: "bg-green-600" },
];

function score(password: string): number {
  if (!password) return 0;
  let s = 0;
  if (password.length >= 8) s++;
  if (password.length >= 12) s++;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) s++;
  if (/\d/.test(password)) s++;
  if (/[^A-Za-z0-9]/.test(password)) s++;
  return s;
}

export function PasswordStrength({
  password,
  className,
}: {
  password: string;
  className?: string;
}) {
  const value = score(password);
  const level = LEVELS[value];
  const segments = 5;

  return (
    <div className={cn("mt-2 space-y-1.5", className)} aria-live="polite">
      <div className="flex gap-1">
        {Array.from({ length: segments }).map((_, i) => {
          const active = i < value;
          return (
            <div key={i} className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
              <motion.div
                initial={false}
                animate={{ scaleX: active ? 1 : 0 }}
                transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                className={cn("h-full origin-left rounded-full", level.color)}
              />
            </div>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground">
        {password ? `Segurança: ${level.label}` : "Mínimo de 8 caracteres."}
      </p>
    </div>
  );
}
