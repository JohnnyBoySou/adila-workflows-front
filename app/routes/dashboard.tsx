import { createContext, useContext, useState } from "react";
import { Outlet, useMatches } from "react-router";

import { AppShell, type Crumb } from "~/components/sidebar/app-shell";
import { RequireAuth } from "~/components/auth/require-auth";

/**
 * Tipo do `handle` que cada rota filha pode exportar para participar
 * do breadcrumb e do título no header do AppShell.
 *
 * - `title`  → texto da última crumb (e título da página).
 * - `parent` → crumbs intermediárias entre Dashboard e a página atual
 *              (útil quando a hierarquia da URL não basta, ex.: detalhe
 *              de workflow que deve mostrar "Workflows" como pai).
 *
 * Uso na rota filha:
 *   export const handle: DashboardHandle = {
 *     title: "Configurações",
 *   };
 */
export type DashboardHandle = {
  title: string;
  parent?: Crumb[];
};

function isDashboardHandle(h: unknown): h is DashboardHandle {
  return (
    typeof h === "object" && h !== null && typeof (h as { title?: unknown }).title === "string"
  );
}

/**
 * Contexto que rotas filhas usam para empurrar crumbs dinâmicos ao header.
 * Útil quando os crumbs dependem de dados assíncronos (ex: trail de pastas
 * em Workflows). As crumbs são inseridas depois das estáticas do `handle`.
 *
 * Uso na rota filha:
 *   const setDynamicCrumbs = useDynamicCrumbs();
 *   useEffect(() => {
 *     setDynamicCrumbs([{ label: "Pasta", to: "..." }]);
 *     return () => setDynamicCrumbs([]);
 *   }, [trail]);
 */
const DynamicCrumbsContext = createContext<(crumbs: Crumb[]) => void>(() => {});
export function useDynamicCrumbs() {
  return useContext(DynamicCrumbsContext);
}

export default function DashboardLayout() {
  const matches = useMatches();
  const [dynamicCrumbs, setDynamicCrumbs] = useState<Crumb[]>([]);

  const handleMatches = matches.filter((m) => isDashboardHandle(m.handle));
  const leaf = handleMatches.at(-1);
  const leafHandle = leaf?.handle as DashboardHandle | undefined;

  const crumbs: Crumb[] = [
    { label: "Dashboard", to: "/dashboard" },
    ...handleMatches.slice(0, -1).map((m) => ({
      label: (m.handle as DashboardHandle).title,
      to: m.pathname,
    })),
    ...(leafHandle?.parent ?? []),
    ...dynamicCrumbs,
    ...(leafHandle ? [{ label: leafHandle.title }] : []),
  ];

  const deduped = crumbs.filter(
    (c, i, arr) => i === 0 || c.label !== arr[i - 1].label || c.to !== arr[i - 1].to,
  );

  return (
    <RequireAuth>
      <DynamicCrumbsContext value={setDynamicCrumbs}>
        <AppShell title={leafHandle?.title ?? "Dashboard"} crumbs={deduped}>
          <Outlet />
        </AppShell>
      </DynamicCrumbsContext>
    </RequireAuth>
  );
}
