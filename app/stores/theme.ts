/**
 * Store global do tema (claro / escuro / segue o sistema).
 *
 * Zustand + `persist` cuidam de:
 *   - salvar em `localStorage` sob a chave `workflows.theme`
 *   - rehidratar no client após a montagem (no SSR começa com `system`)
 *
 * A aplicação da classe `.dark` no `<html>` acontece em dois lugares:
 *   1. `ThemeScript` (no `<head>`) — antes do React hidratar, evita FOUC.
 *   2. `useApplyTheme()` — reage a mudanças de seleção e à preferência do SO.
 */
import { useEffect } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";

export type Theme = "light" | "dark" | "system";

export const THEME_STORAGE_KEY = "workflows.theme";

type ThemeState = {
  theme: Theme;
  setTheme: (theme: Theme) => void;
};

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      theme: "system",
      setTheme: (theme) => set({ theme }),
    }),
    {
      name: THEME_STORAGE_KEY,
      // Persistimos só o campo `theme` — evita gravar a função no storage.
      partialize: (state) => ({ theme: state.theme }),
    },
  ),
);

/** Resolve o tema efetivo levando em conta `system`. SSR-safe. */
export function resolveTheme(theme: Theme): "light" | "dark" {
  if (theme !== "system") return theme;
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/** Aplica a classe `.dark` no `<html>` conforme o tema atual. */
function applyTheme(theme: Theme): void {
  if (typeof document === "undefined") return;
  const effective = resolveTheme(theme);
  document.documentElement.classList.toggle("dark", effective === "dark");
}

/**
 * Hook montado uma vez no app (`root.tsx`) — sincroniza a classe `.dark` com a
 * store e re-aplica quando o usuário muda a preferência do SO no modo `system`.
 */
export function useApplyTheme(): void {
  const theme = useThemeStore((s) => s.theme);

  useEffect(() => {
    applyTheme(theme);

    if (theme !== "system") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => applyTheme("system");
    media.addEventListener("change", handler);
    return () => media.removeEventListener("change", handler);
  }, [theme]);
}
