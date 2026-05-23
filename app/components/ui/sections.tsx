import type { LucideIcon } from "lucide-react";

import { cn } from "~/lib/utils";

export type SectionItem<TId extends string = string> = {
  id: TId;
  label: string;
  icon: LucideIcon;
  /** Esconde visualmente (mostra opacidade reduzida + title) sem remover do nav. */
  disabled?: boolean;
  /** Texto exibido como `title` quando o item está desabilitado. */
  disabledReason?: string;
};

type SectionsProps<TId extends string> = {
  sections: ReadonlyArray<SectionItem<TId>>;
  value: TId;
  onValueChange: (id: TId) => void;
  /** Conteúdo do painel direito — o caller decide renderização por `value`. */
  children: React.ReactNode;
  /** Acessível: rotula o nav lateral. */
  ariaLabel?: string;
  /** Sobrescreve a largura do sidebar (default `w-44`). */
  navClassName?: string;
  /** Sobrescreve classes do container raiz (default `flex min-h-[460px]`). */
  className?: string;
  /** Sobrescreve classes do painel de conteúdo (default `min-w-0 flex-1 overflow-y-auto pl-4`). */
  contentClassName?: string;
};

/**
 * Layout de sidebar com seções selecionáveis + área de conteúdo. Padrão
 * usado em dialogs grandes (config de nó, info de workflow) — extraído
 * pra eliminar duplicação visual e garantir consistência de estilo.
 *
 * Controlado: o caller mantém o `value` e renderiza o conteúdo conforme
 * a seção ativa. Mantém o componente desacoplado da forma do conteúdo.
 */
export function Sections<TId extends string>({
  sections,
  value,
  onValueChange,
  children,
  ariaLabel = "Seções",
  navClassName,
  className,
  contentClassName,
}: SectionsProps<TId>) {
  return (
    <div className={cn("flex min-h-[460px]", className)}>
      <nav
        aria-label={ariaLabel}
        className={cn(
          "flex w-44 shrink-0 flex-col gap-0.5 border-r border-border pr-2",
          navClassName,
        )}
      >
        {sections.map((s) => {
          const Icon = s.icon;
          const active = value === s.id;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => onValueChange(s.id)}
              title={s.disabled ? s.disabledReason : undefined}
              className={cn(
                "inline-flex items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm transition-colors",
                active
                  ? "bg-muted font-medium text-foreground"
                  : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                s.disabled && "opacity-50",
              )}
            >
              <Icon className="size-4 shrink-0" />
              <span className="truncate">{s.label}</span>
            </button>
          );
        })}
      </nav>

      <div className={cn("min-w-0 flex-1 overflow-y-auto pl-4", contentClassName)}>{children}</div>
    </div>
  );
}
