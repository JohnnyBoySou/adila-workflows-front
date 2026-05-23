import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, MailPlus, MoreHorizontal, UserPlus } from "lucide-react";
import { useEffect, useId, useMemo, useState } from "react";

import { ConfirmDialog } from "~/components/confirm-dialog";
import { Avatar, AvatarFallback, AvatarImage } from "~/components/ui/avatar";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import {
  organization,
  useActiveMember,
  useActiveOrganization,
  useSession,
} from "~/lib/auth-client";
import { queryKeys } from "~/lib/query-keys";
import type { Route } from "./+types/dashboard.users";
import type { DashboardHandle } from "./dashboard";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Usuários — Workflows" },
    { name: "description", content: "Gerencie membros e convites da organização" },
  ];
}

export const handle: DashboardHandle = {
  title: "Usuários",
};

type OrgRole = "owner" | "admin" | "member";

type MemberRow = {
  id: string;
  userId: string;
  role: string;
  createdAt: Date | string;
  user: {
    id: string;
    name: string;
    email: string;
    image?: string | null;
  };
};

type InvitationRow = {
  id: string;
  email: string;
  role: string | null;
  status: string;
  expiresAt: Date | string;
};

const ROLE_LABELS: Record<OrgRole, string> = {
  owner: "Proprietário",
  admin: "Administrador",
  member: "Membro",
};

const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

function primaryRole(role: string): OrgRole {
  const r = role.split(",")[0]?.trim() ?? "member";
  if (r === "owner" || r === "admin" || r === "member") return r;
  return "member";
}

function canManageMembers(role: string | undefined): boolean {
  if (!role) return false;
  return organization.checkRolePermission({
    role: primaryRole(role),
    permissions: {
      member: ["update", "delete"],
      invitation: ["create", "cancel"],
    },
  });
}

function canAssignRole(actorRole: string, targetRole: OrgRole): boolean {
  const actor = primaryRole(actorRole);
  if (targetRole === "owner") return actor === "owner";
  if (targetRole === "admin") return actor === "owner" || actor === "admin";
  return true;
}

function roleBadgeVariant(role: OrgRole): "default" | "secondary" | "outline" {
  if (role === "owner") return "default";
  if (role === "admin") return "secondary";
  return "outline";
}

export default function DashboardUsersRoute() {
  const { data: activeOrg, isPending: orgPending } = useActiveOrganization();
  const { data: activeMember, isPending: memberPending } = useActiveMember();
  const orgId = activeOrg?.id;
  const actorRole = activeMember?.role ?? "";
  const canManage = canManageMembers(actorRole);

  const [inviteOpen, setInviteOpen] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<MemberRow | null>(null);

  const membersQuery = useQuery({
    queryKey: queryKeys.organization.members(orgId ?? ""),
    queryFn: async () => {
      const { data, error } = await organization.listMembers({
        query: { organizationId: orgId, limit: 200 },
      });
      if (error) throw new Error(error.message ?? "Não foi possível carregar membros.");
      return data as { members: MemberRow[]; total: number };
    },
    enabled: !!orgId,
    placeholderData: keepPreviousData,
  });

  const invitationsQuery = useQuery({
    queryKey: queryKeys.organization.invitations(orgId ?? ""),
    queryFn: async () => {
      const { data, error } = await organization.listInvitations({
        query: { organizationId: orgId },
      });
      if (error) throw new Error(error.message ?? "Não foi possível carregar convites.");
      return (data ?? []) as InvitationRow[];
    },
    enabled: !!orgId,
    placeholderData: keepPreviousData,
  });

  const members = membersQuery.data?.members ?? [];
  const pendingInvites = (invitationsQuery.data ?? []).filter((i) => i.status === "pending");
  const isLoading = orgPending || memberPending || membersQuery.isPending;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Usuários</h1>
          <p className="text-sm text-muted-foreground">
            Membros e convites da organização{" "}
            {activeOrg?.name ? (
              <span className="font-medium text-foreground">{activeOrg.name}</span>
            ) : null}
            .
          </p>
        </div>
        {canManage && (
          <Button onClick={() => setInviteOpen(true)} disabled={!orgId}>
            <UserPlus className="size-4" />
            Convidar usuário
          </Button>
        )}
      </div>

      {!canManage && !memberPending && (
        <p className="text-sm text-muted-foreground">
          Você pode visualizar a equipe, mas apenas administradores podem convidar ou alterar
          membros.
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Membros</CardTitle>
          <CardDescription>
            {membersQuery.data?.total != null
              ? `${membersQuery.data.total} pessoa(s) na organização.`
              : "Pessoas com acesso à organização."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Carregando membros...
            </div>
          ) : members.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Nenhum membro encontrado.
            </p>
          ) : (
            <MembersTable
              members={members}
              actorRole={actorRole}
              canManage={canManage}
              organizationId={orgId!}
              onRemove={setRemoveTarget}
            />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Convites pendentes</CardTitle>
          <CardDescription>
            Convites enviados que ainda não foram aceitos (expiram em 48h).
          </CardDescription>
        </CardHeader>
        <CardContent>
          {invitationsQuery.isPending ? (
            <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Carregando convites...
            </div>
          ) : pendingInvites.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Nenhum convite pendente.
            </p>
          ) : (
            <InvitationsTable
              invitations={pendingInvites}
              canManage={canManage}
              organizationId={orgId!}
            />
          )}
        </CardContent>
      </Card>

      <InviteMemberDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        organizationId={orgId ?? ""}
        actorRole={actorRole}
      />

      <RemoveMemberDialog
        member={removeTarget}
        onOpenChange={(open) => !open && setRemoveTarget(null)}
        organizationId={orgId ?? ""}
      />
    </div>
  );
}

