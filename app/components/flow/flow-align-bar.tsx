import { useReactFlow, Panel, type Node } from "@xyflow/react";
import {
  AlignStartVertical,
  AlignCenterVertical,
  AlignEndVertical,
  AlignStartHorizontal,
  AlignCenterHorizontal,
  AlignEndHorizontal,
  AlignHorizontalDistributeCenter,
  AlignVerticalDistributeCenter,
} from "lucide-react";
import { Button } from "~/components/ui/button";

function getW(node: Node): number {
  const m = node.measured as { width?: number; height?: number } | undefined;
  return m?.width ?? (node as { width?: number }).width ?? 150;
}

function getH(node: Node): number {
  const m = node.measured as { width?: number; height?: number } | undefined;
  return m?.height ?? (node as { height?: number }).height ?? 40;
}

export function FlowAlignBar() {
  const { getNodes, setNodes } = useReactFlow();

  const selected = getNodes().filter((n) => n.selected);
  if (selected.length < 2) return null;

  const alignLeft = () => {
    const minX = Math.min(...selected.map((n) => n.position.x));
    const ids = new Set(selected.map((n) => n.id));
    setNodes((prev) =>
      prev.map((n) => (ids.has(n.id) ? { ...n, position: { ...n.position, x: minX } } : n)),
    );
  };

  const alignRight = () => {
    const maxRight = Math.max(...selected.map((n) => n.position.x + getW(n)));
    const ids = new Set(selected.map((n) => n.id));
    setNodes((prev) =>
      prev.map((n) =>
        ids.has(n.id) ? { ...n, position: { ...n.position, x: maxRight - getW(n) } } : n,
      ),
    );
  };

  const alignCenterH = () => {
    const minX = Math.min(...selected.map((n) => n.position.x));
    const maxRight = Math.max(...selected.map((n) => n.position.x + getW(n)));
    const centerX = (minX + maxRight) / 2;
    const ids = new Set(selected.map((n) => n.id));
    setNodes((prev) =>
      prev.map((n) =>
        ids.has(n.id) ? { ...n, position: { ...n.position, x: centerX - getW(n) / 2 } } : n,
      ),
    );
  };

  const alignTop = () => {
    const minY = Math.min(...selected.map((n) => n.position.y));
    const ids = new Set(selected.map((n) => n.id));
    setNodes((prev) =>
      prev.map((n) => (ids.has(n.id) ? { ...n, position: { ...n.position, y: minY } } : n)),
    );
  };

  const alignBottom = () => {
    const maxBottom = Math.max(...selected.map((n) => n.position.y + getH(n)));
    const ids = new Set(selected.map((n) => n.id));
    setNodes((prev) =>
      prev.map((n) =>
        ids.has(n.id) ? { ...n, position: { ...n.position, y: maxBottom - getH(n) } } : n,
      ),
    );
  };

  const alignCenterV = () => {
    const minY = Math.min(...selected.map((n) => n.position.y));
    const maxBottom = Math.max(...selected.map((n) => n.position.y + getH(n)));
    const centerY = (minY + maxBottom) / 2;
    const ids = new Set(selected.map((n) => n.id));
    setNodes((prev) =>
      prev.map((n) =>
        ids.has(n.id) ? { ...n, position: { ...n.position, y: centerY - getH(n) / 2 } } : n,
      ),
    );
  };

  const distributeH = () => {
    if (selected.length < 3) return;
    const sorted = [...selected].sort((a, b) => a.position.x - b.position.x);
    const totalWidth = sorted.reduce((sum, n) => sum + getW(n), 0);
    const span = sorted[sorted.length - 1].position.x + getW(sorted[sorted.length - 1]) - sorted[0].position.x;
    const gap = (span - totalWidth) / (sorted.length - 1);
    let cursor = sorted[0].position.x;
    const positions = new Map<string, number>();
    for (const n of sorted) {
      positions.set(n.id, cursor);
      cursor += getW(n) + gap;
    }
    const ids = new Set(selected.map((n) => n.id));
    setNodes((prev) =>
      prev.map((n) => {
        if (!ids.has(n.id)) return n;
        const x = positions.get(n.id);
        return x !== undefined ? { ...n, position: { ...n.position, x } } : n;
      }),
    );
  };

  const distributeV = () => {
    if (selected.length < 3) return;
    const sorted = [...selected].sort((a, b) => a.position.y - b.position.y);
    const totalHeight = sorted.reduce((sum, n) => sum + getH(n), 0);
    const span = sorted[sorted.length - 1].position.y + getH(sorted[sorted.length - 1]) - sorted[0].position.y;
    const gap = (span - totalHeight) / (sorted.length - 1);
    let cursor = sorted[0].position.y;
    const positions = new Map<string, number>();
    for (const n of sorted) {
      positions.set(n.id, cursor);
      cursor += getH(n) + gap;
    }
    const ids = new Set(selected.map((n) => n.id));
    setNodes((prev) =>
      prev.map((n) => {
        if (!ids.has(n.id)) return n;
        const y = positions.get(n.id);
        return y !== undefined ? { ...n, position: { ...n.position, y } } : n;
      }),
    );
  };

  return (
    <Panel position="top-center" className="!top-4 pointer-events-auto">
      <div className="bg-background border rounded-lg shadow-lg flex items-center gap-0.5 p-1 animate-in fade-in-0 zoom-in-95 duration-150">
        <Button
          variant="ghost"
          size="icon-sm"
          title="Align left"
          onClick={alignLeft}
        >
          <AlignStartVertical />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          title="Align center horizontally"
          onClick={alignCenterH}
        >
          <AlignCenterVertical />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          title="Align right"
          onClick={alignRight}
        >
          <AlignEndVertical />
        </Button>

        <div className="mx-0.5 h-5 w-px bg-border" aria-hidden />

        <Button
          variant="ghost"
          size="icon-sm"
          title="Align top"
          onClick={alignTop}
        >
          <AlignStartHorizontal />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          title="Align center vertically"
          onClick={alignCenterV}
        >
          <AlignCenterHorizontal />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          title="Align bottom"
          onClick={alignBottom}
        >
          <AlignEndHorizontal />
        </Button>

        <div className="mx-0.5 h-5 w-px bg-border" aria-hidden />

        <Button
          variant="ghost"
          size="icon-sm"
          title="Distribute horizontally"
          onClick={distributeH}
        >
          <AlignHorizontalDistributeCenter />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          title="Distribute vertically"
          onClick={distributeV}
        >
          <AlignVerticalDistributeCenter />
        </Button>
      </div>
    </Panel>
  );
}
