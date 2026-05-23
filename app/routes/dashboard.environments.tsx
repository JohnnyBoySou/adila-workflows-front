import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Check,
  Globe,
  Loader2,
  MoreHorizontal,
  Plus,
  Server,
  TestTube,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";

import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { queryKeys } from "~/lib/query-keys";
import type { DashboardHandle } from "~/routes/dashboard";
import type { Environment, EnvironmentKind } from "~/services/environments";
import * as environmentsApi from "~/services/environments";

export const handle: DashboardHandle = { title: "Ambientes" };

const kindMeta: Record<EnvironmentKind, { label: string; icon: React.ComponentType<{ className?: string }> }> = {
  development: { label: "Desenvolvimento", icon: Server },
  test: { label: "Teste", icon: TestTube },
  stage: { label: "Stage", icon: Globe },
  production: { label: "Produção", icon: Globe },
};

const kindVariant: Record<EnvironmentKind, "default" | "secondary" | "outline" | "destructive"> = {
  development: "secondary",
  test: "outline",
  stage: "outline",
  production: "default",
};

/* ─────────────── Diálogo criar ─────────────── */

function EnvironmentCreateDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [kind, setKind] = useState<EnvironmentKind>("development");
  const [description, setDescription] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);

  function deriveSlug(n: string) {
    return n
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-_]/g, "")
      .slice(0, 63);
  }

  const mutation = useMutation({
    mutationFn: () =>
      environmentsApi.create({
        name: name.trim(),
        slug: slug.trim(),
        kind,
        description: description.trim() || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.environments.all });
      onOpenChange(false);
      setName("");
      setSlug("");
      setKind("development");
      setDescription("");
      setSlugTouched(false);
    },
  });

  function handleNameChange(v: string) {
    setName(v);
    if (!slugTouched) setSlug(deriveSlug(v));
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Novo ambiente</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="env-name">Nome</Label>
            <Input
              id="env-name"
              placeholder="Production"
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="env-slug">Slug</Label>
            <Input
              id="env-slug"
              placeholder="production"
              value={slug}
              onChange={(e) => {
                setSlugTouched(true);
                setSlug(e.target.value);
              }}
            />
            <p className="text-xs text-muted-foreground">
              Identificador único. Letras minúsculas, dígitos, hífen ou underscore.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="env-kind">Tipo</Label>
            <Select value={kind} onValueChange={(v) => setKind(v as EnvironmentKind)}>
              <SelectTrigger id="env-kind">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(kindMeta) as EnvironmentKind[]).map((k) => (
                  <SelectItem key={k} value={k}>
                    {kindMeta[k].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="env-desc">Descrição (opcional)</Label>
            <Input
              id="env-desc"
              placeholder="Ambiente de produção principal"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={!name.trim() || !slug.trim() || mutation.isPending}
          >
            {mutation.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
            Criar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─────────────── Diálogo deletar ─────────────── */

function EnvironmentDeleteDialog({
  environment,
  open,
  onOpenChange,
}: {
  environment: Environment | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: () => environmentsApi.remove(environment!.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.environments.all });
      onOpenChange(false);
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Deletar ambiente</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Tem certeza que deseja deletar{" "}
          <span className="font-medium text-foreground">{environment?.name}</span>? Todas as
          variáveis associadas serão removidas permanentemente.
        </p>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            variant="destructive"
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
          >
            {mutation.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
            Deletar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─────────────── Rota principal ─────────────── */

export default function EnvironmentsRoute() {
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Environment | null>(null);

  const { data: environments, isLoading } = useQuery({
    queryKey: queryKeys.environments.list(),
    queryFn: () => environmentsApi.list(),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Ambientes</h1>
          <p className="text-sm text-muted-foreground">
            Gerencie ambientes e suas variáveis de configuração.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="mr-2 size-4" />
          Novo ambiente
        </Button>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {!isLoading && environments?.length === 0 && (
        <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed py-16 text-center">
          <Server className="size-10 text-muted-foreground/40" />
          <div>
            <p className="font-medium">Nenhum ambiente criado</p>
            <p className="text-sm text-muted-foreground">
              Crie um ambiente para organizar suas variáveis.
            </p>
          </div>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="mr-2 size-4" />
            Novo ambiente
          </Button>
        </div>
      )}

      {!isLoading && environments && environments.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {environments.map((env) => {
            const meta = kindMeta[env.kind];
            const Icon = meta.icon;
            return (
              <div
                key={env.id}
                className="group relative rounded-lg border bg-card p-5 shadow-sm transition-shadow hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-2">
                  <Link
                    to={`/dashboard/environments/${env.id}`}
                    className="flex min-w-0 flex-1 items-start gap-3"
                  >
                    <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted">
                      <Icon className="size-4 text-muted-foreground" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="truncate font-medium">{env.name}</p>
                        {env.isDefault && (
                          <Check className="size-3.5 shrink-0 text-green-500" />
                        )}
                      </div>
                      <p className="truncate text-xs text-muted-foreground font-mono">{env.slug}</p>
                    </div>
                  </Link>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="shrink-0 opacity-0 group-hover:opacity-100"
                      >
                        <MoreHorizontal className="size-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem asChild>
                        <Link to={`/dashboard/environments/${env.id}`}>Abrir</Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-destructive"
                        onSelect={() => setDeleteTarget(env)}
                      >
                        <Trash2 className="mr-2 size-4" />
                        Deletar
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                {env.description && (
                  <p className="mt-3 text-sm text-muted-foreground line-clamp-2">
                    {env.description}
                  </p>
                )}

                <div className="mt-4">
                  <Badge variant={kindVariant[env.kind]}>{meta.label}</Badge>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <EnvironmentCreateDialog open={createOpen} onOpenChange={setCreateOpen} />
      <EnvironmentDeleteDialog
        environment={deleteTarget}
        open={deleteTarget !== null}
        onOpenChange={(v) => { if (!v) setDeleteTarget(null); }}
      />
    </div>
  );
}
