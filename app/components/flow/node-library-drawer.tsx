import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ChevronLeft,
  ChevronRight,
  Database,
  DatabaseZap,
  GitBranch,
  Search,
  Sparkles,
  StickyNote,
  Workflow as WorkflowIcon,
  Zap,
  type LucideIcon,
} from "lucide-react";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "~/components/ui/sheet";
import { Input } from "~/components/ui/input";
import { cn } from "~/lib/utils";

import {
  NODE_CATEGORIES,
  NODE_LIBRARY,
  type NodeCategory,
  type NodeLibraryEntry,
} from "./node-library";

type NodeLibraryDrawerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (entry: NodeLibraryEntry) => void;
};

type CategoryMeta = {
  icon: LucideIcon;
  color: string;
  description: string;
};

const CATEGORY_META: Record<NodeCategory, CategoryMeta> = {
  Gatilhos: {
    icon: Zap,
    color: "text-emerald-500",
    description: "Eventos que iniciam o workflow",
  },
  Ações: {
    icon: WorkflowIcon,
    color: "text-sky-500",
    description: "Tarefas executadas pelo fluxo",
  },
  "Banco de Dados": {
    icon: DatabaseZap,
    color: "text-cyan-500",
    description: "Conectores Postgres, Redis e afins",
  },
  Lógica: {
    icon: GitBranch,
    color: "text-amber-500",
    description: "Ramificações, loops e controle",
  },
  Dados: {
    icon: Database,
    color: "text-violet-500",
    description: "Manipulação e transformação",
  },
  IA: {
    icon: Sparkles,
    color: "text-fuchsia-500",
    description: "Chat, embeddings, vetor e memória",
  },
  Anotações: {
    icon: StickyNote,
    color: "text-yellow-500",
    description: "Stickies e comentários no canvas",
  },
};

