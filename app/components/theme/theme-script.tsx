import { THEME_STORAGE_KEY } from "~/stores/theme";

/**
 * Snippet inline injetado no `<head>` para aplicar o tema *antes* do React
 * hidratar — evita o flash de tela clara em quem prefere escuro.
 *
 * Lê a mesma chave/formato que o zustand-persist grava (`{ state: { theme } }`)
 * e, no fallback (`system` ou sem valor), consulta `prefers-color-scheme`.
 */
export function ThemeScript() {
  const script = `
(function () {
  try {
    var raw = localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});
    var stored = raw ? (JSON.parse(raw).state || {}).theme : null;
    var theme = stored || "system";
    var effective = theme === "system"
      ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
      : theme;
    if (effective === "dark") document.documentElement.classList.add("dark");
  } catch (_) {}
})();
`.trim();

  // eslint-disable-next-line react/no-danger
  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}
