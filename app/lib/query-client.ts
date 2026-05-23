import { QueryClient } from "@tanstack/react-query";

/**
 * Client único compartilhado por toda a árvore. Mantemos defaults conservadores
 * para evitar refetch agressivo enquanto o app é majoritariamente de leitura:
 * - `staleTime` de 30s amortece navegação imediata entre rotas.
 * - `refetchOnWindowFocus` desligado: a maioria das telas não precisa revalidar
 *   ao voltar pra aba; mutações chamam `invalidateQueries` quando relevante.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});
