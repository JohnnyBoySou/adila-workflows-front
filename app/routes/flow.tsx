import { useEffect, useState } from "react";
import type { Route } from "./+types/flow";
import { WorkflowCanvas } from "~/components/flow/workflow-canvas";

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

  return (
    <main className="h-dvh w-full">
      {mounted ? (
        <WorkflowCanvas />
      ) : (
        <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
          Carregando editor…
        </div>
      )}
    </main>
  );
}
