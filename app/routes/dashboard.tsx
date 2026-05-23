import { Outlet, useMatches } from "react-router";

import { AppShell } from "~/components/app-shell";

/**
 * Tipo do `handle` que cada rota filha pode exportar para informar
 * título e breadcrumb que serão exibidos no header do AppShell.
 *
 * Uso na rota filha:
 *   export const handle: DashboardHandle = {
 *     title: "Configurações",
 *     breadcrumb: "Workspace",
 *   };
 */
export type DashboardHandle = {
  title: string;
  breadcrumb?: string;
};

function isDashboardHandle(h: unknown): h is DashboardHandle {
  return (
    typeof h === "object" && h !== null && typeof (h as { title?: unknown }).title === "string"
  );
}

export default function DashboardLayout() {
  const matches = useMatches();
  // Pega o `handle` da rota mais profunda que define um — assim filhas
  // podem sobrescrever o cabeçalho sem duplicar o AppShell.
  const current = matches
    .toReversed()
    .map((m) => m.handle)
    .find(isDashboardHandle);

  return (
    <AppShell title={current?.title ?? "Dashboard"} breadcrumb={current?.breadcrumb ?? "Workflows"}>
      <Outlet />
    </AppShell>
  );
}
