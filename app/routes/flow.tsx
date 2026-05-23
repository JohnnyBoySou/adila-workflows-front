import { useEffect, useState } from "react";
import type { Route } from "./+types/flow";
import { WorkflowCanvas } from "~/components/flow/workflow-canvas";
import { FlowTopBar, type FlowTab } from "~/components/flow/flow-top-bar";
import { WorkflowInfoDialog, type WorkflowInfo } from "~/components/flow/workflow-info-dialog";
import { ExecutionsView } from "~/components/flow/executions-view";
import { cn } from "~/lib/utils";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Workflow Editor" },
    { name: "description", content: "Editor de workflows com React Flow" },
  ];
}

export default function FlowRoute() {
  // React Flow precisa do DOM (mede nós, faz fitView), então só montamos no cliente.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const [tab, setTab] = useState<FlowTab>("editor");
  const [infoOpen, setInfoOpen] = useState(false);
  const [info, setInfo] = useState<WorkflowInfo>({
    name: "Workflow sem título",
    description: "",
  });

  return (
    <main className="flex h-dvh w-full flex-col">
      <div className="relative flex-1">
        {/* Mantemos o canvas montado mesmo na aba de execuções para preservar o
            estado do flow (nodes, zoom, seleção). */}
        <div className={cn("absolute inset-0", tab === "editor" ? "block" : "hidden")}>
          {mounted ? (
            <WorkflowCanvas />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              Carregando editor…
            </div>
          )}
        </div>
        <div className={cn("absolute inset-0", tab === "executions" ? "block" : "hidden")}>
          <ExecutionsView />
        </div>
        <FlowTopBar tab={tab} onTabChange={setTab} onInfoClick={() => setInfoOpen(true)} />
      </div>

      <WorkflowInfoDialog open={infoOpen} onOpenChange={setInfoOpen} info={info} onSave={setInfo} />
    </main>
  );
}
