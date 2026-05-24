import { Link } from "react-router";
import {
  Activity,
  Check,
  ChevronLeft,
  Database,
  Eye,
  EyeOff,
  History,
  Info,
  Loader2,
  PenLine,
  PinOff,
  Play,
  Save,
  Tag,
} from "lucide-react";

import { Button } from "~/components/ui/button";
import { Separator } from "~/components/ui/separator";
import { Tabs, TabsList, TabsTrigger } from "~/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "~/components/ui/tooltip";
import { cn } from "~/lib/utils";

export type FlowTab = "editor" | "executions" | "performance";

export type SaveState = "idle" | "dirty" | "saving" | "saved" | "error";

type FlowTopBarProps = {
  tab: FlowTab;
  onTabChange: (tab: FlowTab) => void;
  onInfoClick: () => void;
  /** Abre o gerenciador de database connections do workflow. */
  onConnectionsClick?: () => void;
  onSave?: () => void;
  onRun?: () => void;
  onPublish?: () => void;
  saveState?: SaveState;
  publishState?: "idle" | "publishing" | "published" | "already_existed";
  /** Timestamp do último save bem-sucedido (ms). */
  lastSavedAt?: number | null;
  /** Mostra um indicador pulsante na aba "Execuções" quando há run em curso. */
  hasActiveRun?: boolean;
  /** Quantidade de nós com output pinado neste workflow. */
  pinnedCount?: number;
  /** Limpa todos os pins do workflow. Só renderiza o botão se passado e pinnedCount > 0. */
  onClearPins?: () => void;
  /** Modo "inspector sempre-ligado" — qualquer click num nó abre o inspector lateral. */
  inspectorMode?: boolean;
  onToggleInspectorMode?: () => void;
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
  onConnectionsClick,
  onSave,
  onRun,
  onPublish,
  saveState = "idle",
  publishState = "idle",
  lastSavedAt,
  hasActiveRun = false,
  pinnedCount = 0,
  onClearPins,
  inspectorMode = false,
  onToggleInspectorMode,
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

        {onToggleInspectorMode && (
          <Button
            variant="ghost"
            size="icon-sm"
            className={cn("rounded-full", inspectorMode && "text-sky-600")}
            onClick={onToggleInspectorMode}
            aria-label={
              inspectorMode ? "Desligar inspector automático" : "Ligar inspector automático"
            }
            title={
              inspectorMode
                ? "Inspector automático: ON — clique num nó pra ver execução"
                : "Inspector automático: OFF"
            }
          >
            {inspectorMode ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
          </Button>
        )}

        {onConnectionsClick && (
          <Button
            variant="ghost"
            size="icon-sm"
            className="rounded-full"
            onClick={onConnectionsClick}
            aria-label="Credenciais tipadas"
            title="Credenciais tipadas"
          >
            <Database className="size-4" />
          </Button>
        )}

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
            <TabsTrigger
              value="performance"
              className="size-7 rounded-full p-0"
              aria-label="Performance"
              title="Performance"
            >
              <Activity className="size-4" />
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <Separator orientation="vertical" className="mx-1 h-5" />

        {onClearPins && pinnedCount > 0 && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="relative rounded-full text-amber-600"
                  onClick={onClearPins}
                  aria-label={`Limpar ${pinnedCount} pin(s)`}
                >
                  <PinOff className="size-4" />
                  <span
                    aria-hidden
                    className="absolute -right-0.5 -top-0.5 grid min-w-4 place-items-center rounded-full bg-amber-500 px-1 text-[9px] font-semibold leading-none text-white"
                  >
                    {pinnedCount}
                  </span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {pinnedCount === 1
                  ? "1 nó pinado — clique para limpar"
                  : `${pinnedCount} nós pinados — clique para limpar`}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}

        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                className={cn("relative rounded-full", dirty && "text-foreground")}
                onClick={onSave}
                aria-label={savedLabel ?? "Salvar"}
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
            </TooltipTrigger>
            <TooltipContent
              className={cn(saveState === "error" && "bg-destructive text-destructive-foreground")}
            >
              {savedLabel ?? "Salvar"}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        {onPublish && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="rounded-full"
                  onClick={onPublish}
                  aria-label="Publicar versão"
                  disabled={publishState === "publishing"}
                >
                  {publishState === "publishing" ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : publishState === "published" || publishState === "already_existed" ? (
                    <Check className="size-4" />
                  ) : (
                    <Tag className="size-4" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {publishState === "publishing"
                  ? "Publicando…"
                  : publishState === "published"
                    ? "Versão publicada"
                    : publishState === "already_existed"
                      ? "Já na versão mais recente"
                      : "Publicar versão"}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
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
