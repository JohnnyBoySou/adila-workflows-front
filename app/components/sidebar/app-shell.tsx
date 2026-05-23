import { motion } from "framer-motion";
import {
  ArrowLeft,
  ChevronsUpDown,
  LayoutDashboard,
  LifeBuoy,
  LogOut,
  Settings,
  User,
  Users,
  Workflow,
} from "lucide-react";
import { Fragment } from "react";
import { Link, useLocation, useNavigate } from "react-router";

import { OrgSwitcher } from "~/components/auth/org-switcher";

import { Avatar, AvatarFallback, AvatarImage } from "~/components/ui/avatar";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "~/components/ui/breadcrumb";
import { Button } from "~/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { Separator } from "~/components/ui/separator";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
} from "~/components/ui/sidebar";
import { authClient, useSession } from "~/lib/auth-client";
import { cn } from "~/lib/utils";

type NavItem = {
  title: string;
  to: string;
  icon: React.ComponentType<{ className?: string }>;
};

const primaryNav: NavItem[] = [
  { title: "Dashboard", to: "/dashboard", icon: LayoutDashboard },
  { title: "Workflows", to: "/dashboard/workflows", icon: Workflow },
  { title: "Usuários", to: "/dashboard/users", icon: Users },
];

const secondaryNav: NavItem[] = [{ title: "Suporte", to: "#", icon: LifeBuoy }];

/** Item da cadeia de breadcrumbs do header. Sem `to` = nó folha (não-clicável). */
export type Crumb = {
  label: string;
  to?: string;
};

export function AppShell({
  children,
  title: _title,
  crumbs,
}: {
  children: React.ReactNode;
  title: string;
  crumbs: Crumb[];
}) {
  const navigate = useNavigate();
  // Botão de voltar só aparece quando há para onde voltar — quando a cadeia
  // tem ao menos uma crumb com `to` antes da folha (ou seja, profundidade ≥ 2).
  const canGoBack = crumbs.filter((c) => c.to).length > 0 && crumbs.length > 1;

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 h-4" />
          {canGoBack && (
            <>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Voltar"
                onClick={() => navigate(-1)}
              >
                <ArrowLeft className="size-4" />
              </Button>
              <Separator orientation="vertical" className="mx-1 h-4" />
            </>
          )}
          <Breadcrumb>
            <BreadcrumbList>
              {crumbs.map((c, i) => {
                const isLast = i === crumbs.length - 1;
                return (
                  <Fragment key={`${c.label}-${c.to ?? i}`}>
                    {i > 0 && <BreadcrumbSeparator />}
                    <BreadcrumbItem>
                      {isLast || !c.to ? (
                        <BreadcrumbPage>{c.label}</BreadcrumbPage>
                      ) : (
                        <BreadcrumbLink asChild>
                          <Link to={c.to}>{c.label}</Link>
                        </BreadcrumbLink>
                      )}
                    </BreadcrumbItem>
                  </Fragment>
                );
              })}
            </BreadcrumbList>
          </Breadcrumb>
        </header>
        <div className="flex flex-1 flex-col gap-4 p-4 md:p-6">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}

function AppSidebar() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { data: session, isPending } = useSession();
  const user = session?.user;
  const displayName = user?.name?.trim() || user?.email?.split("@")[0] || "Conta";
  const displayEmail = user?.email ?? "";
  const initials = getInitials(user?.name, user?.email);

  const isActive = (to: string) =>
    to === "/dashboard"
      ? pathname === "/dashboard"
      : pathname === to || pathname.startsWith(to + "/");

  async function handleSignOut() {
    await authClient.signOut();
    navigate("/auth", { replace: true });
  }

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <OrgSwitcher />
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Plataforma</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {primaryNav.map((item) => {
                const active = isActive(item.to);
                return (
                  <SidebarMenuItem key={item.to}>
                    {/* Pílula deslizante: o `layoutId` compartilhado faz o framer-motion
                        animar a posição/tamanho ao trocar de rota. Anulamos o bg padrão
                        do `data-active` no botão para deixar essa pílula ser o destaque. */}
                    {active && (
                      <motion.div
                        layoutId="sidebar-active-pill"
                        className="absolute inset-0 z-0 rounded-md bg-sidebar-accent"
                        transition={{ type: "spring", stiffness: 380, damping: 32, mass: 0.6 }}
                      />
                    )}
                    <SidebarMenuButton
                      asChild
                      isActive={active}
                      tooltip={item.title}
                      className={cn(
                        "relative z-10 transition-opacity data-active:bg-transparent",
                        !active && "opacity-55 hover:opacity-100",
                      )}
                    >
                      <Link to={item.to}>
                        <item.icon className="size-4" />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup className="mt-auto">
          <SidebarGroupContent>
            <SidebarMenu>
              {secondaryNav.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    tooltip={item.title}
                    className="opacity-55 transition-opacity hover:opacity-100"
                  >
                    <a href={item.to}>
                      <item.icon className="size-4" />
                      <span>{item.title}</span>
                    </a>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton size="lg" className="data-[state=open]:bg-sidebar-accent">
                  <Avatar className="size-8 rounded-md">
                    <AvatarImage src={user?.image ?? ""} alt={displayName} />
                    <AvatarFallback className="rounded-md">{initials}</AvatarFallback>
                  </Avatar>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-medium">
                      {isPending ? "Carregando…" : displayName}
                    </span>
                    <span className="truncate text-xs text-muted-foreground">{displayEmail}</span>
                  </div>
                  <ChevronsUpDown className="ml-auto size-4 opacity-60" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="right" align="end" sideOffset={8} className="w-56">
                <DropdownMenuLabel className="font-normal">
                  <div className="grid text-sm">
                    <span className="font-medium">{displayName}</span>
                    <span className="text-xs text-muted-foreground">{displayEmail}</span>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link to="/dashboard/profile">
                    <User className="size-4" /> Perfil
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link to="/dashboard/settings">
                    <Settings className="size-4" /> Configurações
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={handleSignOut}>
                  <LogOut className="size-4" /> Sair
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
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
