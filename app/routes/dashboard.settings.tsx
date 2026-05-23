import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

import type { Route } from "./+types/dashboard.settings";
import type { DashboardHandle } from "./dashboard";

import { Button } from "~/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Separator } from "~/components/ui/separator";
import { ThemeSwitcher } from "~/components/theme-switcher";
import { organization, useActiveOrganization } from "~/lib/auth-client";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Configurações — Workflows" },
    { name: "description", content: "Configurações da organização" },
  ];
}

export const handle: DashboardHandle = {
  title: "Configurações",
};

type SaveState =
  | { status: "idle" }
  | { status: "saving" }
  | { status: "success" }
  | { status: "error"; message: string };

export default function DashboardSettingsRoute() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Configurações</h1>
        <p className="text-sm text-muted-foreground">Gerencie as informações da organização.</p>
      </div>

      <OrganizationCard />

      <Card>
        <CardHeader>
          <CardTitle>Aparência</CardTitle>
          <CardDescription>
            Escolha como a interface deve aparecer. A preferência fica salva neste navegador.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ThemeSwitcher />
        </CardContent>
      </Card>
    </div>
  );
}

function OrganizationCard() {
  // `useActiveOrganization` resolve a org ativa da sessão (Better Auth + plugin organization).
  const { data: activeOrg, isPending } = useActiveOrganization();

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [save, setSave] = useState<SaveState>({ status: "idle" });

  // Sempre que a org ativa mudar, sincroniza o formulário.
  useEffect(() => {
    if (!activeOrg) return;
    setName(activeOrg.name ?? "");
    setSlug(activeOrg.slug ?? "");
  }, [activeOrg]);

  const dirty = !!activeOrg && (name !== activeOrg.name || slug !== activeOrg.slug);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!activeOrg || !dirty) return;
    setSave({ status: "saving" });
    const { error } = await organization.update({
      organizationId: activeOrg.id,
      data: { name: name.trim(), slug: slug.trim() },
    });
    if (error) {
      setSave({ status: "error", message: error.message ?? "Não foi possível salvar." });
      return;
    }
    setSave({ status: "success" });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Organização</CardTitle>
        <CardDescription>Informações públicas da sua organização.</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="org-name">Nome</Label>
              <Input
                id="org-name"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (save.status !== "idle") setSave({ status: "idle" });
                }}
                disabled={isPending || save.status === "saving"}
                placeholder={isPending ? "Carregando..." : "Minha organização"}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="org-slug">Slug</Label>
              <Input
                id="org-slug"
                value={slug}
                onChange={(e) => {
                  setSlug(e.target.value);
                  if (save.status !== "idle") setSave({ status: "idle" });
                }}
                disabled={isPending || save.status === "saving"}
                placeholder={isPending ? "..." : "minha-org"}
              />
              <p className="text-xs text-muted-foreground">Usado em URLs e integrações.</p>
            </div>
          </div>

          <Separator />

          <div className="flex items-center justify-between gap-3">
            <SaveFeedback state={save} />
            <Button type="submit" disabled={!dirty || save.status === "saving" || isPending}>
              {save.status === "saving" ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Salvando...
                </>
              ) : (
                "Salvar alterações"
              )}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function SaveFeedback({ state }: { state: SaveState }) {
  if (state.status === "success") {
    return <p className="text-xs text-emerald-600">Alterações salvas.</p>;
  }
  if (state.status === "error") {
    return <p className="text-xs text-destructive">{state.message}</p>;
  }
  return null;
}
