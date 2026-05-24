/**
 * Highlight inline pra JSON read-only. Sem dep — tokeniza via regex única
 * cobrindo keys, strings, números, booleans/null e pontuação. Cores via
 * semantic tokens, funciona em light/dark.
 */
import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "~/lib/utils";

const JSON_TOKEN_RE =
  /("(?:\\.|[^"\\])*"\s*:)|("(?:\\.|[^"\\])*")|\b(true|false|null)\b|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|([{}[\],])/g;

export function HighlightedJson({ value }: { value: unknown }) {
  const src = JSON.stringify(value, null, 2);
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  JSON_TOKEN_RE.lastIndex = 0;

  while ((match = JSON_TOKEN_RE.exec(src)) !== null) {
    if (match.index > lastIndex) parts.push(src.slice(lastIndex, match.index));
    const [token, key, str, kw, num, punct] = match;
    if (key) {
      parts.push(
        <span key={parts.length} className="text-sky-600 dark:text-sky-400">
          {key}
        </span>,
      );
    } else if (str) {
      parts.push(
        <span key={parts.length} className="text-emerald-600 dark:text-emerald-400">
          {str}
        </span>,
      );
    } else if (kw) {
      parts.push(
        <span key={parts.length} className="text-fuchsia-600 dark:text-fuchsia-400">
          {kw}
        </span>,
      );
    } else if (num) {
      parts.push(
        <span key={parts.length} className="text-amber-600 dark:text-amber-400">
          {num}
        </span>,
      );
    } else if (punct) {
      parts.push(
        <span key={parts.length} className="text-muted-foreground">
          {punct}
        </span>,
      );
    } else {
      parts.push(token);
    }
    lastIndex = match.index + token.length;
  }
  if (lastIndex < src.length) parts.push(src.slice(lastIndex));
  return <>{parts}</>;
}

/**
 * Botão "copiar" com feedback inline (vira ícone de check por ~1.5s).
 * Usa `navigator.clipboard` — graceful fallback é só não copiar.
 */
export function CopyJsonButton({
  value,
  className,
  label = "Copiar",
}: {
  value: unknown;
  className?: string;
  label?: string;
}) {
  const [copied, setCopied] = useState(false);

  const onClick = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(value, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard pode falhar em contextos não-seguros; ignora silenciosamente.
    }
  };

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex cursor-pointer items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
        copied && "text-emerald-600 dark:text-emerald-400",
        className,
      )}
      title={copied ? "Copiado!" : "Copiar JSON"}
    >
      {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
      {copied ? "Copiado" : label}
    </button>
  );
}
