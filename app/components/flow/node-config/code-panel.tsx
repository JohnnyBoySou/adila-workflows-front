/**
 * Painel dedicado pro nó `code` — Monaco com types injetados + dry-run.
 *
 * Seções:
 *   Editor      — Monaco JS + inspector do ctx (input/vars/steps/env)
 *                 com `.d.ts` virtual gerado a partir dos pins atuais
 *   Snippets    — biblioteca de exemplos prontos (copia pro editor)
 *   Avançado    — timeoutMs + atalhos do editor
 *   Teste       — input/vars/steps mockados + environment → dry-run
 *                 com saída formatada (output, erro, duração)
 *   Histórico   — últimas execuções do node em runs reais
 *
 * Shape persistido:
 *   code: string
 *   timeoutMs?: number
 */
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  BookOpen,
  Code2,
  Database,
  History,
  Info,
  Loader2,
  Pin,
  Send,
  Settings2,
} from "lucide-react";

import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Sections, type SectionItem } from "~/components/ui/sections";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { Textarea } from "~/components/ui/textarea";
import { cn } from "~/lib/utils";
import { queryKeys } from "~/lib/query-keys";
import * as environmentsApi from "~/services/environments";
import * as nodesApi from "~/services/workflow-nodes";
import type { NodeInvocation } from "~/services/workflow-nodes";
import { usePinnedData } from "~/stores/pinned-data";

import { useWorkflowId } from "../workflow-context";
import type { CustomPanelProps } from "./types";
import { DEFAULT_SAMPLE_CONTEXT } from "./template";

const MonacoEditor = lazy(() =>
  import("@monaco-editor/react").then((mod) => ({ default: mod.default })),
);

const PLACEHOLDER = `// 'input', 'vars', 'steps', 'env' estão disponíveis.
// Pode usar async/await. O retorno vira o output do nó.
return {
  sum: (input.items ?? []).reduce((a, b) => a + b, 0),
};
`;

const CTX_DTS_BASE = `
/**
 * Argumentos disponíveis no corpo da função:
 *   input  — input do run (geralmente vindo do trigger)
 *   vars   — variáveis acumuladas via \`set_variable\`
 *   env    — variáveis de ambiente do worker (decriptadas)
 *   steps  — outputs dos nós executados antes deste, por nodeId
 */
declare const input: any;
declare const vars: Record<string, any>;
declare const env: Record<string, string>;
declare const steps: Record<string, any>;
`;

const SECTIONS = [
  { id: "editor", label: "Editor", icon: Code2 },
  { id: "snippets", label: "Snippets", icon: BookOpen },
  { id: "advanced", label: "Avançado", icon: Settings2 },
  { id: "test", label: "Teste", icon: Send },
  { id: "history", label: "Histórico", icon: History },
] as const satisfies ReadonlyArray<SectionItem>;

type SectionId = (typeof SECTIONS)[number]["id"];

/* -------------------------------------------------------------------------- */
/* Painel                                                                      */
/* -------------------------------------------------------------------------- */

export function CodePanel({ values, onChange, onError, nodeId }: CustomPanelProps) {
  const [section, setSection] = useState<SectionId>("editor");
  const code = typeof values.code === "string" ? values.code : "";
  const workflowId = useWorkflowId() ?? "";
  const pins = usePinnedData(workflowId);

  const sampleCtx = useMemo(() => buildSampleCtx(pins), [pins]);
  const usingPins = Object.keys(pins).length > 0;

  useEffect(() => {
    onError?.("code", code.trim() === "" ? "Escreva o corpo da função." : null);
  }, [code, onError]);

  return (
    <Sections
      sections={SECTIONS as unknown as SectionItem<SectionId>[]}
      value={section}
      onValueChange={setSection}
      ariaLabel="Seções do nó Code"
    >
      {section === "editor" && (
        <EditorSection
          code={code}
          onChange={(v) => onChange({ code: v })}
          ctx={sampleCtx}
          usingPins={usingPins}
        />
      )}
      {section === "snippets" && (
        <SnippetsSection onPick={(snippet) => onChange({ code: snippet })} />
      )}
      {section === "advanced" && <AdvancedSection values={values} onChange={onChange} />}
      {section === "test" && (
        <TestSection workflowId={workflowId} nodeId={nodeId} values={values} pinsCtx={sampleCtx} />
      )}
      {section === "history" && <HistorySection workflowId={workflowId} nodeId={nodeId} />}
    </Sections>
  );
}

