/**
 * Cliente Better Auth.
 *
 * Aponta para o backend Elysia, que monta o handler em `/api/auth/*`.
 * O `baseURL` aqui deve ser a **origem** do backend (sem o sufixo /api/auth),
 * pois o próprio cliente adiciona esse caminho às chamadas.
 *
 * Em dev:
 *   VITE_AUTH_URL=http://localhost:3000
 *
 * Em prod, aponte para o domínio público da API.
 */
import { createAuthClient } from "better-auth/react";
import { organizationClient } from "better-auth/client/plugins";

const AUTH_BASE_URL: string =
  (import.meta.env.VITE_AUTH_URL as string | undefined) ??
  (import.meta.env.VITE_API_URL as string | undefined) ??
  "http://localhost:3000";

export const authClient = createAuthClient({
  baseURL: AUTH_BASE_URL,
  fetchOptions: {
    // O backend está em outra origem em dev — precisamos enviar o cookie de sessão.
    credentials: "include",
  },
  plugins: [organizationClient()],
});

export const { useSession, signIn, signUp, signOut, getSession, organization } = authClient;
