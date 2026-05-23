import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, FolderPlus, Loader2, MoreHorizontal, Pause, Play, Plus } from "lucide-react";

import type { Route } from "./+types/dashboard.workflows";
import type { DashboardHandle } from "./dashboard";
import * as foldersApi from "~/services/folders";
import * as workflowsApi from "~/services/workflows";
import type { Folder } from "~/services/folders";
import type { WorkflowStatus, WorkflowSummary } from "~/services/workflows";
import { queryKeys } from "~/lib/query-keys";

import { FolderCreateDialog } from "~/components/folder-create-dialog";
import { WorkflowCreateDialog } from "~/components/workflow-create-dialog";
import { WorkflowRenameDialog } from "~/components/workflow-rename-dialog";
import { WorkflowMoveDialog } from "~/components/workflow-move-dialog";
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
import { Card } from "~/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "~/components/ui/pagination";
import { FolderIcon } from "~/components/folder-icon";
import { cn } from "~/lib/utils";

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
};

const PAGE_SIZE = 20;

const statusMeta: Record<
  WorkflowStatus,
  { label: string; badge: "default" | "secondary" | "outline"; dot: string }
> = {
  active: { label: "Ativo", badge: "default", dot: "bg-secondary" },
  paused: { label: "Pausado", badge: "secondary", dot: "bg-muted-foreground/60" },
  draft: { label: "Rascunho", badge: "outline", dot: "bg-muted-foreground/30" },
  archived: { label: "Arquivado", badge: "outline", dot: "bg-muted-foreground/20" },
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
/* Queries                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Sobe a árvore de pastas montando o breadcrumb. O backend não expõe
 * ancestrais em lote, então a queryFn percorre o caminho. Cacheado por
 * `folders.path(folderId)`; invalidar `["folders"]` revalida todos os paths.
 */
function useFolderPath(folderId: string | null): Folder[] {
  const { data } = useQuery({
    queryKey: queryKeys.folders.path(folderId),
    enabled: folderId !== null,
    queryFn: async () => {
      const chain: Folder[] = [];
      let cursor: string | null = folderId;
      while (cursor) {
        const idAtStep = cursor;
        // eslint-disable-next-line no-await-in-loop -- cada pasta depende do parentId obtido no passo anterior
        const f = await foldersApi.get(idAtStep);
        chain.unshift(f);
        cursor = f.parentId;
      }
      return chain;
    },
  });
  return data ?? [];
}

/* -------------------------------------------------------------------------- */
/* Route                                                                       */
/* -------------------------------------------------------------------------- */

export default function WorkflowsListRoute() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const folderId = searchParams.get("folder");
  const page = Math.max(1, Number(searchParams.get("page") ?? "1") || 1);

  const [folderDialogOpen, setFolderDialogOpen] = useState(false);
  const [workflowDialogOpen, setWorkflowDialogOpen] = useState(false);

  const foldersQuery = useQuery({
    queryKey: queryKeys.folders.list(folderId),
    queryFn: () => foldersApi.list({ parentId: folderId ?? "root" }),
  });

  // `keepPreviousData` evita o "flash" de tela vazia ao trocar de página —
  // os cards anteriores ficam visíveis enquanto a próxima página chega.
  const workflowsQuery = useQuery({
    queryKey: queryKeys.workflows.list(folderId, page),
    queryFn: () =>
      workflowsApi.list({
        limit: PAGE_SIZE,
        offset: (page - 1) * PAGE_SIZE,
        folderId: folderId ?? "root",
      }),
    placeholderData: keepPreviousData,
  });

  const breadcrumbTrail = useFolderPath(folderId);

  const foldersData = foldersQuery.data ?? [];
  const workflowsData = workflowsQuery.data?.items ?? [];
  const workflowsTotal = workflowsQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(workflowsTotal / PAGE_SIZE));

  function setParam(key: "folder" | "page", value: string | null) {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value === null) next.delete(key);
        else next.set(key, value);
        // Trocar de pasta zera a página — manter o offset levaria ao limbo "out of range".
        if (key === "folder") next.delete("page");
        return next;
      },
      { replace: false },
    );
  }

  function enterFolder(id: string) {
    setParam("folder", id);
  }

  function openWorkflow(id: string) {
    navigate(`/flow/${id}`);
  }

  // Só travamos a UI no carregamento inicial; refetches em segundo plano
  // (após mutações ou troca de página com placeholder) mantêm o conteúdo visível.
  const loading = foldersQuery.isPending || workflowsQuery.isPending;
  const error =
    (foldersQuery.error instanceof Error ? foldersQuery.error.message : null) ??
    (workflowsQuery.error instanceof Error ? workflowsQuery.error.message : null);
  const empty = !loading && foldersData.length === 0 && workflowsData.length === 0;

  return (
    <div className="space-y-6">
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
                    <Link to="/dashboard/workflows">Todos</Link>
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
                        <Link to={`/dashboard/workflows?folder=${f.id}`}>{f.name}</Link>
                      </BreadcrumbLink>
                    )}
                  </BreadcrumbItem>
                );
              })}
            </BreadcrumbList>
          </Breadcrumb>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setFolderDialogOpen(true)}>
            <FolderPlus className="size-4" />
            Nova pasta
          </Button>
          <Button size="sm" onClick={() => setWorkflowDialogOpen(true)}>
            <Plus className="size-4" />
            Novo workflow
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      {loading ? (
        <div className="grid place-items-center rounded-md border border-dashed py-16 text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-2">
            <Loader2 className="size-4 animate-spin" />
            Carregando…
          </span>
        </div>
      ) : empty ? (
        <EmptyState />
      ) : (
        <>
          {foldersData.length > 0 && (
            <section className="space-y-3">
              <SectionTitle>Pastas</SectionTitle>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
                {foldersData.map((f) => (
                  <FolderCard key={f.id} folder={f} onOpen={() => enterFolder(f.id)} />
                ))}
              </div>
            </section>
          )}

          {workflowsData.length > 0 && (
            <section className="space-y-3">
              <SectionTitle>Workflows</SectionTitle>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {workflowsData.map((w) => (
                  <WorkflowCard key={w.id} workflow={w} onOpen={() => openWorkflow(w.id)} />
                ))}
              </div>
            </section>
          )}

          {workflowsTotal > PAGE_SIZE && (
            <PagerBar
              page={page}
              totalPages={totalPages}
              onChange={(p) => setParam("page", String(p))}
            />
          )}

          {workflowsTotal > 0 && (
            <p className="text-center text-xs text-muted-foreground">
              Exibindo {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, workflowsTotal)} de{" "}
              {workflowsTotal} workflows
            </p>
          )}
        </>
      )}

      <FolderCreateDialog
        open={folderDialogOpen}
        onOpenChange={setFolderDialogOpen}
        parentId={folderId}
      />
      <WorkflowCreateDialog
        open={workflowDialogOpen}
        onOpenChange={setWorkflowDialogOpen}
        folderId={folderId}
        onCreated={(wf) => {
          // Após criar, abre o studio do workflow recém-criado.
          navigate(`/flow/${wf.id}`);
        }}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Paginação                                                                   */
