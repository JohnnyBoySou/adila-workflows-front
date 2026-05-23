/**
 * Painel dedicado pro nó `code` — editor Monaco com types do `ctx`
 * injetados como `.d.ts` virtual.
 *
 * Layout: editor à esquerda (~3/5), inspector do `ctx` à direita.
 *
 * O `ctx` é construído a partir dos pins atuais do workflow:
 *   - `input` → pega do pin do trigger (start / webhook_trigger) se houver.
 *   - `steps` → para cada pin de nó executado, vira `steps[id]`.
 *   - `vars` / `env` → vazio por enquanto (sem pinning explícito).
 *
 * Se não há pins, cai no `DEFAULT_SAMPLE_CONTEXT` do template.ts.
 *
 * Shape persistido em `values` (idêntico ao schema atual):
 *   code: string
 *   timeoutMs?: number
 */
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { Code2, Database, Info, Pin } from "lucide-react";

import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { cn } from "~/lib/utils";
import { useWorkflowId } from "../workflow-context";
import { usePinnedData } from "~/stores/pinned-data";

import type { CustomPanelProps } from "./types";
import { DEFAULT_SAMPLE_CONTEXT } from "./template";

// Monaco é pesado (~3MB). Carregamos lazy pra não estourar o initial bundle
// do dashboard. Quando o dialog do nó `code` abre é OK pagar o load.
const MonacoEditor = lazy(() =>
  import("@monaco-editor/react").then((mod) => ({ default: mod.default })),
);

const PLACEHOLDER = `// 'ctx' expõe { input, vars, env, steps }
// Pode usar async/await. O retorno vira o output do nó.
return {
  sum: (ctx.input.items ?? []).reduce((a, b) => a + b, 0),
};
`;

const CTX_DTS_BASE = `
/**
 * Contexto de execução exposto ao nó \`code\`.
 *
 * Use os getters direto: \`ctx.input.foo\`, \`ctx.vars.x\`, etc.
 * O retorno do handler vira o output do nó.
 */
declare const ctx: ExecutionContext;

interface ExecutionContext {
  /** Input do run (geralmente vindo do trigger). */
  input: any;
  /** Variáveis acumuladas via \`set_variable\`. */
  vars: Record<string, any>;
  /** Variáveis de ambiente do worker. */
  env: Record<string, string>;
  /** Outputs dos nós executados antes deste, indexados por nodeId. */
  steps: Record<string, any>;
}
`;

/* -------------------------------------------------------------------------- */
/* Painel                                                                      */
/* -------------------------------------------------------------------------- */

export function CodePanel({ values, onChange, onError }: CustomPanelProps) {
  const code = typeof values.code === "string" ? values.code : "";
  const timeoutMs =
    typeof values.timeoutMs === "number" ? values.timeoutMs : undefined;

  const workflowId = useWorkflowId();
  const pins = usePinnedData(workflowId ?? "");

  const sampleCtx = useMemo(() => buildSampleCtx(pins), [pins]);
  const usingPins = Object.keys(pins).length > 0;

  useEffect(() => {
    onError?.("code", code.trim() === "" ? "Escreva o corpo da função." : null);
  }, [code, onError]);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-[1fr_18rem] gap-3 min-h-[440px]">
        <EditorPane code={code} onChange={(v) => onChange({ code: v })} ctx={sampleCtx} />
        <CtxInspector ctx={sampleCtx} usingPins={usingPins} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="code-timeout" className="text-xs font-medium">
            Timeout (ms)
          </Label>
          <Input
            id="code-timeout"
            type="number"
            min={0}
            value={timeoutMs ?? ""}
            onChange={(e) =>
              onChange({
                timeoutMs: e.target.value === "" ? undefined : Number(e.target.value),
              })
            }
            placeholder="2000"
          />
          <p className="text-[11px] text-muted-foreground">
            Mata a execução do nó se passar disso. Default no engine: sem limite explícito.
          </p>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label className="text-xs font-medium">Atalhos do editor</Label>
          <div className="flex flex-wrap gap-1.5 text-[11px] text-muted-foreground">
            <Hint k="⌘/Ctrl + Space">autocomplete</Hint>
            <Hint k="⌘/Ctrl + /">comentar linha</Hint>
            <Hint k="Alt + ↑/↓">mover linha</Hint>
          </div>
        </div>
      </div>
    </div>
  );
}