function MembersTable({
  members,
  actorRole,
  canManage,
  organizationId,
  onRemove,
}: {
  members: MemberRow[];
  actorRole: string;
  canManage: boolean;
  organizationId: string;
  onRemove: (m: MemberRow) => void;
}) {
  const queryClient = useQueryClient();
  const { data: session } = useSession();
  const currentUserId = session?.user?.id;

  const updateRole = useMutation({
    mutationFn: async ({ memberId, role }: { memberId: string; role: OrgRole }) => {
      const { error } = await organization.updateMemberRole({
        memberId,
        role,
        organizationId,
      });
      if (error) throw new Error(error.message ?? "Não foi possível atualizar o papel.");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.organization.all });
    },
  });

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Usuário</TableHead>
          <TableHead>Papel</TableHead>
          <TableHead className="hidden sm:table-cell">Entrou em</TableHead>
          <TableHead className="w-10" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {members.map((member) => {
          const role = primaryRole(member.role);
          const isSelf = member.userId === currentUserId;
          const canEditRole =
            canManage &&
            !isSelf &&
            (primaryRole(actorRole) === "owner" ||
              (primaryRole(actorRole) === "admin" && role !== "owner"));
          const showActions = canManage && !isSelf;

          return (
            <TableRow key={member.id}>
              <TableCell>
                <div className="flex items-center gap-3">
                  <Avatar className="size-9 rounded-md">
                    <AvatarImage src={member.user.image ?? ""} alt={member.user.name} />
                    <AvatarFallback className="rounded-md text-xs">
                      {getInitials(member.user.name, member.user.email)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="truncate font-medium">
                      {member.user.name || member.user.email}
                      {isSelf && (
                        <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                          (você)
                        </span>
                      )}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">{member.user.email}</p>
                  </div>
                </div>
              </TableCell>
              <TableCell>
                {canEditRole ? (
                  <RoleSelect
                    value={role}
                    disabled={updateRole.isPending}
                    actorRole={actorRole}
                    onChange={(next) =>
                      updateRole.mutate({ memberId: member.id, role: next })
                    }
                  />
                ) : (
                  <Badge variant={roleBadgeVariant(role)}>{ROLE_LABELS[role]}</Badge>
                )}
              </TableCell>
              <TableCell className="hidden text-muted-foreground sm:table-cell">
                {formatDate(member.createdAt)}
              </TableCell>
              <TableCell>
                {showActions && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon-sm" aria-label="Ações do membro">
                        <MoreHorizontal className="size-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onSelect={() => onRemove(member)}
                      >
                        Remover da organização
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

function InvitationsTable({
  invitations,
  canManage,
  organizationId,
}: {
  invitations: InvitationRow[];
  canManage: boolean;
  organizationId: string;
}) {
  const queryClient = useQueryClient();

  const cancelInvite = useMutation({
    mutationFn: async (invitationId: string) => {
      const { error } = await organization.cancelInvitation({ invitationId });
      if (error) throw new Error(error.message ?? "Não foi possível cancelar o convite.");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.organization.all });
    },
  });

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>E-mail</TableHead>
          <TableHead>Papel</TableHead>
          <TableHead className="hidden sm:table-cell">Expira em</TableHead>
          <TableHead className="w-10" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {invitations.map((invite) => {
          const role = primaryRole(invite.role ?? "member");
          return (
            <TableRow key={invite.id}>
              <TableCell>
                <div className="flex items-center gap-2">
                  <MailPlus className="size-4 text-muted-foreground" />
                  <span>{invite.email}</span>
                </div>
              </TableCell>
              <TableCell>
                <Badge variant={roleBadgeVariant(role)}>{ROLE_LABELS[role]}</Badge>
              </TableCell>
              <TableCell className="hidden text-muted-foreground sm:table-cell">
                {formatDate(invite.expiresAt)}
              </TableCell>
              <TableCell>
                {canManage && (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={cancelInvite.isPending}
                    onClick={() => cancelInvite.mutate(invite.id)}
                  >
                    Cancelar
                  </Button>
                )}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

function RoleSelect({
  value,
  onChange,
  actorRole,
  disabled,
}: {
  value: OrgRole;
  onChange: (role: OrgRole) => void;
  actorRole: string;
  disabled?: boolean;
}) {
  const options = useMemo(() => {
    const roles: OrgRole[] = ["member", "admin", "owner"];
    return roles.filter((r) => canAssignRole(actorRole, r));
  }, [actorRole]);

  return (
    <Select
      value={value}
      onValueChange={(v) => onChange(v as OrgRole)}
      disabled={disabled}
    >
      <SelectTrigger size="sm" className="w-[140px]">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((r) => (
          <SelectItem key={r} value={r}>
            {ROLE_LABELS[r]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function InviteMemberDialog({
  open,
  onOpenChange,
  organizationId,
  actorRole,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
  actorRole: string;
}) {
  const emailId = useId();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<OrgRole>("member");
  const [error, setError] = useState<string | null>(null);

  const assignableRoles = useMemo(() => {
    const roles: OrgRole[] = ["member", "admin", "owner"];
    return roles.filter((r) => canAssignRole(actorRole, r));
  }, [actorRole]);

  useEffect(() => {
    if (open) {
      setEmail("");
      setRole("member");
      setError(null);
    }
  }, [open]);

  const invite = useMutation({
    mutationFn: async () => {
      const trimmed = email.trim().toLowerCase();
      if (!trimmed.includes("@")) throw new Error("Informe um e-mail válido.");
      const { error: inviteError } = await organization.inviteMember({
        email: trimmed,
        role,
        organizationId,
      });
      if (inviteError) throw new Error(inviteError.message ?? "Não foi possível enviar o convite.");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.organization.all });
      onOpenChange(false);
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : "Falha ao convidar.");
    },
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    invite.mutate();
  }

  return (
    <Dialog open={open} onOpenChange={invite.isPending ? () => {} : onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>Convidar usuário</DialogTitle>
            <DialogDescription>
              O convidado receberá acesso à organização ao aceitar o convite com o mesmo e-mail da
              conta.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor={emailId}>E-mail</Label>
              <Input
                id={emailId}
                type="email"
                autoComplete="email"
                placeholder="colega@empresa.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={invite.isPending}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Papel</Label>
              <Select
                value={role}
                onValueChange={(v) => setRole(v as OrgRole)}
                disabled={invite.isPending}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {assignableRoles.map((r) => (
                    <SelectItem key={r} value={r}>
                      {ROLE_LABELS[r]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {error && <p className="text-xs text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={invite.isPending}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={invite.isPending}>
              {invite.isPending ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Enviando...
                </>
              ) : (
                "Enviar convite"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RemoveMemberDialog({
  member,
  onOpenChange,
  organizationId,
}: {
  member: MemberRow | null;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
}) {
  const queryClient = useQueryClient();

  const remove = useMutation({
    mutationFn: async () => {
      if (!member) return;
      const { error } = await organization.removeMember({
        memberIdOrEmail: member.id,
        organizationId,
      });
      if (error) throw new Error(error.message ?? "Não foi possível remover o membro.");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.organization.all });
      onOpenChange(false);
    },
  });

  return (
    <ConfirmDialog
      open={!!member}
      onOpenChange={(open) => {
        if (!open) onOpenChange(false);
      }}
      title="Remover membro"
      description={
        member ? (
          <>
            Remover <strong>{member.user.name || member.user.email}</strong> da organização? Essa
            pessoa perderá o acesso imediatamente.
          </>
        ) : undefined
      }
      confirmLabel="Remover"
      destructive
      loading={remove.isPending}
      onConfirm={() => remove.mutate()}
    />
  );
}

function formatDate(value: Date | string): string {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return dateFormatter.format(d);
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
