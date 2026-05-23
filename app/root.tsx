import { useEffect } from "react";
import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useNavigate,
} from "react-router";

import { QueryClientProvider } from "@tanstack/react-query";

import type { Route } from "./+types/root";
import "./app.css";
import { onUnauthorized } from "~/services";
import { queryClient } from "~/lib/query-client";
import { TooltipProvider } from "~/components/ui/tooltip";
import { ThemeScript } from "~/components/theme-script";
import { useApplyTheme } from "~/stores/theme";

export const links: Route.LinksFunction = () => [];

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
        {/* Aplica o tema antes do React hidratar — evita FOUC entre claro/escuro. */}
        <ThemeScript />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  const navigate = useNavigate();

  // Sincroniza a classe `.dark` no <html> com a store de tema (zustand).
  useApplyTheme();

  // Centraliza a reação a respostas 401 do backend: o cliente $fetch já limpa
  // o token; aqui mandamos o usuário pra tela de login.
  useEffect(() => {
    onUnauthorized(() => navigate("/auth", { replace: true }));
    return () => onUnauthorized(null);
  }, [navigate]);

  // TooltipProvider precisa envolver o app porque o `SidebarMenuButton` com
  // a prop `tooltip` (usada no AppShell quando a sidebar está colapsada)
  // renderiza um Tooltip do Radix internamente.
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider delayDuration={150}>
        <Outlet />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let message = "Oops!";
  let details = "An unexpected error occurred.";
  let stack: string | undefined;

  if (isRouteErrorResponse(error)) {
    message = error.status === 404 ? "404" : "Error";
    details =
      error.status === 404 ? "The requested page could not be found." : error.statusText || details;
  } else if (import.meta.env.DEV && error && error instanceof Error) {
    details = error.message;
    stack = error.stack;
  }

  return (
    <main className="pt-16 p-4 container mx-auto">
      <h1>{message}</h1>
      <p>{details}</p>
      {stack && (
        <pre className="w-full p-4 overflow-x-auto">
          <code>{stack}</code>
        </pre>
      )}
    </main>
  );
}