function Hint({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded border border-border bg-muted/40 px-1.5 py-0.5">
      <code className="font-mono">{k}</code>
      <span>· {children}</span>
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* Editor                                                                      */
/* -------------------------------------------------------------------------- */

function EditorPane({
  code,
  onChange,
  ctx,
}: {
  code: string;
  onChange: (v: string) => void;
  ctx: Record<string, unknown>;
}) {
  const dts = useMemo(() => buildCtxDts(ctx), [ctx]);

  return (
    <div className="flex flex-col overflow-hidden rounded-lg border border-border">
      <div className="flex items-center gap-2 border-b border-border bg-muted/40 px-3 py-1.5 text-[11px] text-muted-foreground">
        <Code2 className="size-3.5" />
        <span>JavaScript</span>
        <span className="ml-auto rounded bg-muted px-1.5 py-0.5">
          ctx tipado a partir do contexto
        </span>
      </div>
      <Suspense fallback={<EditorFallback code={code} onChange={onChange} />}>
        <MonacoEditor
          height="420px"
          defaultLanguage="javascript"
          language="javascript"
          theme="vs-dark"
          value={code}
          onChange={(v) => onChange(v ?? "")}
          options={{
            minimap: { enabled: false },
            fontSize: 13,
            lineNumbers: "on",
            scrollBeyondLastLine: false,
            wordWrap: "on",
            tabSize: 2,
            insertSpaces: true,
            padding: { top: 12, bottom: 12 },
            renderLineHighlight: "line",
            scrollbar: { verticalScrollbarSize: 8, horizontalScrollbarSize: 8 },
            fixedOverflowWidgets: true,
          }}
          beforeMount={(monaco) => {
            // Não obrigatório, mas evita avisos de erros que não importam num
            // snippet (sem `module`/`export` etc).
            monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions({
              noSemanticValidation: false,
              noSyntaxValidation: false,
            });
            monaco.languages.typescript.javascriptDefaults.setCompilerOptions({
              target: monaco.languages.typescript.ScriptTarget.ESNext,
              allowNonTsExtensions: true,
              checkJs: false,
              allowJs: true,
              lib: ["esnext"],
            });
            // Substitui a lib do ctx — atualiza quando os pins mudarem.
            const URI = "ts:adila/code-node-ctx.d.ts";
            monaco.languages.typescript.javascriptDefaults.setExtraLibs([
              { content: dts, filePath: URI },
            ]);
            // O snippet roda dentro de uma função; expomos `return`-statement-friendly
            // ao desabilitar o erro "Top-level returns are not allowed".
            monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions({
              noSemanticValidation: false,
              noSyntaxValidation: false,
              diagnosticCodesToIgnore: [1108], // top-level return
            });
          }}
          defaultValue={code || PLACEHOLDER}
        />
      </Suspense>
    </div>
  );
}

function EditorFallback({
  code,
  onChange,
}: {
  code: string;
  onChange: (v: string) => void;
}) {
  // Fallback enquanto Monaco carrega. Textarea simples — não trava o usuário
  // se o lazy import falhar. Re-renderizado por Monaco assim que carrega.
  return (
    <textarea
      value={code}
      onChange={(e) => onChange(e.target.value)}
      placeholder={PLACEHOLDER}
      aria-label="Corpo da função JavaScript"
      spellCheck={false}
      className="h-[420px] w-full resize-none bg-zinc-950 p-3 font-mono text-xs text-zinc-100 outline-none"
    />
  );
}

/* -------------------------------------------------------------------------- */
/* Inspector do ctx                                                            */
/* -------------------------------------------------------------------------- */

function CtxInspector({
  ctx,
  usingPins,
}: {
  ctx: Record<string, unknown>;
  usingPins: boolean;
}) {
  return (
    <aside className="flex flex-col overflow-hidden rounded-lg border border-border">
      <div className="flex items-center gap-2 border-b border-border bg-muted/40 px-3 py-1.5 text-[11px] text-muted-foreground">
        <Database className="size-3.5" />
        <span>Contexto</span>
        <span
          className={cn(
            "ml-auto rounded px-1.5 py-0.5 text-[10px]",
            usingPins
              ? "bg-amber-500/15 text-amber-700 dark:text-amber-400"
              : "bg-muted text-muted-foreground",
          )}
          title={
            usingPins
              ? "Construído a partir dos outputs pinados do workflow."
              : "Nenhum pin — usando sample fixo. Pin os nós upstream pra preview real."
          }
        >
          {usingPins ? (
            <span className="inline-flex items-center gap-0.5">
              <Pin className="size-2.5" /> pinned
            </span>
          ) : (
            "sample"
          )}
        </span>
      </div>

      <div className="flex-1 overflow-auto p-2">
        {(Object.keys(ctx) as Array<keyof typeof ctx>).map((k) => (
          <CtxSection key={String(k)} name={String(k)} value={ctx[k]} />
        ))}
      </div>

      <div className="flex items-start gap-1.5 border-t border-border bg-muted/30 px-3 py-2 text-[10px] text-muted-foreground">
        <Info className="mt-0.5 size-3 shrink-0" />
        <span>
          Em runtime os valores vêm do run real. Aqui mostra só o shape que o autocomplete usa.
        </span>
      </div>
    </aside>
  );
}

function CtxSection({ name, value }: { name: string; value: unknown }) {
  const [open, setOpen] = useState(true);
  const summary =
    value && typeof value === "object"
      ? Array.isArray(value)
        ? `Array(${value.length})`
        : `Object (${Object.keys(value as Record<string, unknown>).length})`
      : String(value);
  return (
    <div className="mb-2 overflow-hidden rounded border border-border bg-background">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-2 py-1 text-left text-xs hover:bg-muted/50"
      >
        <span className="font-mono font-medium">ctx.{name}</span>
        <span className="font-mono text-[10px] text-muted-foreground">{summary}</span>
      </button>
      {open && (
        <pre className="max-h-48 overflow-auto border-t border-border bg-muted/20 p-2 font-mono text-[10px] leading-relaxed text-foreground">
          {safeStringify(value)}
        </pre>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Constrói o ctx-sample a partir dos pins do workflow.
 *
 * Pins são por-`nodeId`. Não temos como descobrir aqui qual nodeId é o
 * trigger sem percorrer o canvas (e sem props pra isso), então:
 *   - `steps`: TODOS os pins viram entrada de `steps`.
 *   - `input`: vazio (o usuário pode pinar o trigger pra simular).
 *
 * Sem pins, devolve `DEFAULT_SAMPLE_CONTEXT` integral pra preview ser útil
 * de cara.
 */
function buildSampleCtx(pins: Record<string, Record<string, unknown>>): Record<string, unknown> {
  if (Object.keys(pins).length === 0) {
    return DEFAULT_SAMPLE_CONTEXT;
  }
  return {
    input: {},
    vars: {},
    env: {},
    steps: { ...pins },
  };
}

/**
 * Gera o `.d.ts` que o Monaco usa pra autocomplete. Em vez de tipos vagos
 * (`any`), inferimos a shape de `steps` e `input` a partir dos valores
 * atuais — assim `ctx.steps.<id>.<field>` autocompleta de verdade.
 */
function buildCtxDts(ctx: Record<string, unknown>): string {
  const inputType = inferTsType(ctx.input);
  const varsType = inferTsType(ctx.vars);
  const stepsType = inferTsType(ctx.steps);

  return `${CTX_DTS_BASE}

// Reescrito a cada mudança nos pins:
interface ExecutionContext {
  input: ${inputType};
  vars: ${varsType};
  env: Record<string, string>;
  steps: ${stepsType};
}
`;
}

/**
 * Inferência best-effort do tipo TS a partir de um valor JSON. Não tenta
 * cobrir union types ou tuplas — só o que o Monaco precisa pra dar
 * autocomplete utilizável.
 *
 * Profundidade limitada (10) por segurança contra cíclicos.
 */
function inferTsType(value: unknown, depth = 0): string {
  if (depth > 10) return "any";
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (typeof value === "string") return "string";
  if (typeof value === "number") return "number";
  if (typeof value === "boolean") return "boolean";
  if (Array.isArray(value)) {
    if (value.length === 0) return "any[]";
    return `${inferTsType(value[0], depth + 1)}[]`;
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) return "Record<string, any>";
    const fields = entries.map(
      ([k, v]) => `  ${JSON.stringify(k)}: ${inferTsType(v, depth + 1)};`,
    );
    return `{\n${fields.join("\n")}\n}`;
  }
  return "any";
}

function safeStringify(v: unknown): string {
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}