/* -------------------------------------------------------------------------- */
/* Editor + Ctx Inspector                                                      */
/* -------------------------------------------------------------------------- */

function EditorSection({
  code,
  onChange,
  ctx,
  usingPins,
}: {
  code: string;
  onChange: (v: string) => void;
  ctx: Record<string, unknown>;
  usingPins: boolean;
}) {
  return (
    <div className="min-h-[480px]">
      <EditorPane code={code} onChange={onChange} ctx={ctx} />
    </div>
  );
}

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
          input/vars/steps/env tipados pelo ctx
        </span>
      </div>
      <Suspense fallback={<EditorFallback code={code} onChange={onChange} />}>
        <MonacoEditor
          height="460px"
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
            monaco.languages.typescript.javascriptDefaults.setCompilerOptions({
              target: monaco.languages.typescript.ScriptTarget.ESNext,
              allowNonTsExtensions: true,
              checkJs: false,
              allowJs: true,
              lib: ["esnext"],
            });
            const URI = "ts:adila/code-node-ctx.d.ts";
            monaco.languages.typescript.javascriptDefaults.setExtraLibs([
              { content: dts, filePath: URI },
            ]);
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
  return (
    <textarea
      value={code}
      onChange={(e) => onChange(e.target.value)}
      placeholder={PLACEHOLDER}
      aria-label="Corpo da função JavaScript"
      spellCheck={false}
      className="h-[460px] w-full resize-none bg-zinc-950 p-3 font-mono text-xs text-zinc-100 outline-none"
    />
  );
}

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
              : "Nenhum pin — usando sample fixo. Pin nós upstream pra preview real."
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
          Em runtime os valores vêm do run real. Aqui mostra o shape que o autocomplete usa.
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
        <span className="font-mono font-medium">{name}</span>
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
/* Snippets                                                                    */
/* -------------------------------------------------------------------------- */

type Snippet = { id: string; title: string; description: string; code: string };

