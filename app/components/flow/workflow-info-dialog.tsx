import { useEffect, useState } from "react";
import { BackgroundVariant, ConnectionLineType } from "@xyflow/react";
import { Check, FileText, Spline } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Textarea } from "~/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { Sections, type SectionItem } from "~/components/ui/sections";
import { cn } from "~/lib/utils";
import { DEFAULT_EDGE_STYLE, useFlowStore, type EdgeStyle } from "~/stores/flow";

export type WorkflowInfo = {
  name: string;
  description: string;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  info: WorkflowInfo;
  onSave: (info: WorkflowInfo) => void;
};

const EDGE_TYPE_OPTIONS: { value: ConnectionLineType; label: string }[] = [
  { value: ConnectionLineType.Bezier, label: "Bezier (curva suave)" },
  { value: ConnectionLineType.SimpleBezier, label: "Bezier simples" },
  { value: ConnectionLineType.SmoothStep, label: "Degrau arredondado" },
  { value: ConnectionLineType.Step, label: "Degrau reto" },
  { value: ConnectionLineType.Straight, label: "Reta" },
];

const BACKGROUND_OPTIONS: { value: BackgroundVariant; label: string }[] = [
  { value: BackgroundVariant.Dots, label: "Pontos" },
  { value: BackgroundVariant.Lines, label: "Linhas" },
  { value: BackgroundVariant.Cross, label: "Cruzes" },
];

const SECTIONS = [
  { id: "general", label: "Geral", icon: FileText },
  { id: "canvas", label: "Canvas", icon: Spline },
] as const satisfies ReadonlyArray<SectionItem>;

type SectionId = (typeof SECTIONS)[number]["id"];

const COLOR_SWATCHES = [
  "#94a3b8",
  "#0ea5e9",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#ec4899",
  "#64748b",
];

/**
 * Dialog para visualizar e editar metadados do workflow e preferências
 * visuais do canvas. Aba "Geral" trata nome/descrição (persistidos no
 * workflow); aba "Canvas" controla as configs do React Flow (estilo de
 * edge, cor, animação, tracejado, espessura, background, minimap), que
 * vivem no `useFlowStore` e são persistidas em localStorage.
 *
 * Edições de "Geral" só são comprometidas no Salvar — fechar descarta.
 * Edições de "Canvas" aplicam ao vivo (refletem direto no store) — é
 * uma preferência de UI, não dado do workflow.
 */
