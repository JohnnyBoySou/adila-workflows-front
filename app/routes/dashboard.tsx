import { Outlet, useMatches } from "react-router";

import { AppShell, type Crumb } from "~/components/sidebar/app-shell";

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

export default function DashboardLayout() {
  const matches = useMatches();

  // Monta a cadeia de crumbs percorrendo todos os matches que expõem `handle`
  // do tipo `DashboardHandle`. Cada match contribui com seu pathname como
  // href, ficando linkável até a página atual (que vira a folha não-link).
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
    ...(leafHandle ? [{ label: leafHandle.title }] : []),
  ];

  // Evita duplicar "Dashboard" quando a própria rota raiz do dashboard
  // declara esse título (dashboard.index).
  const deduped = crumbs.filter(
    (c, i, arr) => i === 0 || c.label !== arr[i - 1].label || c.to !== arr[i - 1].to,
  );

  return (
    <AppShell title={leafHandle?.title ?? "Dashboard"} crumbs={deduped}>
      <Outlet />
    </AppShell>
  );
}
