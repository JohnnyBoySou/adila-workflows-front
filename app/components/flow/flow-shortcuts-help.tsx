import { useState } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { cn } from "~/lib/utils";

type ShortcutRow = {
  keys: string[];
  description: string;
};

type ShortcutGroup = {
  title: string;
  rows: ShortcutRow[];
};

const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    title: "Ferramentas",
    rows: [
      { keys: ["V"], description: "Selecionar" },
      { keys: ["H"], description: "Pan" },
    ],
  },
  {
    title: "Criar",
    rows: [
      { keys: ["N"], description: "Biblioteca" },
      { keys: ["S"], description: "Nota" },
      { keys: ["F"], description: "Grupo" },
    ],
  },
  {
    title: "Editar",
    rows: [
      { keys: ["Ctrl", "Z"], description: "Desfazer" },
      { keys: ["Ctrl", "Y"], description: "Refazer" },
      { keys: ["Ctrl", "D"], description: "Duplicar" },
      { keys: ["Del"], description: "Deletar" },
    ],
  },
  {
    title: "Histórico",
    rows: [
      { keys: ["Ctrl", "C"], description: "Copiar" },
      { keys: ["Ctrl", "X"], description: "Recortar" },
      { keys: ["Ctrl", "V"], description: "Colar" },
      { keys: ["Ctrl", "A"], description: "Sel. todos" },
    ],
  },
  {
    title: "Visualização",
    rows: [
      { keys: ["Shift", "1"], description: "Encaixar" },
      { keys: ["Shift", "2"], description: "Seleção" },
      { keys: ["Shift", "0"], description: "100%" },
      { keys: ["M"], description: "Minimap" },
      { keys: ["L"], description: "Travar" },
      { keys: ["Shift", "A"], description: "Organizar" },
    ],
  },
  {
    title: "Zoom",
    rows: [
      { keys: ["Ctrl", "+"], description: "Zoom in" },
      { keys: ["Ctrl", "-"], description: "Zoom out" },
    ],
  },
  {
    title: "Mover (seleção)",
    rows: [
      { keys: ["↑", "↓", "←", "→"], description: "1px" },
      { keys: ["Shift", "↑↓←→"], description: "10px" },
    ],
  },
];

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="font-mono text-xs bg-muted rounded px-1.5 py-0.5 border border-border">
      {children}
    </kbd>
  );
}

function ShortcutGroupCard({ group }: { group: ShortcutGroup }) {
  return (
    <div className="flex flex-col gap-1.5">
      <p className="font-semibold text-xs text-foreground mb-0.5">{group.title}</p>
      {group.rows.map((row, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <div className="flex items-center gap-0.5 flex-wrap min-w-0">
            {row.keys.map((k, ki) => (
              <Kbd key={ki}>{k}</Kbd>
            ))}
          </div>
          <span className="text-xs text-muted-foreground ml-1">{row.description}</span>
        </div>
      ))}
    </div>
  );
}

export function FlowShortcutsHelp() {
  const [open, setOpen] = useState(false);

  useHotkeys(
    "?",
    () => setOpen((prev) => !prev),
    { preventDefault: true },
  );

  const half = Math.ceil(SHORTCUT_GROUPS.length / 2);
  const leftGroups = SHORTCUT_GROUPS.slice(0, half);
  const rightGroups = SHORTCUT_GROUPS.slice(half);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className={cn("sm:max-w-2xl max-h-[80vh] overflow-hidden flex flex-col")}>
        <DialogHeader>
          <DialogTitle>Atalhos de teclado</DialogTitle>
        </DialogHeader>
        <div className="overflow-y-auto flex-1 pr-1">
          <div className="grid grid-cols-2 gap-x-8 gap-y-6">
            <div className="flex flex-col gap-6">
              {leftGroups.map((g) => (
                <ShortcutGroupCard key={g.title} group={g} />
              ))}
            </div>
            <div className="flex flex-col gap-6">
              {rightGroups.map((g) => (
                <ShortcutGroupCard key={g.title} group={g} />
              ))}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