const SNIPPETS: Snippet[] = [
  {
    id: "map-rename",
    title: "Renomear / projetar campos",
    description: "Map array → array de objetos com shape novo.",
    code: `// Renomeia campos de cada item.
return {
  rows: (steps.fetch?.rows ?? []).map((r) => ({
    id: r.uuid,
    name: r.full_name,
    email: r.email_address,
  })),
};
`,
  },
  {
    id: "filter-group",
    title: "Filtrar e agrupar",
    description: "Filtra por critério e agrupa por chave.",
    code: `// Filtra ativos e agrupa por categoria.
const items = (input.items ?? []).filter((i) => i.active);
const byCategory = items.reduce((acc, it) => {
  (acc[it.category] ??= []).push(it);
  return acc;
}, {});
return { byCategory, count: items.length };
`,
  },
  {
    id: "merge-steps",
    title: "Mesclar outputs de N steps",
    description: "Combina dados de múltiplos nós upstream.",
    code: `// Junta dados do http_request + postgres.
const apiData = steps.fetchApi?.body ?? {};
const dbRows = steps.queryDb?.rows ?? [];
return {
  total: dbRows.length,
  apiVersion: apiData.version,
  enriched: dbRows.map((r) => ({ ...r, ...apiData.meta })),
};
`,
  },
  {
    id: "string-extract",
    title: "Extração com regex",
    description: "Parse de texto livre / logs.",
    code: `// Extrai todos os emails de um texto.
const text = input.body ?? "";
const re = /[\\w.+-]+@[\\w-]+\\.[\\w.-]+/g;
return { emails: [...text.matchAll(re)].map((m) => m[0]) };
`,
  },
  {
    id: "date-format",
    title: "Formatar / comparar datas",
    description: "Calcula diff em dias, ISO etc.",
    code: `// Idade do item em dias.
const created = new Date(input.createdAt);
const ageDays = Math.floor((Date.now() - created.getTime()) / 86400000);
return {
  ageDays,
  iso: created.toISOString(),
  stale: ageDays > 30,
};
`,
  },
  {
    id: "validate",
    title: "Validar e abortar",
    description: "Lança erro pra parar o workflow quando inválido.",
    code: `// Aborta o run se faltar campo crítico.
if (!input.userId) {
  throw new Error("userId é obrigatório");
}
return { ok: true, userId: input.userId };
`,
  },
  {
    id: "async-fetch",
    title: "Async / Promise.all",
    description: "Paralelismo simples com fetch nativo.",
    code: `// Faz N requests em paralelo. Lembre do timeoutMs!
const ids = input.ids ?? [];
const results = await Promise.all(
  ids.map((id) =>
    fetch(\`https://api.exemplo.com/items/\${id}\`).then((r) => r.json()),
  ),
);
return { items: results };
`,
  },
  {
    id: "deduplicate",
    title: "Deduplicar por chave",
    description: "Remove duplicatas mantendo o primeiro de cada chave.",
    code: `// Dedupe array de objetos por uma chave.
const items = steps.fetch?.rows ?? [];
const seen = new Set();
const unique = items.filter((i) => {
  if (seen.has(i.email)) return false;
  seen.add(i.email);
  return true;
});
return { unique, removed: items.length - unique.length };
`,
  },
];

