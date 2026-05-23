/**
 * Tradução dos erros do Better Auth para pt-BR.
 *
 * O Better Auth devolve `{ code, message, status }` em respostas de erro.
 * O `code` é estável (vem do `auth.api.errorCodes`); o `message` muda de
 * versão pra versão e vem em inglês. Centralizamos a tradução aqui — telas
 * só chamam `translateAuthError(error)`.
 *
 * Códigos não mapeados caem no `message` original (ou num fallback genérico).
 */

type AuthError =
  | {
      code?: string;
      message?: string;
      status?: number;
    }
  | null
  | undefined;

const MESSAGES: Record<string, string> = {
  // Sign-in
  INVALID_EMAIL_OR_PASSWORD: "E-mail ou senha inválidos.",
  INVALID_EMAIL: "E-mail inválido.",
  INVALID_PASSWORD: "Senha inválida.",
  EMAIL_NOT_VERIFIED: "Confirme seu e-mail antes de entrar.",
  USER_NOT_FOUND: "Usuário não encontrado.",
  ACCOUNT_NOT_FOUND: "Conta não encontrada.",
  CREDENTIAL_ACCOUNT_NOT_FOUND: "Conta com senha não encontrada para este e-mail.",

  // Sign-up
  USER_ALREADY_EXISTS: "Já existe uma conta com este e-mail.",
  EMAIL_ALREADY_EXISTS: "Este e-mail já está em uso.",
  PASSWORD_TOO_SHORT: "Senha muito curta.",
  PASSWORD_TOO_LONG: "Senha muito longa.",
  SIGN_UP_DISABLED: "Cadastro está desabilitado.",
  SIGN_UP_NOT_ENABLED: "Cadastro está desabilitado.",

  // Sessão
  SESSION_EXPIRED: "Sessão expirada. Entre novamente.",
  UNAUTHORIZED: "Não autorizado.",
  FAILED_TO_CREATE_SESSION: "Não foi possível criar a sessão.",
  FAILED_TO_CREATE_USER: "Não foi possível criar o usuário.",
  FAILED_TO_UPDATE_USER: "Não foi possível atualizar o usuário.",

  // Rate limit / genéricos
  TOO_MANY_REQUESTS: "Muitas tentativas. Tente novamente em alguns minutos.",
  rate_limited: "Muitas tentativas. Tente novamente em alguns minutos.",
};

// Fallback por status quando não temos código.
const STATUS_MESSAGES: Record<number, string> = {
  401: "Não autorizado.",
  403: "Acesso negado.",
  404: "Recurso não encontrado.",
  408: "Tempo esgotado. Tente novamente.",
  429: "Muitas tentativas. Tente novamente em alguns minutos.",
  500: "Erro no servidor. Tente novamente.",
  502: "Servidor indisponível. Tente novamente.",
  503: "Servidor indisponível. Tente novamente.",
};

export function translateAuthError(
  error: AuthError,
  fallback = "Ocorreu um erro. Tente novamente.",
): string {
  if (!error) return fallback;

  if (error.code && MESSAGES[error.code]) return MESSAGES[error.code];

  // Alguns erros vêm só como message — tentamos casar por substring conhecida.
  if (error.message) {
    const msg = error.message;
    if (/invalid email or password/i.test(msg)) return MESSAGES.INVALID_EMAIL_OR_PASSWORD;
    if (/user (already )?exists/i.test(msg)) return MESSAGES.USER_ALREADY_EXISTS;
    if (/password.*(short|min)/i.test(msg)) return MESSAGES.PASSWORD_TOO_SHORT;
    if (/email.*(invalid|not valid)/i.test(msg)) return MESSAGES.INVALID_EMAIL;
  }

  if (error.status && STATUS_MESSAGES[error.status]) {
    return STATUS_MESSAGES[error.status];
  }

  return error.message ?? fallback;
}
