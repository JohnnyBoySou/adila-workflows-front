import { useReactFlow } from "@xyflow/react";
import { Lock, Unlock } from "lucide-react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuTrigger,
} from "~/components/ui/context-menu";

type Props = {
  children: React.ReactNode;
  onAddSticky: () => void;
  onAddContainer: () => void;
  onDuplicate: () => void;
  onCopy: () => void;
  onCut: () => void;
  onPaste: () => void;
  onDelete: () => void;
  onSelectAll: () => void;
  onAutoLayout: () => void;
  onToggleLock?: () => void;
};

export function FlowContextMenu({
  children,
  onAddSticky,
  onAddContainer,
  onDuplicate,
  onCopy,
  onCut,
  onPaste,
  onDelete,
  onSelectAll,
  onAutoLayout,
  onToggleLock,
}: Props) {
  const { getNodes } = useReactFlow();
  const selectedNodes = getNodes().filter((n) => n.selected);
  const hasSelection = selectedNodes.length > 0;
  const singleSelected = selectedNodes.length === 1;
  const isLocked = singleSelected && !!(selectedNodes[0]?.data as Record<string, unknown>)?.locked;

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem
          onClick={onCopy}
          disabled={!hasSelection}
        >
          Copy
          <ContextMenuShortcut>⌘C</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem
          onClick={onCut}
          disabled={!hasSelection}
        >
          Cut
          <ContextMenuShortcut>⌘X</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem onClick={onPaste}>
          Paste
          <ContextMenuShortcut>⌘V</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem
          onClick={onDuplicate}
          disabled={!hasSelection}
        >
          Duplicate
          <ContextMenuShortcut>⌘D</ContextMenuShortcut>
        </ContextMenuItem>

        <ContextMenuSeparator />

        <ContextMenuItem onClick={onSelectAll}>
          Select All
          <ContextMenuShortcut>⌘A</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem
          onClick={onDelete}
          disabled={!hasSelection}
          variant="destructive"
        >
          Delete
          <ContextMenuShortcut>Del</ContextMenuShortcut>
        </ContextMenuItem>

        <ContextMenuSeparator />

        <ContextMenuItem onClick={onAddSticky}>
          Add Sticky
          <ContextMenuShortcut>S</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem onClick={onAddContainer}>
          Add Group
          <ContextMenuShortcut>F</ContextMenuShortcut>
        </ContextMenuItem>

        <ContextMenuSeparator />

        <ContextMenuItem onClick={onAutoLayout}>
          Auto-layout
          <ContextMenuShortcut>⇧A</ContextMenuShortcut>
        </ContextMenuItem>

        {singleSelected && onToggleLock && (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem onClick={onToggleLock}>
              {isLocked ? (
                <>
                  <Unlock className="mr-2 size-3.5" />
                  Destravar nó
                </>
              ) : (
                <>
                  <Lock className="mr-2 size-3.5" />
                  Travar nó
                </>
              )}
            </ContextMenuItem>
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
}