export function WorkflowInfoDialog({ open, onOpenChange, info, onSave }: Props) {
  const [name, setName] = useState(info.name);
  const [description, setDescription] = useState(info.description);

  const [section, setSection] = useState<SectionId>("general");

  const edgeStyle = useFlowStore((s) => s.edgeStyle);
  const setEdgeStyle = useFlowStore((s) => s.setEdgeStyle);
  const resetEdgeStyle = useFlowStore((s) => s.resetEdgeStyle);
  const backgroundVariant = useFlowStore((s) => s.backgroundVariant);
  const setBackgroundVariant = useFlowStore((s) => s.setBackgroundVariant);
  const miniMapVisible = useFlowStore((s) => s.miniMapVisible);
  const toggleMiniMap = useFlowStore((s) => s.toggleMiniMap);

  useEffect(() => {
    if (open) {
      setName(info.name);
      setDescription(info.description);
    }
  }, [open, info]);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    onSave({ name: name.trim() || "Workflow sem título", description: description.trim() });
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!max-w-5xl w-[min(96vw,1100px)] p-0 sm:!max-w-5xl">
        <div className="flex h-[min(80vh,720px)] flex-col">
          <DialogHeader className="border-b border-border px-6 py-4">
            <DialogTitle>Informações do workflow</DialogTitle>
            <DialogDescription>
              Edite metadados e configurações visuais do editor.
            </DialogDescription>
          </DialogHeader>

          <Sections
            sections={SECTIONS}
            value={section}
            onValueChange={setSection}
            ariaLabel="Seções do workflow"
            className="min-h-0 flex-1"
            navClassName="w-52 p-3"
            contentClassName="p-6"
          >
            {section === "general" && (
                <form id="workflow-info-form" className="max-w-xl space-y-4" onSubmit={handleSubmit}>
                  <div className="space-y-2">
                    <Label htmlFor="wf-name">Nome</Label>
                    <Input
                      id="wf-name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Onboarding de lead"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="wf-description">Descrição</Label>
                    <Textarea
                      id="wf-description"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="O que esse workflow faz?"
                      rows={6}
                    />
                  </div>
                </form>
              )}

              {section === "canvas" && (
                <div className="max-w-2xl space-y-5">
              <Row label="Estilo de linha">
                <Select
                  value={edgeStyle.type}
                  onValueChange={(v) => setEdgeStyle({ type: v as EdgeStyle["type"] })}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {EDGE_TYPE_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Row>

              <Row label="Cor das linhas">
                <div className="flex items-center gap-2">
                  <div className="flex flex-wrap gap-1.5">
                    {COLOR_SWATCHES.map((c) => {
                      const active = c.toLowerCase() === edgeStyle.color.toLowerCase();
                      return (
                        <button
                          key={c}
                          type="button"
                          onClick={() => setEdgeStyle({ color: c })}
                          aria-label={`Cor ${c}`}
                          className={cn(
                            "relative size-6 cursor-pointer rounded-full border border-border transition-transform hover:scale-110",
                            active && "ring-2 ring-ring ring-offset-2 ring-offset-background",
                          )}
                          style={{ backgroundColor: c }}
                        >
                          {active && (
                            <Check
                              className="absolute inset-0 m-auto size-3.5 text-white mix-blend-difference"
                              aria-hidden
                            />
                          )}
                        </button>
                      );
                    })}
                  </div>
                  <input
                    type="color"
                    value={edgeStyle.color}
                    onChange={(e) => setEdgeStyle({ color: e.target.value })}
                    aria-label="Seletor de cor custom"
                    className="size-7 cursor-pointer rounded border border-border bg-transparent"
                  />
                </div>
              </Row>

              <Row label="Espessura">
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min={1}
                    max={5}
                    step={0.5}
                    value={edgeStyle.thickness}
                    onChange={(e) => setEdgeStyle({ thickness: Number(e.target.value) })}
                    className="flex-1 accent-foreground"
                  />
                  <span className="w-12 text-right text-xs tabular-nums text-muted-foreground">
                    {edgeStyle.thickness.toFixed(1)}px
                  </span>
                </div>
              </Row>

              <Row label="Comportamento">
                <div className="flex flex-wrap gap-2">
                  <ToggleChip
                    active={edgeStyle.animated}
                    onClick={() => setEdgeStyle({ animated: !edgeStyle.animated })}
                  >
                    Animada
                  </ToggleChip>
                  <ToggleChip
                    active={edgeStyle.dashed}
                    onClick={() => setEdgeStyle({ dashed: !edgeStyle.dashed })}
                  >
                    Tracejada
                  </ToggleChip>
                  <ToggleChip
                    active={edgeStyle.arrow}
                    onClick={() => setEdgeStyle({ arrow: !edgeStyle.arrow })}
                  >
                    Seta
                  </ToggleChip>
                </div>
              </Row>

              <Row label="Preview">
                <EdgePreview style={edgeStyle} />
              </Row>

              <div className="my-2 h-px bg-border" />

              <Row label="Background">
                <Select
                  value={backgroundVariant}
                  onValueChange={(v) => setBackgroundVariant(v as BackgroundVariant)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {BACKGROUND_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Row>

              <Row label="Minimap">
                <ToggleChip active={miniMapVisible} onClick={toggleMiniMap}>
                  {miniMapVisible ? "Visível" : "Oculto"}
                </ToggleChip>
              </Row>

                  <div className="flex justify-end">
                    <Button type="button" variant="ghost" size="sm" onClick={resetEdgeStyle}>
                      Restaurar padrão das linhas
                    </Button>
                  </div>
                </div>
              )}
          </Sections>

          <DialogFooter className="border-t border-border px-6 py-4">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" form="workflow-info-form">
              Salvar
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[8rem_1fr] items-center gap-3">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div>{children}</div>
    </div>
  );
}

function ToggleChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex h-7 cursor-pointer items-center rounded-full border px-3 text-xs transition-colors",
        active
          ? "border-foreground bg-foreground text-background"
          : "border-border bg-transparent text-muted-foreground hover:bg-muted",
      )}
    >
      {children}
    </button>
  );
}

function EdgePreview({ style }: { style: EdgeStyle }) {
  const dashArray = style.dashed ? "6 4" : undefined;
  const markerId = "edge-preview-arrow";
  return (
    <svg
      viewBox="0 0 200 40"
      className="h-10 w-full rounded-md border border-border bg-muted/30"
      aria-hidden
    >
      {style.arrow && (
        <defs>
          <marker
            id={markerId}
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M0 0 L10 5 L0 10 z" fill={style.color} />
          </marker>
        </defs>
      )}
      <path
        d={pathForType(style.type)}
        fill="none"
        stroke={style.color}
        strokeWidth={style.thickness}
        strokeDasharray={dashArray}
        {...(style.arrow ? { markerEnd: `url(#${markerId})` } : {})}
      >
        {style.animated && (
          <animate
            attributeName="stroke-dashoffset"
            from="0"
            to={style.dashed ? "-20" : "-12"}
            dur="0.6s"
            repeatCount="indefinite"
          />
        )}
      </path>
    </svg>
  );
}

function pathForType(type: ConnectionLineType): string {
  switch (type) {
    case ConnectionLineType.Straight:
      return "M 10 20 L 190 20";
    case ConnectionLineType.Step:
      return "M 10 20 L 100 20 L 100 20 L 190 20";
    case ConnectionLineType.SmoothStep:
      return "M 10 20 L 90 20 Q 100 20 100 20 L 190 20";
    case ConnectionLineType.SimpleBezier:
      return "M 10 20 C 60 20, 140 20, 190 20";
    case ConnectionLineType.Bezier:
    default:
      return "M 10 20 C 70 0, 130 40, 190 20";
  }
}

// Re-export pra manter compat — não usado dentro deste arquivo.
export { DEFAULT_EDGE_STYLE };
