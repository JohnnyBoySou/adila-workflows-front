import { useViewport, Panel } from "@xyflow/react";

export type SnapGuide = { type: "h" | "v"; position: number };

type Props = {
  guides: SnapGuide[];
};

export function SnapGuidesOverlay({ guides }: Props) {
  const { x: viewportX, y: viewportY, zoom } = useViewport();

  if (guides.length === 0) return null;

  return (
    <Panel
      position="top-left"
      style={{
        pointerEvents: "none",
        margin: 0,
        padding: 0,
        width: "100%",
        height: "100%",
        position: "absolute",
        inset: 0,
        overflow: "hidden",
      }}
    >
      {guides.map((guide, i) => {
        if (guide.type === "h") {
          const screenY = guide.position * zoom + viewportY;
          return (
            <div
              key={i}
              style={{
                position: "absolute",
                top: screenY,
                left: 0,
                width: "100%",
                height: 1,
                background: "#3b82f6",
                opacity: 0.8,
                pointerEvents: "none",
              }}
            />
          );
        } else {
          const screenX = guide.position * zoom + viewportX;
          return (
            <div
              key={i}
              style={{
                position: "absolute",
                left: screenX,
                top: 0,
                width: 1,
                height: "100%",
                background: "#3b82f6",
                opacity: 0.8,
                pointerEvents: "none",
              }}
            />
          );
        }
      })}
    </Panel>
  );
}