function SnippetsSection({ onPick }: { onPick: (code: string) => void }) {
  const [confirmId, setConfirmId] = useState<string | null>(null);
  return (
    <div className="space-y-3">
      <SectionHeader
        title="Snippets prontos"
        hint="Padrões comuns. Clique pra carregar — sobrescreve o editor."
      />

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {SNIPPETS.map((s) => (
          <div key={s.id} className="overflow-hidden rounded-md border border-border bg-background">
            <div className="border-b border-border bg-muted/30 px-2 py-1.5">
              <p className="text-[12px] font-medium">{s.title}</p>
              <p className="text-[10px] text-muted-foreground">{s.description}</p>
            </div>
            <pre className="max-h-32 overflow-auto px-2 py-1.5 font-mono text-[10px] leading-snug">
              {s.code.split("\n").slice(0, 6).join("\n")}
              {s.code.split("\n").length > 6 && "\n…"}
            </pre>
            <div className="flex items-center justify-end gap-1.5 border-t border-border bg-muted/10 px-2 py-1">
              {confirmId === s.id ? (
                <>
                  <span className="text-[10px] text-muted-foreground">Sobrescrever editor?</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setConfirmId(null)}
                    className="h-6 px-2 text-[10px]"
                  >
                    cancelar
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => {
                      onPick(s.code);
                      setConfirmId(null);
                    }}
                    className="h-6 px-2 text-[10px]"
                  >
                    confirmar
                  </Button>
                </>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setConfirmId(s.id)}
                  className="h-6 px-2 text-[10px]"
                >
                  Usar
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Avançado                                                                    */
/* -------------------------------------------------------------------------- */

function AdvancedSection({
  values,
  onChange,
}: {
  values: Record<string, unknown>;
  onChange: (patch: Record<string, unknown>) => void;
}) {
  const timeoutMs = typeof values.timeoutMs === "number" ? values.timeoutMs : undefined;
  return (
    <div className="space-y-4">
      <SectionHeader title="Configurações avançadas" />

      <FieldRow
        label="Timeout (ms)"
        hint="Default 5000, máx 30000. Só protege contra Promises pendentes — loop síncrono não é interrompível."
      >
        <Input
          type="number"
          min={0}
          max={30000}
          value={timeoutMs ?? ""}
          onChange={(e) =>
            onChange({
              timeoutMs: e.target.value === "" ? undefined : Number(e.target.value),
            })
          }
          placeholder="5000"
          className="font-mono text-xs"
        />
      </FieldRow>

      <div className="space-y-1.5">
        <Label className="text-[11px] font-medium">Atalhos do editor</Label>
        <div className="flex flex-wrap gap-1.5 text-[11px] text-muted-foreground">
          <Shortcut k="⌘/Ctrl + Space">autocomplete</Shortcut>
          <Shortcut k="⌘/Ctrl + /">comentar linha</Shortcut>
          <Shortcut k="Alt + ↑/↓">mover linha</Shortcut>
          <Shortcut k="⌘/Ctrl + F">buscar</Shortcut>
          <Shortcut k="⌘/Ctrl + D">próxima ocorrência</Shortcut>
        </div>
      </div>

      <div className="space-y-1.5 rounded-md border border-dashed border-border bg-muted/20 p-2.5">
        <p className="text-[11px] font-medium">Sandbox</p>
        <ul className="space-y-0.5 text-[10px] text-muted-foreground">
          <li>• Roda em <code className="font-mono">new Function()</code> — sem require/import/process</li>
          <li>• Globais nativos disponíveis: Math, JSON, Date, fetch, console, Promise, etc</li>
          <li>• Não tem acesso ao filesystem, ao DB do app, nem a módulos externos</li>
          <li>• Para integração com sistemas externos, use os nós dedicados (http_request, postgres, …)</li>
        </ul>
      </div>
    </div>
  );
}

function Shortcut({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded border border-border bg-muted/40 px-1.5 py-0.5">
      <code className="font-mono">{k}</code>
      <span>· {children}</span>
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* Teste                                                                       */
/* -------------------------------------------------------------------------- */

function TestSection({
  workflowId,
  nodeId,
  values,
  pinsCtx,
}: {
  workflowId: string;
  nodeId?: string;
  values: Record<string, unknown>;
  pinsCtx: Record<string, unknown>;
}) {
  const [environmentId, setEnvironmentId] = useState<string | null>(null);
  const [inputText, setInputText] = useState(() =>
    JSON.stringify(pinsCtx.input ?? {}, null, 2),
  );
  const [varsText, setVarsText] = useState(() => JSON.stringify(pinsCtx.vars ?? {}, null, 2));
  const [stepsText, setStepsText] = useState(() =>
    JSON.stringify(pinsCtx.steps ?? {}, null, 2),
  );
  const [parseErr, setParseErr] = useState<string | null>(null);

  const envQuery = useQuery({
    queryKey: queryKeys.environments.list(),
    queryFn: () => environmentsApi.list(),
  });

  const mutation = useMutation({
    mutationFn: () => {
      const input = JSON.parse(inputText || "{}") as Record<string, unknown>;
      const vars = JSON.parse(varsText || "{}") as Record<string, unknown>;
      const steps = JSON.parse(stepsText || "{}") as Record<string, Record<string, unknown>>;
      return nodesApi.dryRunCode(workflowId, nodeId!, {
        config: values,
        input,
        vars,
        steps,
        environmentId,
      });
    },
  });

  if (!workflowId || !nodeId) {
    return <EmptyHint>Salve o workflow antes de testar — depende do nodeId.</EmptyHint>;
  }

  function run() {
    setParseErr(null);
    try {
      JSON.parse(inputText || "{}");
      JSON.parse(varsText || "{}");
      JSON.parse(stepsText || "{}");
    } catch (err) {
      setParseErr((err as Error).message);
      return;
    }
    mutation.mutate();
  }

  function fillFromPins() {
    setInputText(JSON.stringify(pinsCtx.input ?? {}, null, 2));
    setVarsText(JSON.stringify(pinsCtx.vars ?? {}, null, 2));
    setStepsText(JSON.stringify(pinsCtx.steps ?? {}, null, 2));
  }

  const result = mutation.data;

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-2">
        <SectionHeader
          title="Disparar agora"
          hint="Roda o código com input/vars/steps mockados. Sem persistir step."
        />
        <Button size="sm" variant="outline" onClick={fillFromPins} className="h-7 text-[11px]">
          <Pin className="size-3" /> usar pins do canvas
        </Button>
      </div>

      <FieldRow label="Environment (opcional)" hint="Decripta env vars pro ctx.env.">
        <Select
          value={environmentId ?? "__none__"}
          onValueChange={(v) => setEnvironmentId(v === "__none__" ? null : v)}
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue placeholder="Sem environment" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">— sem environment —</SelectItem>
            {envQuery.data?.map((e) => (
              <SelectItem key={e.id} value={e.id}>
                {e.name} <span className="ml-1 text-muted-foreground">({e.kind})</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FieldRow>

      <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
        <FieldRow label="input (JSON)" hint="Vira `input`.">
          <Textarea
            rows={6}
            spellCheck={false}
            className="font-mono text-[11px]"
            value={inputText}
            onChange={(e) => {
              setInputText(e.target.value);
              if (parseErr) setParseErr(null);
            }}
          />
        </FieldRow>
        <FieldRow label="vars (JSON)" hint="Vira `vars`.">
          <Textarea
            rows={6}
            spellCheck={false}
            className="font-mono text-[11px]"
            value={varsText}
            onChange={(e) => {
              setVarsText(e.target.value);
              if (parseErr) setParseErr(null);
            }}
          />
        </FieldRow>
        <FieldRow label="steps (JSON)" hint="Mocks de upstream — { nodeId: { …output } }.">
          <Textarea
            rows={6}
            spellCheck={false}
            className="font-mono text-[11px]"
            value={stepsText}
            onChange={(e) => {
              setStepsText(e.target.value);
              if (parseErr) setParseErr(null);
            }}
          />
        </FieldRow>
      </div>

      {parseErr && (
        <p className="text-[10px] text-destructive">JSON inválido: {parseErr}</p>
      )}

      <div className="flex justify-end">
        <Button size="sm" onClick={run} disabled={mutation.isPending}>
          {mutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          Executar
        </Button>
      </div>

      {mutation.isError && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-2 py-1.5">
          <p className="text-[11px] text-destructive">
            Falha de rede: {(mutation.error as Error).message}
          </p>
        </div>
      )}

      {result && !result.ok && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-2 py-1.5">
          <p className="text-[10px] font-medium text-destructive">Handler falhou</p>
          <p className="mt-0.5 break-words font-mono text-[11px] text-destructive/90">{result.error}</p>
          <p className="mt-1 text-[10px] text-muted-foreground">{result.durationMs}ms</p>
        </div>
      )}

      {result && result.ok && (
        <div className="space-y-1 rounded-md border border-emerald-500/40 bg-emerald-500/5 p-2">
          <div className="flex items-center justify-between text-[11px]">
            <span className="font-medium text-emerald-600">Output</span>
            <span className="text-[10px] tabular-nums text-muted-foreground">{result.durationMs}ms</span>
          </div>
          <pre className="max-h-80 overflow-auto rounded-md border border-border bg-background p-2 font-mono text-[10px] leading-relaxed">
            {safeStringify(result.output)}
          </pre>
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Histórico                                                                   */
/* -------------------------------------------------------------------------- */

function HistorySection({ workflowId, nodeId }: { workflowId: string; nodeId?: string }) {
  const limit = 25;
  const query = useQuery({
    queryKey: queryKeys.workflowNodes.invocations(workflowId, nodeId ?? "", limit),
    queryFn: () => nodesApi.listInvocations(workflowId, nodeId!, limit),
    enabled: Boolean(workflowId && nodeId),
  });

  if (!workflowId || !nodeId) {
    return <EmptyHint>Salve o workflow antes de ver histórico.</EmptyHint>;
  }

  return (
    <div className="space-y-2">
      <SectionHeader title="Últimas execuções" hint={`As ${limit} chamadas mais recentes deste node em runs reais.`} />

      {query.isPending && (
        <div className="flex items-center gap-2 px-2 py-4 text-[11px] text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" /> Carregando…
        </div>
      )}

      {query.data && query.data.length === 0 && <EmptyHint>Nenhuma execução registrada ainda.</EmptyHint>}

      {query.data && query.data.length > 0 && (
        <div className="overflow-hidden rounded-md border border-border bg-background">
          <table className="w-full text-[11px]">
            <thead className="bg-muted/40 text-[10px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-2 py-1.5 text-left">Quando</th>
                <th className="px-2 py-1.5 text-left">Status</th>
                <th className="px-2 py-1.5 text-right">Duração</th>
                <th className="px-2 py-1.5 text-left">Resumo</th>
              </tr>
            </thead>
            <tbody>
              {query.data.map((inv) => (
                <InvocationRow key={inv.id} inv={inv} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function InvocationRow({ inv }: { inv: NodeInvocation }) {
  const summary = useMemo(() => {
    if (inv.status === "failed" && inv.error) {
      const msg = (inv.error as Record<string, unknown>).message;
      return typeof msg === "string" ? msg : safeStringify(inv.error);
    }
    if (inv.output) {
      const keys = Object.keys(inv.output);
      if (keys.length === 0) return "{}";
      return `{ ${keys.slice(0, 4).join(", ")}${keys.length > 4 ? ", …" : ""} }`;
    }
    return "—";
  }, [inv]);

  return (
    <tr className="border-t border-border/60">
      <td className="px-2 py-1.5 text-muted-foreground">{new Date(inv.createdAt).toLocaleString("pt-BR")}</td>
      <td className="px-2 py-1.5">
        <StatusBadge status={inv.status} />
      </td>
      <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">
        {inv.durationMs !== null ? `${inv.durationMs}ms` : "—"}
      </td>
      <td className="px-2 py-1.5 font-mono text-[10px] text-muted-foreground">{summary}</td>
    </tr>
  );
}

function StatusBadge({ status }: { status: NodeInvocation["status"] }) {
  const map: Record<NodeInvocation["status"], string> = {
    success: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
    failed: "border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-400",
    running: "border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-400",
    pending: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400",
    skipped: "border-border bg-muted text-muted-foreground",
    cancelled: "border-border bg-muted text-muted-foreground",
  };
  return (
    <span className={cn("rounded-md border px-1.5 py-0.5 font-mono text-[10px] uppercase", map[status])}>
      {status}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

function SectionHeader({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="mb-3">
      <h3 className="text-sm font-semibold">{title}</h3>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function FieldRow({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string | null;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-[11px] font-medium">{label}</Label>
      {children}
      {error ? (
        <p className="text-[10px] text-destructive">{error}</p>
      ) : hint ? (
        <p className="text-[10px] text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

function EmptyHint({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-dashed border-border bg-background/40 px-3 py-4 text-center text-[11px] text-muted-foreground">
      {children}
    </div>
  );
}

function buildSampleCtx(pins: Record<string, Record<string, unknown>>): Record<string, unknown> {
  if (Object.keys(pins).length === 0) return DEFAULT_SAMPLE_CONTEXT;
  return { input: {}, vars: {}, env: {}, steps: { ...pins } };
}

function buildCtxDts(ctx: Record<string, unknown>): string {
  const inputType = inferTsType(ctx.input);
  const varsType = inferTsType(ctx.vars);
  const stepsType = inferTsType(ctx.steps);
  return `${CTX_DTS_BASE}

// Reescrito a cada mudança nos pins:
declare const input: ${inputType};
declare const vars: ${varsType};
declare const env: Record<string, string>;
declare const steps: ${stepsType};
`;
}

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
