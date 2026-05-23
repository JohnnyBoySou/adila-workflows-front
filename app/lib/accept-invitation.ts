import { organization } from "~/lib/auth-client";
import { translateAuthError } from "~/lib/auth-errors";

export type AcceptInvitationResult =
  | { ok: true }
  | { ok: false; message: string };

/**
 * Aceita um convite de organização para o usuário autenticado atual.
 * O e-mail da sessão deve coincidir com o do convite.
 */
export async function acceptOrganizationInvitation(
  invitationId: string,
): Promise<AcceptInvitationResult> {
  const { error } = await organization.acceptInvitation({ invitationId });
  if (error) {
    return {
      ok: false,
      message: translateAuthError(error, "Não foi possível aceitar o convite."),
    };
  }
  return { ok: true };
}