/* -------------------------------------------------------------------------- */

type PagerSlot = { kind: "page"; page: number } | { kind: "ellipsis"; uid: string };

function buildPageRange(current: number, total: number): PagerSlot[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => ({
      kind: "page" as const,
      page: i + 1,
    }));
  }
  const around = new Set<number>([1, total, current - 1, current, current + 1]);
  const sorted = [...around].filter((n) => n >= 1 && n <= total).toSorted((a, b) => a - b);
  const out: PagerSlot[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const n = sorted[i]!;
    out.push({ kind: "page", page: n });
    const next = sorted[i + 1];
    if (next !== undefined && next > n + 1) {
      out.push({ kind: "ellipsis", uid: `${n}-${next}` });
    }
  }
  return out;
}

function PagerBar({
  page,
  totalPages,
  onChange,
}: {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
}) {
  const range = buildPageRange(page, totalPages);
  const canPrev = page > 1;
  const canNext = page < totalPages;

  return (
    <Pagination>
      <PaginationContent>
        <PaginationItem>
          <PaginationPrevious
            text="Anterior"
            href="#"
            aria-disabled={!canPrev}
            className={!canPrev ? "pointer-events-none opacity-50" : undefined}
            onClick={(e) => {
              e.preventDefault();
              if (canPrev) onChange(page - 1);
            }}
          />
        </PaginationItem>

        {range.map((slot) =>
          slot.kind === "ellipsis" ? (
            <PaginationItem key={`ellipsis-${slot.uid}`}>
              <PaginationEllipsis />
            </PaginationItem>
          ) : (
            <PaginationItem key={slot.page}>
              <PaginationLink
                href="#"
                isActive={slot.page === page}
                onClick={(e) => {
                  e.preventDefault();
                  onChange(slot.page);
                }}
              >
                {slot.page}
              </PaginationLink>
            </PaginationItem>
          ),
        )}

        <PaginationItem>
          <PaginationNext
            text="Próximo"
            href="#"
            aria-disabled={!canNext}
            className={!canNext ? "pointer-events-none opacity-50" : undefined}
            onClick={(e) => {
              e.preventDefault();
              if (canNext) onChange(page + 1);
            }}
          />
        </PaginationItem>
      </PaginationContent>
    </Pagination>
  );
}

