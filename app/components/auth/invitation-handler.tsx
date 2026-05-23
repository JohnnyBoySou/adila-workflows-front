import { Loader2, Mail } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";

import { acceptOrganizationInvitation } from "~/lib/accept-invitation";
import { useSession } from "~/lib/auth-client";
import { cn } from "~/lib/utils";

type Props = {
  invitationId: string;
};

type AcceptState =
  | { status: "idle" }
  | { status: "accepting" }
  | { status: "success" }
  | { status: "error"; message: string };

/**
 * Quando o usuário já está autenticado e abre o link do convite,
 * tenta aceitar automaticamente e redireciona ao dashboard.
 */
export function InvitationAutoAccept({ invitationId }: Props) {
  const navigate = useNavigate();
  const { data: session, isPending } = useSession();
  const [state, setState] = useState<AcceptState>({ status: "idle" });

  useEffect(() => {
    if (isPending || !session?.user) return;

    let cancelled = false;
    setState({ status: "accepting" });

    acceptOrganizationInvitation(invitationId).then((result) => {
      if (cancelled) return;
      if (result.ok) {
        setState({ status: "success" });
        navigate("/dashboard", { replace: true });
        return;
      }
      setState({ status: "error", message: result.message });
    });

    return () => {
      cancelled = true;
    };
  }, [invitationId, isPending, session?.user, navigate]);

  if (isPending || !session?.user) return null;

  if (state.status === "accepting" || state.status === "success") {
    return (
      <NoticeBox>
        <Loader2 className="size-4 shrink-0 animate-spin" />
        <div>
          <p className="font-medium">Aceitando convite…</p>
          <p className="text-sm text-muted-foreground">
            Aguarde enquanto adicionamos você à organização.
          </p>
        </div>
      </NoticeBox>
    );
  }

  if (state.status === "error") {
    return (
      <NoticeBox destructive>
        <div>
          <p className="font-medium">Não foi possível aceitar o convite</p>
          <p className="text-sm text-muted-foreground">{state.message}</p>
        </div>
      </NoticeBox>
    );
  }

  return null;
}

/** Banner exibido para visitantes não autenticados com link de convite. */
export function InvitationGuestBanner() {
  return (
    <NoticeBox>
      <Mail className="size-4 shrink-0 text-muted-foreground" />
      <div>
        <p className="font-medium">Você recebeu um convite</p>
        <p className="text-sm text-muted-foreground">
          Entre ou crie uma conta com o <strong className="text-foreground">mesmo e-mail</strong> do
          convite para participar da organização.
        </p>
      </div>
    </NoticeBox>
  );
}

function NoticeBox({
  children,
  destructive,
}: {
  children: React.ReactNode;
  destructive?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex gap-3 rounded-lg border p-4",
        destructive ? "border-destructive/40 bg-destructive/5" : "border-border bg-muted/40",
      )}
    >
      {children}
    </div>
  );
}
