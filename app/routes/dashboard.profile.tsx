import type { Route } from "./+types/dashboard.profile";
import type { DashboardHandle } from "./dashboard";

import { Avatar, AvatarFallback, AvatarImage } from "~/components/ui/avatar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { useSession } from "~/lib/auth-client";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Perfil — Workflows" },
    { name: "description", content: "Suas informações de conta" },
  ];
}

export const handle: DashboardHandle = {
  title: "Perfil",
};

export default function DashboardProfileRoute() {
  const { data: session, isPending } = useSession();
  const user = session?.user;
  const displayName = user?.name?.trim() || user?.email?.split("@")[0] || "Conta";
  const displayEmail = user?.email ?? "";
  const initials = getInitials(user?.name, user?.email);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Perfil</h1>
        <p className="text-sm text-muted-foreground">Suas informações pessoais.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Conta</CardTitle>
          <CardDescription>Dados vinculados à sua sessão.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <Avatar className="size-14 rounded-md">
              <AvatarImage src={user?.image ?? ""} alt={displayName} />
              <AvatarFallback className="rounded-md text-base">{initials}</AvatarFallback>
            </Avatar>
            <div className="grid gap-0.5">
              <p className="text-base font-medium">{isPending ? "Carregando..." : displayName}</p>
              <p className="text-sm text-muted-foreground">{displayEmail}</p>
            </div>
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="profile-name">Nome</Label>
              <Input id="profile-name" defaultValue={displayName} disabled />
            </div>
            <div className="space-y-2">
              <Label htmlFor="profile-email">E-mail</Label>
              <Input id="profile-email" defaultValue={displayEmail} disabled />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function getInitials(name?: string | null, email?: string | null): string {
  const source = (name ?? "").trim();
  if (source) {
    const parts = source.split(/\s+/).filter(Boolean);
    const first = parts[0]?.[0] ?? "";
    const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
    return (first + last).toUpperCase() || "?";
  }
  const local = (email ?? "").split("@")[0];
  return local.slice(0, 2).toUpperCase() || "?";
}
