import { motion } from "framer-motion";
import { Workflow } from "lucide-react";
import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router";

import {
  InvitationAutoAccept,
  InvitationGuestBanner,
} from "~/components/auth/invitation-handler";
import { PasswordInput } from "~/components/auth/password-input";
import { acceptOrganizationInvitation } from "~/lib/accept-invitation";
import { PasswordStrength } from "~/components/auth/password-strength";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { authClient, useSession } from "~/lib/auth-client";
import { translateAuthError } from "~/lib/auth-errors";
import type { Route } from "./+types/auth";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Entrar — Workflows" }, { name: "description", content: "Acesse sua conta" }];
}

export default function AuthRoute() {
  const [searchParams] = useSearchParams();
  const invitationId = searchParams.get("invitation")?.trim() || null;
  const { data: session, isPending: sessionPending } = useSession();
  const showGuestInviteBanner = !!invitationId && !sessionPending && !session?.user;

  return (
    <main className="grid min-h-dvh w-full lg:grid-cols-2">
      <section className="flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-sm space-y-6">
          {invitationId && <InvitationAutoAccept invitationId={invitationId} />}
          {showGuestInviteBanner && <InvitationGuestBanner />}

          <div className="flex items-center gap-2">
            <div className="grid size-8 place-items-center rounded-md bg-primary text-primary-foreground">
              <Workflow className="size-4" />
            </div>
            <span className="text-sm font-medium">Workflows</span>
          </div>

          <Tabs defaultValue="login" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="login">Entrar</TabsTrigger>
              <TabsTrigger value="signup">Criar conta</TabsTrigger>
            </TabsList>

            <TabsContent value="login" className="mt-4">
              <LoginCard invitationId={invitationId} />
            </TabsContent>
            <TabsContent value="signup" className="mt-4">
              <SignupCard invitationId={invitationId} />
            </TabsContent>
          </Tabs>

          <p className="text-center text-xs text-muted-foreground">
            Ao continuar, você concorda com os{" "}
            <a href="#" className="underline underline-offset-4 hover:text-foreground">
              Termos
            </a>{" "}
            e a{" "}
            <a href="#" className="underline underline-offset-4 hover:text-foreground">
              Política de Privacidade
            </a>
            .
          </p>
        </div>
      </section>

      <aside className="relative hidden overflow-hidden bg-primary text-primary-foreground lg:block">
        <motion.div
          animate={{ opacity: [0.25, 0.9, 0.25] }}
          transition={{
            duration: 6,
            ease: "easeInOut",
            repeat: Infinity,
          }}
          className="absolute inset-0 [background-image:linear-gradient(to_right,oklch(1_0_0/0.25)_1px,transparent_1px),linear-gradient(to_bottom,oklch(1_0_0/0.25)_1px,transparent_1px)] [background-size:32px_32px] [mask-image:radial-gradient(ellipse_at_center,black_0%,transparent_75%)]"
        />
        <motion.div
          animate={{ opacity: [0.4, 1, 0.4] }}
          transition={{
            duration: 6,
            ease: "easeInOut",
            repeat: Infinity,
            delay: 1.5,
          }}
          className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,oklch(1_0_0/0.18)_0%,transparent_60%),radial-gradient(circle_at_70%_80%,oklch(0_0_0/0.25)_0%,transparent_55%)]"
        />
        <div className="relative flex h-full flex-col justify-between p-10">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Workflow className="size-4" />
            Workflows
          </div>
          <blockquote className="space-y-3">
            <p className="text-2xl font-medium leading-snug">
              “Desenhar fluxos virou questão de minutos — não de reuniões.”
            </p>
            <footer className="text-sm text-primary-foreground/70">Equipe de Operações</footer>
          </blockquote>
        </div>
      </aside>
    </main>
  );
}

function LoginCard({ invitationId }: { invitationId: string | null }) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const email = String(form.get("email") ?? "");
    const password = String(form.get("password") ?? "");

    setLoading(true);
    setError(null);
    const { error: authError } = await authClient.signIn.email({
      email,
      password,
    });
    if (authError) {
      setError(translateAuthError(authError, "Falha ao entrar"));
      setLoading(false);
      return;
    }
    const redirectError = await finishAuthRedirect(navigate, invitationId);
    if (redirectError) setError(redirectError);
    setLoading(false);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Entrar na sua conta</CardTitle>
        <CardDescription>Use seu e-mail corporativo para acessar.</CardDescription>
      </CardHeader>
      <CardContent>
        <form id="login-form" onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="login-email">E-mail</Label>
            <Input
              id="login-email"
              name="email"
              type="email"
              placeholder="voce@empresa.com"
              autoComplete="email"
              required
            />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="login-password">Senha</Label>
              <a
                href="#"
                className="text-xs text-muted-foreground underline-offset-4 hover:underline"
              >
                Esqueceu?
              </a>
            </div>
            <PasswordInput
              id="login-password"
              name="password"
              autoComplete="current-password"
              required
            />
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Entrando…" : "Entrar"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function SignupCard({ invitationId }: { invitationId: string | null }) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [password, setPassword] = useState("");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const name = String(form.get("name") ?? "");
    const email = String(form.get("email") ?? "");
    const password = String(form.get("password") ?? "");

    setLoading(true);
    setError(null);
    const { error: authError } = await authClient.signUp.email({
      name,
      email,
      password,
    });
    if (authError) {
      setError(translateAuthError(authError, "Falha ao criar conta"));
      setLoading(false);
      return;
    }
    const redirectError = await finishAuthRedirect(navigate, invitationId);
    if (redirectError) setError(redirectError);
    setLoading(false);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Criar uma conta</CardTitle>
        <CardDescription>Comece grátis. Sem cartão de crédito.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="signup-name">Nome</Label>
            <Input id="signup-name" name="name" placeholder="Seu nome" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="signup-email">E-mail</Label>
            <Input
              id="signup-email"
              name="email"
              type="email"
              placeholder="voce@empresa.com"
              autoComplete="email"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="signup-password">Senha</Label>
            <PasswordInput
              id="signup-password"
              name="password"
              autoComplete="new-password"
              minLength={8}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <PasswordStrength password={password} />
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Criando…" : "Criar conta"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

/** Após login/cadastro, aceita convite pendente (se houver) e vai ao dashboard. */
async function finishAuthRedirect(
  navigate: ReturnType<typeof useNavigate>,
  invitationId: string | null,
): Promise<string | null> {
  if (invitationId) {
    const result = await acceptOrganizationInvitation(invitationId);
    if (!result.ok) return result.message;
  }
  navigate("/dashboard", { replace: true });
  return null;
}
