import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Copy,
  FolderPlus,
  LayoutGrid,
  List,
  Loader2,
  MoreHorizontal,
  Pause,
  Play,
  Plus,
  Search,
  Upload,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";

import { queryKeys } from "~/lib/query-keys";
import type { Folder } from "~/services/folders";
import * as foldersApi from "~/services/folders";
import type { WorkflowStatus, WorkflowSummary } from "~/services/workflows";
import * as workflowsApi from "~/services/workflows";
import type { Route } from "./+types/dashboard.workflows";
import type { DashboardHandle } from "./dashboard";

import { ConfirmDialog } from "~/components/confirm-dialog";
import { FolderCreateDialog } from "~/components/folder/folder-create-dialog";
import { FolderIcon } from "~/components/folder/folder-icon";
import { N8nImportDialog } from "~/components/n8n/n8n-import-dialog";
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
import { Input } from "~/components/ui/input";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "~/components/ui/pagination";
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
import { WorkflowCreateDialog } from "~/components/workflow/workflow-create-dialog";
import { WorkflowMoveDialog } from "~/components/workflow/workflow-move-dialog";
import { WorkflowRenameDialog } from "~/components/workflow/workflow-rename-dialog";
import { cn } from "~/lib/utils";

type ViewMode = "grid" | "table";
function isViewMode(v: string | null): v is ViewMode {
  return v === "grid" || v === "table";
}

