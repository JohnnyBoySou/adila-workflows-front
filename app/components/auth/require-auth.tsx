import { Loader2 } from "lucide-react";
import { Navigate, useLocation } from "react-router";

import { useSession } from "~/lib/auth-client";

/**
 * Guarda de rota: bloqueia renderização até a sessão resolver. Sem sessão,
 * redireciona pra `/auth?next=<path>` (sanitizado). O auth route honra `next`
 * pós-login.
 *
 * Uso: envolva a árvore protegida com `<RequireAuth>...</RequireAuth>` —
 * normalmente no layout (`dashboard.tsx`) ou no topo de rotas standalone
 * (`flow.tsx`). Não precisa repetir a checagem nas rotas filhas.
 */
export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { data, isPending } = useSession();
  const location = useLocation();

  if (isPending) {
    return (
      <div className="grid h-dvh w-full place-items-center text-muted-foreground">
        <Loader2 className="size-5 animate-spin" />
      </div>
    );
  }

  if (!data?.session) {
    const next = `${location.pathname}${location.search}`;
    const safe = next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
    return <Navigate to={`/auth?next=${encodeURIComponent(safe)}`} replace />;
  }

  return <>{children}</>;
}
