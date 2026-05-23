import type { Route } from "./+types/dashboard.settings";
import type { DashboardHandle } from "./dashboard";

import { Button } from "~/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Separator } from "~/components/ui/separator";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Configurações — Workflows" },
    { name: "description", content: "Configurações do workspace" },
  ];
}

export const handle: DashboardHandle = {
  title: "Configurações",
  breadcrumb: "Workspace",
};

export default function DashboardSettingsRoute() {
  return (
    <div className="mx-auto w-full max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Configurações</h1>
        <p className="text-sm text-muted-foreground">Gerencie as informações do workspace.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Geral</CardTitle>
          <CardDescription>Informações públicas do seu workspace.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="workspace-name">Nome do workspace</Label>
              <Input id="workspace-name" defaultValue="Workflows" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="workspace-slug">Slug</Label>
              <Input id="workspace-slug" defaultValue="workflows" />
              <p className="text-xs text-muted-foreground">Usado em URLs e integrações.</p>
            </div>
            <Separator />
            <div className="flex justify-end">
              <Button type="submit">Salvar alterações</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