function WorkflowActionsMenu({
  status,
  duplicating,
  onDuplicate,
  onRename,
  onMove,
}: {
  status: WorkflowStatus;
  duplicating: boolean;
  onDuplicate: () => void;
  onRename: () => void;
  onMove: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label="Ações" className="bg-background/80">
          <MoreHorizontal className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
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
        <DropdownMenuItem onSelect={onDuplicate} disabled={duplicating}>
          {duplicating ? <Loader2 className="size-4 animate-spin" /> : <Copy className="size-4" />}
          Duplicar
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onRename}>Renomear</DropdownMenuItem>
        <DropdownMenuItem onSelect={onMove}>Mover para…</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="text-destructive focus:text-destructive">
          Excluir
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/* -------------------------------------------------------------------------- */
/* Cards                                                                       */
/* -------------------------------------------------------------------------- */

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
      {children}
    </h2>
  );
}

function FolderCard({ folder, onOpen }: { folder: Folder; onOpen: () => void }) {
  return (
    <div className="group relative">
      <button
        type="button"
        onClick={onOpen}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onOpen();
          }
        }}
        className="flex w-full cursor-pointer flex-col items-center gap-2 rounded-md p-3 text-center outline-none transition-colors hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <FolderIcon className="w-20 text-primary transition-transform group-hover:-translate-y-0.5" />
        <div className="min-w-0 space-y-0.5">
          <p className="truncate text-sm font-medium">{folder.name}</p>
          <p className="text-xs text-muted-foreground">
            Atualizada {formatRelative(folder.updatedAt)}
          </p>
        </div>
      </button>
      <div className="absolute top-2 right-2 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
        <ActionsMenu kind="folder" />
      </div>
    </div>
  );
}

function WorkflowCard({ workflow, onOpen }: { workflow: WorkflowSummary; onOpen: () => void }) {
  const meta = statusMeta[workflow.status];
  const queryClient = useQueryClient();
  const [renameOpen, setRenameOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);

  // Duplicar: precisamos da `definition` (não vem no `WorkflowSummary`), então
  // GET completo + POST. O backend gera novo id; nome ganha prefixo "Cópia de".
  const duplicateMutation = useMutation({
    mutationFn: async () => {
      const full = await workflowsApi.get(workflow.id);
      return workflowsApi.create({
        name: `Cópia de ${workflow.name}`,
        ...(full.description !== null && { description: full.description }),
        folderId: workflow.folderId,
        definition: full.definition,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.workflows.all });
    },
  });

  return (
    <Card className="group relative gap-0 overflow-hidden p-0 transition-colors hover:bg-muted/40">
      <button
        type="button"
        onClick={onOpen}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onOpen();
          }
        }}
        className="flex w-full cursor-pointer flex-col items-stretch gap-3 p-4 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <span aria-hidden="true" className={cn("size-2 shrink-0 rounded-full", meta.dot)} />
            <h3 className="truncate text-sm font-medium">{workflow.name}</h3>
          </div>
          <Badge variant={meta.badge} className="shrink-0">
            {meta.label}
          </Badge>
        </div>

        {workflow.description && (
          <p className="line-clamp-2 text-xs text-muted-foreground">{workflow.description}</p>
        )}

        <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
          <div className="space-y-0.5">
            <dt className="text-muted-foreground">Criado</dt>
            <dd className="font-medium">{dateFormatter.format(new Date(workflow.createdAt))}</dd>
          </div>
          <div className="space-y-0.5">
            <dt className="text-muted-foreground">Atualizado</dt>
            <dd className="font-medium">{formatRelative(workflow.updatedAt)}</dd>
          </div>
        </dl>
      </button>
      <div className="absolute top-2 right-2 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
        <WorkflowActionsMenu
          status={workflow.status}
          duplicating={duplicateMutation.isPending}
          onDuplicate={() => duplicateMutation.mutate()}
          onRename={() => setRenameOpen(true)}
          onMove={() => setMoveOpen(true)}
        />
      </div>

      <WorkflowRenameDialog
        open={renameOpen}
        onOpenChange={setRenameOpen}
        workflowId={workflow.id}
        currentName={workflow.name}
      />
      <WorkflowMoveDialog
        open={moveOpen}
        onOpenChange={setMoveOpen}
        workflowId={workflow.id}
        currentFolderId={workflow.folderId}
      />
    </Card>
  );
}

function ActionsMenu({ kind }: { kind: "folder" }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label="Ações" className="bg-background/80">
          <MoreHorizontal className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        {kind === "folder" && (
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

function EmptyState() {
  return (
    <div className="grid place-items-center rounded-md border border-dashed py-16 text-center">
      <div className="space-y-3">
        <div className="mx-auto w-20 text-muted-foreground/40">
          <FolderIcon />
        </div>
        <div className="space-y-1">
          <p className="text-sm font-medium">Nada por aqui</p>
          <p className="text-xs text-muted-foreground">
            Crie um workflow ou uma pasta para começar.
          </p>
        </div>
      </div>
    </div>
  );
}
