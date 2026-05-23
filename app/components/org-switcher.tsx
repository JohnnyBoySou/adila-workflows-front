import { Check, ChevronsUpDown, Loader2, Workflow } from "lucide-react";

import { organization, useActiveOrganization, useListOrganizations } from "~/lib/auth-client";
import { cn } from "~/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "~/components/ui/sidebar";

/**
 * Switcher de organização no topo do sidebar.
 *
 * - Lê a org ativa via `useActiveOrganization` (Better Auth + plugin organization).
 * - Lista todas as orgs do usuário via `useListOrganizations`.
 * - Trocar chama `organization.setActive({ organizationId })`, que persiste no
 *   `session.activeOrganizationId` e re-hidrata os hooks que dependem dela.
 */
export function OrgSwitcher() {
  const { data: activeOrg, isPending: activePending } = useActiveOrganization();
  const { data: orgs, isPending: listPending } = useListOrganizations();

  const isLoading = activePending || listPending;
  const items = orgs ?? [];

  async function handleSelect(organizationId: string) {
    if (organizationId === activeOrg?.id) return;
    await organization.setActive({ organizationId });
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton size="lg" className="data-[state=open]:bg-sidebar-accent">
              <div className="grid size-8 shrink-0 place-items-center rounded-md bg-primary text-primary-foreground">
                <Workflow className="size-4" />
              </div>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-semibold">
                  {isLoading ? "Carregando..." : (activeOrg?.name ?? "Sem organização")}
                </span>
                <span className="truncate text-xs text-muted-foreground">
                  {activeOrg?.slug ?? "—"}
                </span>
              </div>
              <ChevronsUpDown className="ml-auto size-4 opacity-60" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>

          <DropdownMenuContent side="right" align="start" sideOffset={8} className="w-60">
            <DropdownMenuLabel className="text-xs text-muted-foreground">
              Organizações
            </DropdownMenuLabel>
            {isLoading && items.length === 0 ? (
              <div className="flex items-center gap-2 px-2 py-3 text-xs text-muted-foreground">
                <Loader2 className="size-3 animate-spin" /> Carregando...
              </div>
            ) : items.length === 0 ? (
              <div className="px-2 py-3 text-xs text-muted-foreground">
                Você ainda não pertence a uma organização.
              </div>
            ) : (
              items.map((org) => {
                const isActive = org.id === activeOrg?.id;
                return (
                  <DropdownMenuItem
                    key={org.id}
                    onSelect={() => handleSelect(org.id)}
                    className={cn("gap-2", isActive && "bg-muted/50")}
                  >
                    <div className="grid size-6 shrink-0 place-items-center rounded bg-muted text-[10px] font-semibold uppercase">
                      {getOrgInitials(org.name)}
                    </div>
                    <div className="grid min-w-0 flex-1 text-left">
                      <span className="truncate text-sm">{org.name}</span>
                      <span className="truncate text-xs text-muted-foreground">{org.slug}</span>
                    </div>
                    {isActive && <Check className="size-4 text-foreground/70" />}
                  </DropdownMenuItem>
                );
              })
            )}
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-[10px] font-normal text-muted-foreground">
              Crie e gerencie suas organizações em Configurações.
            </DropdownMenuLabel>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

function getOrgInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