export function NodeLibraryDrawer({ open, onOpenChange, onSelect }: NodeLibraryDrawerProps) {
  const [query, setQuery] = useState("");
  const [activeFolder, setActiveFolder] = useState<NodeCategory | null>(null);

  // Reseta navegação e busca sempre que reabre o drawer.
  useEffect(() => {
    if (!open) return;
    setQuery("");
    setActiveFolder(null);
  }, [open]);

  const searching = query.trim().length > 0;

  const searchResults = useMemo(() => {
    if (!searching) return [];
    const q = query.trim().toLowerCase();
    return NODE_LIBRARY.filter(
      (n) =>
        n.label.toLowerCase().includes(q) ||
        n.description.toLowerCase().includes(q) ||
        n.category.toLowerCase().includes(q),
    );
  }, [searching, query]);

  const folderEntries = useMemo(
    () => (activeFolder ? NODE_LIBRARY.filter((n) => n.category === activeFolder) : []),
    [activeFolder],
  );

  const categoryCounts = useMemo(() => {
    const map = {} as Record<NodeCategory, number>;
    for (const c of NODE_CATEGORIES) map[c] = 0;
    for (const n of NODE_LIBRARY) map[n.category] += 1;
    return map;
  }, []);

  const handleSelect = (entry: NodeLibraryEntry) => {
    onSelect(entry);
    onOpenChange(false);
  };

  // Modo: busca > pasta aberta > raiz com pastas
  const view: "search" | "folder" | "root" = searching
    ? "search"
    : activeFolder
      ? "folder"
      : "root";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md">
        <SheetHeader className="border-b border-border">
          <div className="flex items-center gap-2">
            {view === "folder" && (
              <motion.button
                type="button"
                onClick={() => setActiveFolder(null)}
                whileHover={{ x: -2 }}
                whileTap={{ scale: 0.94 }}
                className="grid size-7 cursor-pointer place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label="Voltar"
              >
                <ChevronLeft className="size-4" />
              </motion.button>
            )}
            <div className="flex-1">
              <SheetTitle>{view === "folder" ? activeFolder : "Biblioteca de nós"}</SheetTitle>
              <SheetDescription>
                {view === "folder"
                  ? CATEGORY_META[activeFolder!].description
                  : "Adicione um novo passo ao seu workflow."}
              </SheetDescription>
            </div>
          </div>

          <div className="relative mt-3">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={view === "folder" ? `Buscar em ${activeFolder}...` : "Buscar nó..."}
              className="pl-8"
            />
          </div>
        </SheetHeader>

        <div className="relative flex-1 overflow-y-auto px-4 pb-6">
          <AnimatePresence mode="wait">
            {view === "root" && (
              <motion.div
                key="root"
                initial={{ opacity: 0, x: -16 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -16 }}
                transition={{ type: "spring", stiffness: 380, damping: 30 }}
                className="grid grid-cols-1 gap-1.5 pt-1"
              >
                {NODE_CATEGORIES.map((category) => (
                  <FolderCard
                    key={category}
                    category={category}
                    count={categoryCounts[category]}
                    onClick={() => setActiveFolder(category)}
                  />
                ))}
              </motion.div>
            )}

            {view === "folder" && (
              <motion.div
                key={`folder-${activeFolder}`}
                initial={{ opacity: 0, x: 24 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 24 }}
                transition={{ type: "spring", stiffness: 380, damping: 30 }}
                className="grid grid-cols-1 gap-1.5 pt-1"
              >
                {folderEntries.map((entry) => (
                  <NodeCard key={entry.id} entry={entry} onClick={() => handleSelect(entry)} />
                ))}
              </motion.div>
            )}

            {view === "search" && (
              <motion.div
                key="search"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.15 }}
                className="pt-1"
              >
                {searchResults.length === 0 ? (
                  <p className="px-2 py-8 text-center text-sm text-muted-foreground">
                    Nenhum nó encontrado.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 gap-1.5">
                    {searchResults.map((entry) => (
                      <NodeCard
                        key={entry.id}
                        entry={entry}
                        onClick={() => handleSelect(entry)}
                        showCategory
                      />
                    ))}
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function FolderCard({
  category,
  count,
  onClick,
}: {
  category: NodeCategory;
  count: number;
  onClick: () => void;
}) {
  const meta = CATEGORY_META[category];
  const Icon = meta.icon;
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileHover={{ scale: 1.01 }}
      whileTap={{ scale: 0.99 }}
      transition={{ type: "spring", stiffness: 500, damping: 28 }}
      className="group flex w-full cursor-pointer items-center gap-3 rounded-lg border border-border bg-card p-3 text-left transition-colors hover:border-foreground/20 hover:bg-muted/50"
    >
      <div className="grid size-10 shrink-0 place-items-center rounded-md bg-muted">
        <Icon className={cn("size-5", meta.color)} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-medium text-foreground">{category}</p>
          <span className="rounded-full bg-muted px-1.5 text-[10px] font-medium tabular-nums text-muted-foreground">
            {count}
          </span>
        </div>
        <p className="line-clamp-1 text-xs text-muted-foreground">{meta.description}</p>
      </div>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
    </motion.button>
  );
}

function NodeCard({
  entry,
  onClick,
  showCategory = false,
}: {
  entry: NodeLibraryEntry;
  onClick: () => void;
  showCategory?: boolean;
}) {
  const Icon = entry.icon;
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileHover={{ scale: 1.01 }}
      whileTap={{ scale: 0.99 }}
      transition={{ type: "spring", stiffness: 500, damping: 28 }}
      className="group flex w-full cursor-pointer items-start gap-3 rounded-lg border border-border bg-card p-3 text-left transition-colors hover:border-foreground/20 hover:bg-muted/50"
    >
      <div className="grid size-9 shrink-0 place-items-center rounded-md bg-muted">
        <Icon className={cn("size-4", entry.color)} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-medium text-foreground">{entry.label}</p>
          {showCategory && (
            <span className="rounded-full bg-muted px-1.5 text-[10px] font-medium text-muted-foreground">
              {entry.category}
            </span>
          )}
        </div>
        <p className="line-clamp-2 text-xs text-muted-foreground">{entry.description}</p>
      </div>
    </motion.button>
  );
}