const STATUSES: WorkflowStatus[] = ["active", "paused", "draft", "archived"];
function isWorkflowStatus(v: string | null): v is WorkflowStatus {
  return v !== null && (STATUSES as string[]).includes(v);
}

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
  const viewParam = searchParams.get("view");
  const view: ViewMode = isViewMode(viewParam) ? viewParam : "grid";
  const statusParam = searchParams.get("status");
  const status: WorkflowStatus | null = isWorkflowStatus(statusParam) ? statusParam : null;
  const q = (searchParams.get("q") ?? "").trim();
  // Pesquisa e filtro de status combinam mal com a navegação por pastas —
  // quando algum está ativo, listamos workflows da org inteira (folderId
  // omitido) e escondemos as pastas. Sem filtro, mantém o modo "explorar pasta".
  const filtersActive = q.length > 0 || status !== null;

  const [folderDialogOpen, setFolderDialogOpen] = useState(false);
  const [workflowDialogOpen, setWorkflowDialogOpen] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);

  // Input controlado localmente pra digitação fluida; sincronizamos com a URL
  // após um pequeno debounce. Quando a URL muda por outro motivo (clique no
  // botão limpar, navegação back/forward), o effect abaixo realinha o input.
  const [searchInput, setSearchInput] = useState(q);
  useEffect(() => {
    setSearchInput(q);
  }, [q]);
  useEffect(() => {
    const trimmed = searchInput.trim();
    if (trimmed === q) return;
    const t = setTimeout(() => {
      setParam("q", trimmed === "" ? null : trimmed);
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- setParam é estável o suficiente; q vem da URL
  }, [searchInput, q]);

  const foldersQuery = useQuery({
    queryKey: queryKeys.folders.list(folderId),
    queryFn: () => foldersApi.list({ parentId: folderId ?? "root" }),
    enabled: !filtersActive,
  });

  // `keepPreviousData` evita o "flash" de tela vazia ao trocar de página —
  // os cards anteriores ficam visíveis enquanto a próxima página chega.
  const workflowsQuery = useQuery({
    queryKey: queryKeys.workflows.list(folderId, page, { status, q }),
    queryFn: () =>
      workflowsApi.list({
        limit: PAGE_SIZE,
        offset: (page - 1) * PAGE_SIZE,
        // Com filtros ativos a busca passa a ser global; sem filtros mantém o
        // escopo da pasta atual (inclui "root" pra ver os soltos).
        ...(filtersActive ? {} : { folderId: folderId ?? "root" }),
        ...(status && { status }),
        ...(q && { q }),
      }),
    placeholderData: keepPreviousData,
  });

  const breadcrumbTrail = useFolderPath(folderId);

  const foldersData = foldersQuery.data ?? [];
  const workflowsData = workflowsQuery.data?.items ?? [];
  const workflowsTotal = workflowsQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(workflowsTotal / PAGE_SIZE));

  function setParam(
    key: "folder" | "page" | "view" | "q" | "status",
    value: string | null,
  ) {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value === null) next.delete(key);
        else next.set(key, value);
        // Mudar pasta, busca ou status invalida a paginação — manter o offset
        // anterior levaria a uma página fora do range no novo conjunto.
        if (key === "folder" || key === "q" || key === "status") next.delete("page");
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
  // `isPending` continua `true` quando a query está desabilitada (folders sob
  // filtros ativos) — `isLoading` reflete o estado real de fetching.
  const loading = foldersQuery.isLoading || workflowsQuery.isPending;
  const error =
    (foldersQuery.error instanceof Error ? foldersQuery.error.message : null) ??
    (workflowsQuery.error instanceof Error ? workflowsQuery.error.message : null);
  const empty = !loading && foldersData.length === 0 && workflowsData.length === 0;

  const showTable = view === "table";

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
          <ViewToggle value={view} onChange={(v) => setParam("view", v === "grid" ? null : v)} />
          <Button variant="outline" size="sm" onClick={() => setFolderDialogOpen(true)}>
            <FolderPlus className="size-4" />
            Nova pasta
          </Button>
          <Button variant="outline" size="sm" onClick={() => setImportDialogOpen(true)}>
            <Upload className="size-4" />
            Importar do n8n
          </Button>
          <Button size="sm" onClick={() => setWorkflowDialogOpen(true)}>
            <Plus className="size-4" />
            Novo workflow
          </Button>
        </div>
      </div>

      <FiltersBar
        search={searchInput}
        onSearchChange={setSearchInput}
        status={status}
        onStatusChange={(s) => setParam("status", s)}
        active={filtersActive}
        onClear={() => {
          setSearchInput("");
          setParam("q", null);
          setParam("status", null);
        }}
        resultCount={workflowsQuery.data?.total}
      />

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
          {showTable ? (
            <WorkflowsTable
              folders={foldersData}
              workflows={workflowsData}
              onEnterFolder={enterFolder}
              onOpenWorkflow={openWorkflow}
            />
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
            </>
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
      <N8nImportDialog
        open={importDialogOpen}
        onOpenChange={setImportDialogOpen}
        folderId={folderId}
        onImported={(wf) => navigate(`/flow/${wf.id}`)}
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

/* -------------------------------------------------------------------------- */
/* Filtros                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Barra de pesquisa + filtro de status. Mantém o input controlado pelo
 * pai (debounce sobre a URL fica fora daqui) e exibe um "Limpar" só quando
 * há ao menos um filtro ativo, evitando ruído visual no estado padrão.
 */
function FiltersBar({
  search,
  onSearchChange,
  status,
  onStatusChange,
  active,
  onClear,
  resultCount,
}: {
  search: string;
  onSearchChange: (v: string) => void;
  status: WorkflowStatus | null;
  onStatusChange: (v: WorkflowStatus | null) => void;
  active: boolean;
  onClear: () => void;
  resultCount: number | undefined;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative min-w-0 flex-1 sm:max-w-sm">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Pesquisar por nome…"
          aria-label="Pesquisar workflows"
          className="pl-8"
        />
        {search.length > 0 && (
          <button
            type="button"
            aria-label="Limpar pesquisa"
            onClick={() => onSearchChange("")}
            className="absolute top-1/2 right-2 inline-flex size-5 -translate-y-1/2 cursor-pointer items-center justify-center rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>

      <Select
        value={status ?? "all"}
        onValueChange={(v) => onStatusChange(v === "all" ? null : (v as WorkflowStatus))}
      >
        <SelectTrigger size="sm" className="w-[160px]" aria-label="Filtrar por status">
          <SelectValue placeholder="Status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todos os status</SelectItem>
          {STATUSES.map((s) => (
            <SelectItem key={s} value={s}>
              {statusMeta[s].label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {active && (
        <>
          <Button variant="ghost" size="sm" onClick={onClear}>
            <X className="size-4" />
            Limpar
          </Button>
          {typeof resultCount === "number" && (
            <span className="text-xs text-muted-foreground">
              {resultCount} resultado{resultCount === 1 ? "" : "s"}
            </span>
          )}
        </>
      )}
    </div>
  );
}

function WorkflowActionsMenu({
  status,
  duplicating,
  togglingStatus,
  onDuplicate,
  onRename,
  onMove,
  onToggleStatus,
  onDelete,
}: {
  status: WorkflowStatus;
  duplicating: boolean;
  togglingStatus: boolean;
  onDuplicate: () => void;
  onRename: () => void;
  onMove: () => void;
  onToggleStatus: () => void;
  onDelete: () => void;
}) {
  // "Ativar" só faz sentido pra workflows pausados; rascunho/arquivado ficam de fora.
  const canPause = status === "active";
  const canActivate = status === "paused";
  const showToggle = canPause || canActivate;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label="Ações" className="bg-background/80">
          <MoreHorizontal className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        {showToggle && (
          <DropdownMenuItem onSelect={onToggleStatus} disabled={togglingStatus}>
            {togglingStatus ? (
              <Loader2 className="size-4 animate-spin" />
            ) : canPause ? (
              <Pause className="size-4" />
            ) : (
              <Play className="size-4" />
            )}
            {canPause ? "Pausar" : "Ativar"}
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onSelect={onDuplicate} disabled={duplicating}>
          {duplicating ? <Loader2 className="size-4 animate-spin" /> : <Copy className="size-4" />}
          Duplicar
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onRename}>Renomear</DropdownMenuItem>
        <DropdownMenuItem onSelect={onMove}>Mover para…</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={onDelete}
          className="text-destructive focus:text-destructive"
        >
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
  const actions = useFolderActions(folder);
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
        <FolderActionsMenu onDelete={() => actions.setDeleteOpen(true)} />
      </div>
      <FolderDeleteDialog folder={folder} actions={actions} />
    </div>
  );
}

function useFolderActions(folder: Folder) {
  const queryClient = useQueryClient();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const deleteMutation = useMutation({
    mutationFn: () => foldersApi.remove(folder.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.folders.all });
      // Workflows que estavam dentro podem ter perdido o folderId — revalida
      // a lista pra refletir o estado real (backend decide remoção ou orfã).
      queryClient.invalidateQueries({ queryKey: queryKeys.workflows.all });
      setDeleteOpen(false);
    },
  });
  return { deleteOpen, setDeleteOpen, deleteMutation };
}

function FolderDeleteDialog({
  folder,
  actions,
}: {
  folder: Folder;
  actions: ReturnType<typeof useFolderActions>;
}) {
  return (
    <ConfirmDialog
      open={actions.deleteOpen}
      onOpenChange={actions.setDeleteOpen}
      title="Excluir pasta?"
      description={
        <>
          <strong>{folder.name}</strong> será removida. Workflows dentro dela podem ser afetados
          (verifique antes).
        </>
      }
      confirmLabel="Excluir"
      destructive
      loading={actions.deleteMutation.isPending}
      onConfirm={() => actions.deleteMutation.mutate()}
    />
  );
}

/**
 * Mutations e estado de dialogs por workflow — compartilhado entre o card
 * e a linha da tabela. Mantém a UI fina: cada consumidor renderiza só os
 * triggers, esse hook cuida de duplicar/togglar status/excluir + dialogs
 * de renomear, mover e confirmar exclusão.
 */
function useWorkflowActions(workflow: WorkflowSummary) {
  const queryClient = useQueryClient();
  const [renameOpen, setRenameOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

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

  // Toggle de status: active ↔ paused. Outros estados (draft/archived) não
  // expõem o item no menu, então aqui assumimos a transição binária.
  const toggleStatusMutation = useMutation({
    mutationFn: () => {
      const next: WorkflowStatus = workflow.status === "active" ? "paused" : "active";
      return workflowsApi.update(workflow.id, { status: next });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.workflows.all });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => workflowsApi.remove(workflow.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.workflows.all });
      setDeleteOpen(false);
    },
  });

  return {
    renameOpen,
    setRenameOpen,
    moveOpen,
    setMoveOpen,
    deleteOpen,
    setDeleteOpen,
    duplicateMutation,
    toggleStatusMutation,
    deleteMutation,
  };
}

function WorkflowCard({ workflow, onOpen }: { workflow: WorkflowSummary; onOpen: () => void }) {
  const meta = statusMeta[workflow.status];
  const actions = useWorkflowActions(workflow);
  const {
    renameOpen,
    setRenameOpen,
    moveOpen,
    setMoveOpen,
    deleteOpen,
    setDeleteOpen,
    duplicateMutation,
    toggleStatusMutation,
    deleteMutation,
  } = actions;

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
          togglingStatus={toggleStatusMutation.isPending}
          onDuplicate={() => duplicateMutation.mutate()}
          onRename={() => setRenameOpen(true)}
          onMove={() => setMoveOpen(true)}
          onToggleStatus={() => toggleStatusMutation.mutate()}
          onDelete={() => setDeleteOpen(true)}
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
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Excluir workflow?"
        description={
          <>
            <strong>{workflow.name}</strong> será removido permanentemente. Esta ação não pode
            ser desfeita.
          </>
        }
        confirmLabel="Excluir"
        destructive
        loading={deleteMutation.isPending}
        onConfirm={() => deleteMutation.mutate()}
      />
    </Card>
  );
}

function FolderActionsMenu({ onDelete }: { onDelete: () => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label="Ações" className="bg-background/80">
          <MoreHorizontal className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        {/* Renomear/Mover ainda não implementados — endpoints do back precisam, deixo TODO. */}
        <DropdownMenuItem disabled>Renomear</DropdownMenuItem>
        <DropdownMenuItem disabled>Mover para…</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={onDelete}
          className="text-destructive focus:text-destructive"
        >
          Excluir
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/* -------------------------------------------------------------------------- */
/* View toggle + tabela                                                        */
/* -------------------------------------------------------------------------- */

function ViewToggle({
  value,
  onChange,
}: {
  value: ViewMode;
  onChange: (v: ViewMode) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Modo de visualização"
      className="inline-flex items-center rounded-md border bg-background p-0.5"
    >
      <button
        type="button"
        aria-pressed={value === "grid"}
        aria-label="Cards"
        title="Cards"
        onClick={() => onChange("grid")}
        className={cn(
          "inline-flex size-7 cursor-pointer items-center justify-center rounded-sm transition-colors",
          value === "grid"
            ? "bg-muted text-foreground"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        <LayoutGrid className="size-4" />
      </button>
      <button
        type="button"
        aria-pressed={value === "table"}
        aria-label="Tabela"
        title="Tabela"
        onClick={() => onChange("table")}
        className={cn(
          "inline-flex size-7 cursor-pointer items-center justify-center rounded-sm transition-colors",
          value === "table"
            ? "bg-muted text-foreground"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        <List className="size-4" />
      </button>
    </div>
  );
}

/**
 * Tabela única para a visão "table" — pastas primeiro (clique entra) e
 * workflows depois (clique abre o studio). Mantém o mesmo conjunto de ações
 * dos cards, exposto via `WorkflowActionsMenu` por linha.
 */
function WorkflowsTable({
  folders,
  workflows,
  onEnterFolder,
  onOpenWorkflow,
}: {
  folders: Folder[];
  workflows: WorkflowSummary[];
  onEnterFolder: (id: string) => void;
  onOpenWorkflow: (id: string) => void;
}) {
  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nome</TableHead>
            <TableHead className="w-28">Tipo</TableHead>
            <TableHead className="w-32">Status</TableHead>
            <TableHead className="w-40">Atualizado</TableHead>
            <TableHead className="w-12" aria-label="Ações" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {folders.map((f) => (
            <FolderTableRow key={`folder-${f.id}`} folder={f} onOpen={() => onEnterFolder(f.id)} />
          ))}
          {workflows.map((w) => (
            <WorkflowTableRow key={w.id} workflow={w} onOpen={() => onOpenWorkflow(w.id)} />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function FolderTableRow({ folder, onOpen }: { folder: Folder; onOpen: () => void }) {
  const actions = useFolderActions(folder);
  return (
    <>
      <TableRow onClick={onOpen} className="cursor-pointer">
        <TableCell className="font-medium">
          <span className="inline-flex items-center gap-2">
            <FolderIcon className="w-5 text-primary" />
            {folder.name}
          </span>
        </TableCell>
        <TableCell className="text-muted-foreground">Pasta</TableCell>
        <TableCell className="text-muted-foreground">—</TableCell>
        <TableCell className="text-muted-foreground">
          {formatRelative(folder.updatedAt)}
        </TableCell>
        <TableCell onClick={(e) => e.stopPropagation()}>
          <FolderActionsMenu onDelete={() => actions.setDeleteOpen(true)} />
        </TableCell>
      </TableRow>
      <FolderDeleteDialog folder={folder} actions={actions} />
    </>
  );
}

function WorkflowTableRow({
  workflow,
  onOpen,
}: {
  workflow: WorkflowSummary;
  onOpen: () => void;
}) {
  const meta = statusMeta[workflow.status];
  const {
    renameOpen,
    setRenameOpen,
    moveOpen,
    setMoveOpen,
    deleteOpen,
    setDeleteOpen,
    duplicateMutation,
    toggleStatusMutation,
    deleteMutation,
  } = useWorkflowActions(workflow);

  return (
    <>
      <TableRow onClick={onOpen} className="cursor-pointer">
        <TableCell className="font-medium">
          <span className="inline-flex items-center gap-2">
            <span aria-hidden="true" className={cn("size-2 shrink-0 rounded-full", meta.dot)} />
            {workflow.name}
          </span>
        </TableCell>
        <TableCell className="text-muted-foreground">Workflow</TableCell>
        <TableCell>
          <Badge variant={meta.badge}>{meta.label}</Badge>
        </TableCell>
        <TableCell className="text-muted-foreground">
          {formatRelative(workflow.updatedAt)}
        </TableCell>
        <TableCell onClick={(e) => e.stopPropagation()}>
          <WorkflowActionsMenu
            status={workflow.status}
            duplicating={duplicateMutation.isPending}
            togglingStatus={toggleStatusMutation.isPending}
            onDuplicate={() => duplicateMutation.mutate()}
            onRename={() => setRenameOpen(true)}
            onMove={() => setMoveOpen(true)}
            onToggleStatus={() => toggleStatusMutation.mutate()}
            onDelete={() => setDeleteOpen(true)}
          />
        </TableCell>
      </TableRow>

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
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Excluir workflow?"
        description={
          <>
            <strong>{workflow.name}</strong> será removido permanentemente. Esta ação não pode
            ser desfeita.
          </>
        }
        confirmLabel="Excluir"
        destructive
        loading={deleteMutation.isPending}
        onConfirm={() => deleteMutation.mutate()}
      />
    </>
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
