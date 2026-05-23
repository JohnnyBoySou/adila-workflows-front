import { Link } from "react-router";
import { Check, ChevronLeft, History, Info, Loader2, PenLine, Play, Save } from "lucide-react";

import { Button } from "~/components/ui/button";
import { Separator } from "~/components/ui/separator";
import { Tabs, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { cn } from "~/lib/utils";

export type FlowTab = "editor" | "executions";

export type SaveState = "idle" | "dirty" | "saving" | "saved" | "error";

type FlowTopBarProps = {
  tab: FlowTab;
  onTabChange: (tab: FlowTab) => void;
  onInfoClick: () => void;
  onSave?: () => void;
  onRun?: () => void;
  saveState?: SaveState;
  /** Timestamp do último save bem-sucedido (ms). */
  lastSavedAt?: number | null;
  /** Mostra um indicador pulsante na aba "Execuções" quando há run em curso. */
  hasActiveRun?: boolean;
};

const timeFormatter = new Intl.DateTimeFormat("pt-BR", {
  hour: "2-digit",
  minute: "2-digit",
});

/**
 * Barra flutuante no topo do editor, centralizada horizontalmente.
 * Concentra navegação (voltar), metadados (info), troca de visão (tabs)
 * e ações principais (Salvar/Executar). Tudo icon‑only — `aria-label`
 * + `title` cobrem acessibilidade e tooltip nativo.
 */
export function FlowTopBar({
  tab,
  onTabChange,
  onInfoClick,
  onSave,
  onRun,
  saveState = "idle",
  lastSavedAt,
  hasActiveRun = false,
}: FlowTopBarProps) {
  const dirty = saveState === "dirty";
  const saving = saveState === "saving";
  const savedLabel =
    saveState === "saved" && lastSavedAt
      ? `Salvo · ${timeFormatter.format(new Date(lastSavedAt))}`
      : saveState === "saving"
        ? "Salvando…"
        : saveState === "error"
          ? "Falha ao salvar"
          : dirty
            ? "Alterações não salvas"
            : null;

  return (
    <div className="pointer-events-none absolute inset-x-0 top-4 z-10 flex justify-center">
      <div className="pointer-events-auto flex items-center gap-1 rounded-full border border-border bg-card/95 p-1 shadow-md backdrop-blur supports-[backdrop-filter]:bg-card/80">
        <Button asChild variant="ghost" size="icon-sm" className="rounded-full" title="Voltar">
          <Link to="/dashboard/workflows" aria-label="Voltar para workflows">
            <ChevronLeft className="size-4" />
          </Link>
        </Button>

        <Button
          variant="ghost"
          size="icon-sm"
          className="rounded-full"
          onClick={onInfoClick}
          aria-label="Informações do workflow"
          title="Informações"
        >
          <Info className="size-4" />
        </Button>

        <Separator orientation="vertical" className="mx-1 h-5" />

        <Tabs value={tab} onValueChange={(v) => onTabChange(v as FlowTab)}>
          <TabsList className="h-8 rounded-full bg-transparent">
            <TabsTrigger
              value="editor"
              className="size-7 rounded-full p-0"
              aria-label="Editor"
              title="Editor"
            >
              <PenLine className="size-4" />
            </TabsTrigger>
            <TabsTrigger
              value="executions"
              className="relative size-7 rounded-full p-0"
              aria-label="Execuções"
              title={hasActiveRun ? "Execuções (run em curso)" : "Execuções"}
            >
              <History className="size-4" />
              {hasActiveRun && (
                <span
                  aria-hidden
                  className="pointer-events-none absolute right-0.5 top-0.5 flex size-2"
                >
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-sky-500 opacity-75" />
                  <span className="relative inline-flex size-2 rounded-full bg-sky-500" />
                </span>
              )}
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <Separator orientation="vertical" className="mx-1 h-5" />

        <Button
          variant="ghost"
          size="icon-sm"
          className={cn("relative rounded-full", dirty && "text-foreground")}
          onClick={onSave}
          aria-label="Salvar"
          title={savedLabel ?? "Salvar"}
          disabled={saving}
        >
          {saving ? (
            <Loader2 className="size-4 animate-spin" />
          ) : saveState === "saved" ? (
            <Check className="size-4" />
          ) : (
            <Save className="size-4" />
          )}
          {dirty && (
            <span
              aria-hidden
              className="absolute right-1 top-1 size-1.5 rounded-full bg-amber-500"
            />
          )}
        </Button>

        {savedLabel && (
          <span
            className={cn(
              "px-2 text-[11px] tabular-nums whitespace-nowrap text-muted-foreground",
              saveState === "error" && "text-destructive",
            )}
          >
            {savedLabel}
          </span>
        )}

        <Button
          size="icon-sm"
          className="rounded-full"
          onClick={onRun}
          aria-label="Executar"
          title="Executar"
        >
          <Play className="size-4" />
        </Button>
      </div>
    </div>
  );
}
