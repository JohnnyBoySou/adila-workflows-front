import { useMemo } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import {
  FolderClosed,
  FolderPlus,
  MoreHorizontal,
  Pause,
  Play,
  Plus,
  Workflow as WorkflowIcon,
} from "lucide-react";

import type { Route } from "./+types/dashboard.workflows";
import type { DashboardHandle } from "./dashboard";
import { environments, folders, workflows } from "~/lib/mock-workflows";
import type { EnvironmentId, Folder, WorkflowStatus, WorkflowSummary } from "~/services/workflows";

import { Badge } from "~/components/ui/badge";
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
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

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Workflows" },
    {
      name: "description",
      content: "Liste, organize e abra workflows no studio",
    },
  ];
}

export const handle: DashboardHandle = {
  title: "Workflows",
  breadcrumb: "Operações",
};

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

const DEFAULT_ENV: EnvironmentId = "production";

function isEnvironmentId(v: string | null): v is EnvironmentId {
  return v === "production" || v === "staging" || v === "development";
}

/** Reconstrói a cadeia de pastas até a raiz (inclusiva). */
function folderPath(folderId: string | null, all: Folder[]): Folder[] {
  const path: Folder[] = [];
  let cursor = folderId;
  while (cursor) {
    const f = all.find((x) => x.id === cursor);
    if (!f) break;
    path.unshift(f);
    cursor = f.parentId;
  }
  return path;
}

const statusMeta: Record<
  WorkflowStatus,
  { label: string; variant: "default" | "secondary" | "outline" }
> = {
  active: { label: "Ativo", variant: "default" },
  paused: { label: "Pausado", variant: "secondary" },
  draft: { label: "Rascunho", variant: "outline" },
};

const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});
const relativeFormatter = new Intl.RelativeTimeFormat("pt-BR", {
  numeric: "auto",
});

