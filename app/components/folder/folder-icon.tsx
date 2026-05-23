import { cn } from "~/lib/utils";

/**
 * Ícone de pasta SVG, two-tone — corpo + aba na frente, ambos derivados de
 * `currentColor` via classes utilitárias (fill-current + opacidades).
 *
 * Use uma cor de texto Tailwind no wrapper para pintar (`text-primary` etc.).
 */
export function FolderIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 80 64"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className={cn("h-auto w-full", className)}
    >
      {/* Costas da pasta + aba */}
      <path
        d="M4 14 a4 4 0 0 1 4 -4 h22 a3 3 0 0 1 2.4 1.2 l3.2 4.2 a3 3 0 0 0 2.4 1.2 h36 a4 4 0 0 1 4 4 v36 a4 4 0 0 1 -4 4 H8 a4 4 0 0 1 -4 -4 Z"
        className="fill-current"
      />
      {/* Frente da pasta — um pouco mais clara, com um shift pra dar profundidade */}
      <path
        d="M4 24 h72 v32 a4 4 0 0 1 -4 4 H8 a4 4 0 0 1 -4 -4 Z"
        className="fill-current opacity-70"
      />
      {/* Linha sutil entre frente e costas (sombra) */}
      <path d="M4 24 h72" className="stroke-current opacity-15" strokeWidth="1" fill="none" />
    </svg>
  );
}
