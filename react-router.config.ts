import type { Config } from "@react-router/dev/config";

export default {
  // SPA puro — `bun run build` gera apenas `build/client/`, servido como
  // estático em produção. Sem SSR (não há runtime Node/Bun pra renderizar).
  ssr: false,
} satisfies Config;