function formatRelative(iso: string | null): string {
  if (!iso) return "—";
  const diffMs = Date.parse(iso) - Date.now();
  const minutes = Math.round(diffMs / 60_000);
  if (Math.abs(minutes) < 60) return relativeFormatter.format(minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return relativeFormatter.format(hours, "hour");
  const days = Math.round(hours / 24);
  return relativeFormatter.format(days, "day");
}

/* -------------------------------------------------------------------------- */
/* Route                                                                       */
/* -------------------------------------------------------------------------- */

export default function WorkflowsListRoute() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const envParam = searchParams.get("env");
  const envId: EnvironmentId = isEnvironmentId(envParam) ? envParam : DEFAULT_ENV;
  const folderId = searchParams.get("folder");

  // Pastas e workflows filtrados pelo ambiente + pasta atual.
  const visibleFolders = useMemo(
    () =>
      folders
        .filter((f) => f.environmentId === envId && f.parentId === folderId)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [envId, folderId],
  );
  const visibleWorkflows = useMemo(
    () =>
      workflows
        .filter((w) => w.environmentId === envId && w.folderId === folderId)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [envId, folderId],
  );

  const breadcrumbTrail = useMemo(() => folderPath(folderId, folders), [folderId]);

  function setParam(key: "env" | "folder", value: string | null) {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value === null) next.delete(key);
        else next.set(key, value);
        // Trocar de ambiente reseta a pasta — pastas são por ambiente.
        if (key === "env") next.delete("folder");
        return next;
      },
      { replace: false },
    );
  }

  function enterFolder(id: string) {
    setParam("folder", id);
  }

  function openWorkflow(_id: string) {
    // Stub: studio único enquanto não temos rotas por id.
    // No futuro: navigate(`/dashboard/workflows/${_id}/studio`)
    navigate("/flow");
  }

  const rowCount = visibleFolders.length + visibleWorkflows.length;

  return (
    <div className="space-y-4">
      {/* Header da página */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Workflows</h1>
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                {breadcrumbTrail.length === 0 ? (
                  <BreadcrumbPage>Todos</BreadcrumbPage>
                ) : (
                  <BreadcrumbLink asChild>
                    <Link to={`/dashboard/workflows?env=${envId}`}>Todos</Link>
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
              {breadcrumbTrail.map((f, i) => {
                const isLast = i === breadcrumbTrail.length - 1;
                return (
                  <BreadcrumbItem key={f.id}>
                    <BreadcrumbSeparator />
                    {isLast ? (
                      <BreadcrumbPage>{f.name}</BreadcrumbPage>
                    ) : (
                      <BreadcrumbLink asChild>
                        <Link to={`/dashboard/workflows?env=${envId}&folder=${f.id}`}>
                          {f.name}
                        </Link>
                      </BreadcrumbLink>
                    )}
                  </BreadcrumbItem>
                );
              })}
            </BreadcrumbList>
          </Breadcrumb>
        </div>

        <div className="flex items-center gap-2">
          <Select value={envId} onValueChange={(v) => setParam("env", v)}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {environments.map((e) => (
                <SelectItem key={e.id} value={e.id}>
                  {e.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button variant="outline" size="sm">
            <FolderPlus className="size-4" />
            Nova pasta
          </Button>
          <Button size="sm" asChild>
            <Link to="/flow">
              <Plus className="size-4" />
              Novo workflow
            </Link>
          </Button>
        </div>
      </div>

      {/* Tabela */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[40%]">Nome</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Execuções 24h</TableHead>
              <TableHead>Última execução</TableHead>
              <TableHead>Atualizado</TableHead>
              <TableHead className="w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rowCount === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                  Nada por aqui. Crie um workflow ou uma pasta.
                </TableCell>
              </TableRow>
            ) : (
              <>
                {visibleFolders.map((f) => (
                  <FolderRow key={f.id} folder={f} onOpen={() => enterFolder(f.id)} />
                ))}
                {visibleWorkflows.map((w) => (
                  <WorkflowRow key={w.id} workflow={w} onOpen={() => openWorkflow(w.id)} />
                ))}
              </>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Linhas                                                                      */
/* -------------------------------------------------------------------------- */

function FolderRow({ folder, onOpen }: { folder: Folder; onOpen: () => void }) {
  return (
    <TableRow
      className="cursor-pointer"
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter") onOpen();
      }}
      tabIndex={0}
    >
      <TableCell>
        <div className="flex items-center gap-3">
          <div className="grid size-8 place-items-center rounded-md border bg-muted">
            <FolderClosed className="size-4 text-muted-foreground" />
          </div>
          <span className="font-medium">{folder.name}</span>
        </div>
      </TableCell>
      <TableCell className="text-muted-foreground">Pasta</TableCell>
      <TableCell />
      <TableCell />
      <TableCell className="text-muted-foreground">{formatRelative(folder.updatedAt)}</TableCell>
      <TableCell onClick={(e) => e.stopPropagation()}>
        <RowMenu kind="folder" />
      </TableCell>
    </TableRow>
  );
}

function WorkflowRow({ workflow, onOpen }: { workflow: WorkflowSummary; onOpen: () => void }) {
  const meta = statusMeta[workflow.status];
  return (
    <TableRow
      className="cursor-pointer"
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter") onOpen();
      }}
      tabIndex={0}
    >
      <TableCell>
        <div className="flex items-center gap-3">
          <div className="grid size-8 place-items-center rounded-md border bg-muted">
            <WorkflowIcon className="size-4 text-muted-foreground" />
          </div>
          <span className="font-medium">{workflow.name}</span>
        </div>
      </TableCell>
      <TableCell>
        <Badge variant={meta.variant}>{meta.label}</Badge>
      </TableCell>
      <TableCell className="text-right tabular-nums">
        {workflow.runsLast24h.toLocaleString("pt-BR")}
      </TableCell>
      <TableCell className="text-muted-foreground">
        {workflow.lastRunAt ? dateFormatter.format(new Date(workflow.lastRunAt)) : "—"}
      </TableCell>
      <TableCell className="text-muted-foreground">{formatRelative(workflow.updatedAt)}</TableCell>
      <TableCell onClick={(e) => e.stopPropagation()}>
        <RowMenu kind="workflow" status={workflow.status} />
      </TableCell>
    </TableRow>
  );
}

function RowMenu({ kind, status }: { kind: "folder" | "workflow"; status?: WorkflowStatus }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="size-8" aria-label="Ações">
          <MoreHorizontal className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        {kind === "workflow" ? (
          <>
            <DropdownMenuItem>
              {status === "active" ? (
                <>
                  <Pause className="size-4" /> Pausar
                </>
              ) : (
                <>
                  <Play className="size-4" /> Ativar
                </>
              )}
            </DropdownMenuItem>
            <DropdownMenuItem>Duplicar</DropdownMenuItem>
            <DropdownMenuItem>Renomear</DropdownMenuItem>
            <DropdownMenuItem>Mover para…</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-destructive focus:text-destructive">
              Excluir
            </DropdownMenuItem>
          </>
        ) : (
          <>
            <DropdownMenuItem>Renomear</DropdownMenuItem>
            <DropdownMenuItem>Mover para…</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-destructive focus:text-destructive">
              Excluir
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
