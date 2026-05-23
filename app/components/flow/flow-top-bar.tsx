import { Link } from "react-router";
import { ChevronLeft, History, Info, PenLine, Play, Save } from "lucide-react";

import { Button } from "~/components/ui/button";
import { Separator } from "~/components/ui/separator";
import { Tabs, TabsList, TabsTrigger } from "~/components/ui/tabs";

export type FlowTab = "editor" | "executions";

type FlowTopBarProps = {
  tab: FlowTab;
  onTabChange: (tab: FlowTab) => void;
  onInfoClick: () => void;
  onSave?: () => void;
  onRun?: () => void;
};

/**
 * Barra flutuante no topo do editor, centralizada horizontalmente.
 * Concentra navegação (voltar), metadados (info), troca de visão (tabs)
 * e ações principais (Salvar/Executar). Tudo icon‑only — `aria-label`
 * + `title` cobrem acessibilidade e tooltip nativo.
 */
export function FlowTopBar({ tab, onTabChange, onInfoClick, onSave, onRun }: FlowTopBarProps) {
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
              className="size-7 rounded-full p-0"
              aria-label="Execuções"
              title="Execuções"
            >
              <History className="size-4" />
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <Separator orientation="vertical" className="mx-1 h-5" />

        <Button
          variant="ghost"
          size="icon-sm"
          className="rounded-full"
          onClick={onSave}
          aria-label="Salvar"
          title="Salvar"
        >
          <Save className="size-4" />
        </Button>
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
