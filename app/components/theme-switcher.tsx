import { Monitor, Moon, Sun } from "lucide-react";

import { useThemeStore, type Theme } from "~/stores/theme";
import { cn } from "~/lib/utils";

type Option = {
  value: Theme;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
};

const OPTIONS: Option[] = [
  {
    value: "light",
    label: "Claro",
    description: "Sempre fundo claro.",
    icon: Sun,
  },
  {
    value: "dark",
    label: "Escuro",
    description: "Sempre fundo escuro.",
    icon: Moon,
  },
  {
    value: "system",
    label: "Sistema",
    description: "Acompanha a preferência do SO.",
    icon: Monitor,
  },
];

export function ThemeSwitcher() {
  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);

  return (
    <div role="radiogroup" aria-label="Tema da interface" className="grid gap-3 sm:grid-cols-3">
      {OPTIONS.map((opt) => {
        const selected = theme === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => setTheme(opt.value)}
            className={cn(
              "group flex cursor-pointer flex-col items-start gap-2 rounded-md border bg-background p-3 text-left outline-none transition-colors",
              "hover:bg-muted/60 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
              selected && "border-primary ring-2 ring-primary/20",
            )}
          >
            <div className="flex w-full items-center justify-between">
              <opt.icon
                className={cn(
                  "size-4 text-muted-foreground transition-colors",
                  selected && "text-primary",
                )}
              />
              {selected && <span className="text-xs font-medium text-primary">Ativo</span>}
            </div>
            <div>
              <p className="text-sm font-medium">{opt.label}</p>
              <p className="text-xs text-muted-foreground">{opt.description}</p>
            </div>
          </button>
        );
      })}
    </div>
  );
}
