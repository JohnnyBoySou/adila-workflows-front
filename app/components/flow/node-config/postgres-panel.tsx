/**
 * Painel dedicado pro nó `postgres` — Monaco editor (SQL ou TS/Drizzle) +
 * snippets prontos + ctx inspector pinado.
 *
 * Modos:
 *   - sql: Monaco com syntax SQL + editor JSON para params
 *   - orm: Monaco com syntax TS + d.ts ambient de Drizzle (db, sql, helpers,
 *     pgTable + column builders) e ctx inspector
 *   - builder: montador visual (operação + tabela + colunas + filtros) que
 *     gera `query` + `params` ao vivo e exibe o SQL num Monaco read-only.
 *     A engine trata `mode === "builder"` como SQL (cai no `else` do switch).
 *
 * Shape persistido em `values`:
 *   connectionRef: string      (nome lógico — "db_main"; resolvido em runtime
 *                              com fallback env-específico → default)
 *   connectionId?: string      (legado — UUID; mantido pra compat de workflows
 *                              antigos; novos sempre gravam connectionRef)
 *   mode: "sql" | "orm" | "builder"
 *   query?: string             (sql/builder)
 *   params?: unknown[]         (sql/builder)
 *   code?: string              (orm)
 *   timeoutMs?: number         (orm)
 *   builder?: BuilderConfig    (builder — preserva o desenho da query)
 */
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import {
  ArrowDownAZ,
  ArrowUpAZ,
  Code2,
  Database,
  Filter,
  Info,
  ListChecks,
  Pin,
  Plus,
  Sparkles,
  Table2,
  Trash2,
  Wand2,
  X,
} from "lucide-react";

import { ConnectionPicker } from "~/components/database-connections/connection-picker";
import { ConnectionsManagerDialog } from "~/components/database-connections/connections-manager-dialog";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { Textarea } from "~/components/ui/textarea";
import { cn } from "~/lib/utils";
import { useWorkflowId } from "../workflow-context";
import { usePinnedData } from "~/stores/pinned-data";
import * as dbConnections from "~/services/database-connections";

import type { CustomPanelProps } from "./types";
import { DEFAULT_SAMPLE_CONTEXT } from "./template";

const MonacoEditor = lazy(() =>
  import("@monaco-editor/react").then((mod) => ({ default: mod.default })),
);

/* -------------------------------------------------------------------------- */
/* Snippets                                                                    */
/* -------------------------------------------------------------------------- */

const SQL_SNIPPETS: Array<{ label: string; query: string; params: string }> = [
  {
    label: "SELECT por id",
    query: "SELECT id, name, email\nFROM users\nWHERE id = $1\nLIMIT 1",
    params: '["{{ input.id }}"]',
  },
  {
    label: "INSERT retornando id",
    query:
      "INSERT INTO users (id, email, name)\nVALUES ($1, $2, $3)\nRETURNING id, created_at",
    params: '["{{ input.id }}", "{{ input.email }}", "{{ input.name }}"]',
  },
  {
    label: "UPSERT (ON CONFLICT)",
    query:
      "INSERT INTO users (id, email)\nVALUES ($1, $2)\nON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email\nRETURNING *",
    params: '["{{ input.id }}", "{{ input.email }}"]',
  },
  {
    label: "DELETE por filtro",
    query: "DELETE FROM users\nWHERE org_id = $1 AND status = 'inactive'",
    params: '["{{ input.orgId }}"]',
  },
];

const ORM_SNIPPETS: Array<{ label: string; code: string }> = [
  {
    label: "SELECT com WHERE",
    code: `const users = pgTable('users', {
  id: text('id'),
  email: text('email'),
  orgId: text('org_id'),
});

const rows = await db
  .select({ id: users.id, email: users.email })
  .from(users)
  .where(eq(users.orgId, ctx.input.orgId))
  .limit(10);

return { rows };`,
  },
  {
    label: "INSERT retornando",
    code: `const users = pgTable('users', {
  id: text('id'),
  email: text('email'),
  name: text('name'),
});

const [user] = await db
  .insert(users)
  .values({ id: ctx.input.id, email: ctx.input.email, name: ctx.input.name })
  .returning();

return { user };`,
  },
  {
    label: "sql template (raw)",
    code: `const rows = await db.execute(
  sql\`SELECT count(*)::int as total FROM users WHERE org_id = \${ctx.input.orgId}\`
);

return { total: rows[0]?.total ?? 0 };`,
  },
  {
    label: "UPDATE com AND",
    code: `const users = pgTable('users', {
  id: text('id'),
  orgId: text('org_id'),
  status: text('status'),
});

const updated = await db
  .update(users)
  .set({ status: 'active' })
  .where(and(eq(users.orgId, ctx.input.orgId), eq(users.status, 'pending')))
  .returning({ id: users.id });

return { updated };`,
  },
];

/* -------------------------------------------------------------------------- */
/* d.ts para autocomplete no modo ORM                                          */
/* -------------------------------------------------------------------------- */

const DRIZZLE_DTS_BASE = `
/** Drizzle ORM exposto ao node postgres em modo ORM. */
declare const db: DrizzleDb;
declare const sql: SqlTag;
declare const ctx: ExecutionContext;

interface ExecutionContext {
  input: any;
  vars: Record<string, any>;
  env: Record<string, string>;
  steps: Record<string, any>;
}

interface DrizzleDb {
  select(fields?: any): SelectBuilder;
  insert(table: any): InsertBuilder;
  update(table: any): UpdateBuilder;
  delete(table: any): DeleteBuilder;
  execute<T = any>(query: any): Promise<T[]>;
}

interface SelectBuilder {
  from(table: any): SelectBuilder;
  where(cond: any): SelectBuilder;
  leftJoin(table: any, cond: any): SelectBuilder;
  innerJoin(table: any, cond: any): SelectBuilder;
  orderBy(...exprs: any[]): SelectBuilder;
  groupBy(...exprs: any[]): SelectBuilder;
  limit(n: number): SelectBuilder;
  offset(n: number): SelectBuilder;
  then<R>(onFulfilled: (rows: any[]) => R): Promise<R>;
}

interface InsertBuilder {
  values(rows: any | any[]): InsertBuilder;
  returning(fields?: any): Promise<any[]>;
  onConflictDoNothing(target?: any): InsertBuilder;
  onConflictDoUpdate(opts: { target: any; set: any }): InsertBuilder;
}

interface UpdateBuilder {
  set(values: any): UpdateBuilder;
  where(cond: any): UpdateBuilder;
  returning(fields?: any): Promise<any[]>;
}

interface DeleteBuilder {
  where(cond: any): DeleteBuilder;
  returning(fields?: any): Promise<any[]>;
}

/** sql\`SELECT ... \${param}\` — interpolações são bindadas (sem SQLi). */
interface SqlTag {
  (strings: TemplateStringsArray, ...values: any[]): any;
  raw(value: string): any;
}

/** Operadores. */
declare function eq<T>(left: T, right: T): any;
declare function ne<T>(left: T, right: T): any;
declare function gt<T>(left: T, right: T): any;
declare function gte<T>(left: T, right: T): any;
declare function lt<T>(left: T, right: T): any;
declare function lte<T>(left: T, right: T): any;
declare function like(left: any, pattern: string): any;
declare function inArray<T>(column: T, values: T[]): any;
declare function isNull(column: any): any;
declare function isNotNull(column: any): any;
declare function and(...conds: any[]): any;
declare function or(...conds: any[]): any;
declare function not(cond: any): any;
declare function desc(column: any): any;
declare function asc(column: any): any;

/** Schema (pg-core). */
declare function pgTable<T extends Record<string, any>>(name: string, columns: T): T;
declare function text(name?: string): any;
declare function integer(name?: string): any;
declare function boolean(name?: string): any;
declare function timestamp(name?: string): any;
declare function uuid(name?: string): any;
declare function jsonb(name?: string): any;
declare function serial(name?: string): any;
`;

/* -------------------------------------------------------------------------- */
/* Painel principal                                                            */
/* -------------------------------------------------------------------------- */

export function PostgresPanel({
  values,
  onChange,
  onError,
  meta,
  onMetaChange,
}: CustomPanelProps) {
  // `connectionRef` é a referência canônica (nome lógico). `connectionId`
  // (UUID) é aceito como fallback pra workflows criados antes do rename.
  const connectionRef =
    typeof values.connectionRef === "string"
      ? values.connectionRef
      : typeof values.connectionId === "string"
        ? values.connectionId
        : undefined;
  const mode: PgUiMode =
    values.mode === "orm" ? "orm" : values.mode === "builder" ? "builder" : "sql";

  const workflowId = useWorkflowId();
  const pins = usePinnedData(workflowId ?? "");
  const sampleCtx = useMemo(() => buildSampleCtx(pins), [pins]);
  const usingPins = Object.keys(pins).length > 0;

  // Gerenciador inline — abre o mesmo dialog do top bar.
  const [managerOpen, setManagerOpen] = useState(false);

  // Schema introspectado da connection — alimenta o d.ts no modo ORM.
  // O endpoint exige UUID; quando o ref é um nome, listamos as connections
  // e pegamos o UUID do default (env=null) com aquele nome.
  const [schema, setSchema] = useState<dbConnections.DatabaseSchema | null>(null);
  useEffect(() => {
    if (!workflowId || !connectionRef) {
      setSchema(null);
      return;
    }
    let cancelled = false;
    const looksUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      connectionRef,
    );
    const resolveId = async (): Promise<string | null> => {
      if (looksUuid) return connectionRef;
      const rows = await dbConnections.list(workflowId, { kind: "postgres" });
      // Prefere o default (env=null) — é o que serve de "esqueleto" do schema.
      const match = rows.find((r) => r.name === connectionRef && !r.environmentId)
        ?? rows.find((r) => r.name === connectionRef);
      return match?.id ?? null;
    };
    resolveId()
      .then((id) => {
        if (cancelled || !id) {
          if (!cancelled) setSchema(null);
          return;
        }
        return dbConnections.schema(workflowId, id).then((s) => {
          if (!cancelled) setSchema(s);
        });
      })
      .catch(() => {
        // Schema introspection falhou — segue sem autocomplete tipado.
        if (!cancelled) setSchema(null);
      });
    return () => {
      cancelled = true;
    };
  }, [workflowId, connectionRef]);

  // Validação
  useEffect(() => {
    onError?.(
      "connectionRef",
      !connectionRef ? "Selecione uma connection cadastrada." : null,
    );
  }, [connectionRef, onError]);

  useEffect(() => {
    if (mode === "sql") {
      const q = typeof values.query === "string" ? values.query : "";
      onError?.("query", q.trim() === "" ? "Escreva uma query SQL." : null);
      onError?.("code", null);
    } else {
      const c = typeof values.code === "string" ? values.code : "";
      onError?.("code", c.trim() === "" ? "Escreva o código Drizzle." : null);
      onError?.("query", null);
    }
  }, [mode, values.query, values.code, onError]);

  return (
    <div className="grid h-full grid-cols-[18rem_1fr] gap-4">
      {/* ── Aside esquerdo: meta + conexão + modo + opções ─────────────── */}
      <aside className="flex flex-col gap-4 overflow-y-auto rounded-lg border border-border bg-muted/30 p-3">
        {meta && onMetaChange && (
          <div className="flex flex-col gap-3 border-b border-dashed border-border pb-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pg-meta-title" className="text-xs font-medium">
                Título no canvas
              </Label>
              <Input
                id="pg-meta-title"
                value={meta.title ?? ""}
                placeholder="(usa o padrão do tipo)"
                onChange={(e) => onMetaChange({ ...meta, title: e.target.value })}
                className="h-9"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pg-meta-desc" className="text-xs font-medium">
                Descrição no canvas
              </Label>
              <Textarea
                id="pg-meta-desc"
                value={meta.description ?? ""}
                rows={3}
                placeholder="Linha curta exibida no card."
                onChange={(e) =>
                  onMetaChange({ ...meta, description: e.target.value })
                }
                className="text-sm"
              />
            </div>
          </div>
        )}

        <ConnectionPicker
          kind="postgres"
          value={connectionRef}
          // Emite nome lógico (valueKind default = "name"); zeramos o alias
          // legado `connectionId` pra evitar dois campos divergentes na config.
          onChange={(ref) => onChange({ connectionRef: ref, connectionId: undefined })}
          onManageClick={() => setManagerOpen(true)}
          label="Connection"
          required
        />

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="pg-mode" className="text-xs font-medium">
            Modo
          </Label>
          <Select value={mode} onValueChange={(v) => onChange({ mode: v })}>
            <SelectTrigger id="pg-mode">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="builder">Visual — montador de query</SelectItem>
              <SelectItem value="sql">SQL — query parametrizada</SelectItem>
              <SelectItem value="orm">ORM — Drizzle</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-[11px] text-muted-foreground">
            {mode === "sql"
              ? "Query + params ($1, $2…)."
              : mode === "orm"
                ? "JS com db, sql, helpers e schema builders."
                : "Monte a query clicando em tabelas e colunas; o SQL aparece ao lado."}
          </p>
        </div>

        {mode === "orm" && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="pg-timeout" className="text-xs font-medium">
              Timeout (ms)
            </Label>
            <Input
              id="pg-timeout"
              type="number"
              min={0}
              value={typeof values.timeoutMs === "number" ? values.timeoutMs : ""}
              onChange={(e) =>
                onChange({
                  timeoutMs: e.target.value === "" ? undefined : Number(e.target.value),
                })
              }
              placeholder="5000"
            />
            <p className="text-[11px] text-muted-foreground">
              Default 5000ms, máx 30000ms.
            </p>
          </div>
        )}

        {/* Schema introspectado */}
        <div className="flex flex-col gap-1.5 border-t border-dashed border-border pt-3">
          <div className="flex items-center gap-1.5 text-xs font-medium">
            <Table2 className="size-3.5" /> Schema
            {schema && (
              <Badge variant="outline" className="ml-auto h-4 px-1 text-[10px]">
                {schema.tables.length} tab.
              </Badge>
            )}
          </div>
          {!connectionRef ? (
            <p className="text-[11px] text-muted-foreground">
              Selecione uma connection pra carregar as tabelas.
            </p>
          ) : !schema ? (
            <p className="text-[11px] text-muted-foreground">Carregando…</p>
          ) : schema.tables.length === 0 ? (
            <p className="text-[11px] text-muted-foreground">
              Nenhuma tabela acessível em <code>public</code>.
            </p>
          ) : (
            <SchemaTableList
              schema={schema}
              activeTable={
                mode === "builder" && isBuilderConfig(values.builder)
                  ? values.builder.table
                  : undefined
              }
              onPick={
                mode === "builder"
                  ? (t) => {
                      const prev = isBuilderConfig(values.builder)
                        ? values.builder
                        : DEFAULT_BUILDER;
                      onChange({ builder: { ...prev, table: t, columns: [] } });
                    }
                  : undefined
              }
            />
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label className="text-xs font-medium">Atalhos do editor</Label>
          <div className="flex flex-wrap gap-1.5 text-[11px] text-muted-foreground">
            <Hint k="⌘/Ctrl + Space">autocomplete</Hint>
            <Hint k="⌘/Ctrl + /">comentar</Hint>
            <Hint k="Alt + ↑/↓">mover linha</Hint>
          </div>
        </div>
      </aside>

      {/* ── Pane direito: editor gigante ───────────────────────────────── */}
      <div className="flex min-h-0 flex-col overflow-hidden">
        {mode === "sql" ? (
          <SqlEditorPane values={values} onChange={onChange} />
        ) : mode === "orm" ? (
          <OrmEditorPane
            values={values}
            onChange={onChange}
            ctx={sampleCtx}
            schema={schema}
            usingPins={usingPins}
          />
        ) : (
          <BuilderPane values={values} onChange={onChange} schema={schema} />
        )}
      </div>

      {workflowId && (
        <ConnectionsManagerDialog
          open={managerOpen}
          onOpenChange={setManagerOpen}
          workflowId={workflowId}
        />
      )}
    </div>
  );
}

function SchemaTableList({
  schema,
  activeTable,
  onPick,
}: {
  schema: dbConnections.DatabaseSchema;
  activeTable?: string;
  onPick?: (table: string) => void;
}) {
  const visible = schema.tables.filter((t) => t.schema === "public");
  return (
    <ul className="flex max-h-72 flex-col gap-0.5 overflow-y-auto rounded border border-border bg-background p-1.5 text-[11px] font-mono">
      {visible.map((t) => {
        const active = t.name === activeTable;
        const Wrapper: "button" | "div" = onPick ? "button" : "div";
        return (
          <li key={`${t.schema}.${t.name}`}>
            <Wrapper
              type={onPick ? ("button" as const) : undefined}
              onClick={onPick ? () => onPick(t.name) : undefined}
              className={cn(
                "flex w-full items-center justify-between gap-2 rounded px-1.5 py-0.5 text-left",
                onPick && "cursor-pointer hover:bg-muted",
                active && "bg-primary/15 text-primary",
              )}
            >
              <span className="truncate">{t.name}</span>
              <span className="shrink-0 text-muted-foreground">{t.columns.length}c</span>
            </Wrapper>
          </li>
        );
      })}
    </ul>
  );
}

/* -------------------------------------------------------------------------- */
/* SQL pane                                                                    */
/* -------------------------------------------------------------------------- */

function SqlEditorPane({
  values,
  onChange,
}: {
  values: Record<string, unknown>;
  onChange: (patch: Record<string, unknown>) => void;
}) {
  const query = typeof values.query === "string" ? values.query : "";
  const params =
    typeof values.params === "string"
      ? values.params
      : Array.isArray(values.params)
        ? JSON.stringify(values.params, null, 2)
        : "[]";

  return (
    <div className="grid h-full min-h-[440px] grid-cols-[1fr_20rem] gap-3">
      <div className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-border">
        <div className="flex items-center gap-2 border-b border-border bg-muted/40 px-3 py-1.5 text-[11px] text-muted-foreground">
          <Code2 className="size-3.5" />
          <span>SQL</span>
          <SnippetMenu
            items={SQL_SNIPPETS.map((s) => ({
              label: s.label,
              onClick: () => {
                onChange({ query: s.query, params: tryParseJson(s.params) });
              },
            }))}
          />
        </div>
        <div className="min-h-0 flex-1">
          <Suspense
            fallback={
              <textarea
                value={query}
                onChange={(e) => onChange({ query: e.target.value })}
                spellCheck={false}
                className="h-full w-full resize-none bg-zinc-950 p-3 font-mono text-xs text-zinc-100 outline-none"
              />
            }
          >
            <MonacoEditor
              height="100%"
              defaultLanguage="sql"
              language="sql"
              theme="vs-dark"
              value={query}
              onChange={(v) => onChange({ query: v ?? "" })}
              options={MONACO_OPTIONS}
            />
          </Suspense>
        </div>
      </div>

      <aside className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-border">
        <div className="flex items-center gap-2 border-b border-border bg-muted/40 px-3 py-1.5 text-[11px] text-muted-foreground">
          <Database className="size-3.5" />
          <span>Parâmetros ($1, $2…)</span>
        </div>
        <div className="min-h-0 flex-1">
          <Suspense
            fallback={
              <textarea
                value={params}
                onChange={(e) => onChange({ params: tryParseJson(e.target.value) })}
                spellCheck={false}
                className="h-full w-full resize-none bg-zinc-950 p-3 font-mono text-xs text-zinc-100 outline-none"
              />
            }
          >
            <MonacoEditor
              height="100%"
              defaultLanguage="json"
              language="json"
              theme="vs-dark"
              value={params}
              onChange={(v) => onChange({ params: tryParseJson(v ?? "[]") })}
              options={MONACO_OPTIONS}
            />
          </Suspense>
        </div>
        <div className="flex items-start gap-1.5 border-t border-border bg-muted/30 px-3 py-2 text-[10px] text-muted-foreground">
          <Info className="mt-0.5 size-3 shrink-0" />
          <span>
            Array JSON com os valores. Templates <code>{"{{ input.x }}"}</code> são resolvidos
            em runtime antes do bind.
          </span>
        </div>
      </aside>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* ORM pane                                                                    */
/* -------------------------------------------------------------------------- */

function OrmEditorPane({
  values,
  onChange,
  ctx,
  schema,
  usingPins,
}: {
  values: Record<string, unknown>;
  onChange: (patch: Record<string, unknown>) => void;
  ctx: Record<string, unknown>;
  schema: dbConnections.DatabaseSchema | null;
  usingPins: boolean;
}) {
  const code = typeof values.code === "string" ? values.code : "";
  const dts = useMemo(() => buildDts(ctx, schema), [ctx, schema]);

  return (
    <div className="grid h-full min-h-[480px] grid-cols-[1fr_20rem] gap-3">
      <div className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-border">
        <div className="flex items-center gap-2 border-b border-border bg-muted/40 px-3 py-1.5 text-[11px] text-muted-foreground">
          <Code2 className="size-3.5" />
          <span>TypeScript · Drizzle</span>
          <SnippetMenu
            items={ORM_SNIPPETS.map((s) => ({
              label: s.label,
              onClick: () => onChange({ code: s.code }),
            }))}
          />
          <span className="ml-auto rounded bg-muted px-1.5 py-0.5">
            ctx tipado a partir dos pins
          </span>
        </div>
        <div className="min-h-0 flex-1">
        <Suspense
          fallback={
            <textarea
              value={code}
              onChange={(e) => onChange({ code: e.target.value })}
              spellCheck={false}
              className="h-full w-full resize-none bg-zinc-950 p-3 font-mono text-xs text-zinc-100 outline-none"
            />
          }
        >
          <MonacoEditor
            height="100%"
            defaultLanguage="typescript"
            language="typescript"
            theme="vs-dark"
            value={code}
            onChange={(v) => onChange({ code: v ?? "" })}
            options={MONACO_OPTIONS}
            beforeMount={(monaco) => {
              monaco.languages.typescript.typescriptDefaults.setCompilerOptions({
                target: monaco.languages.typescript.ScriptTarget.ESNext,
                allowNonTsExtensions: true,
                lib: ["esnext"],
                strict: false,
                noImplicitAny: false,
              });
              const URI = "ts:adila/postgres-drizzle.d.ts";
              monaco.languages.typescript.typescriptDefaults.setExtraLibs([
                { content: dts, filePath: URI },
              ]);
              monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions({
                noSemanticValidation: false,
                noSyntaxValidation: false,
                diagnosticCodesToIgnore: [1108], // top-level return
              });
            }}
          />
        </Suspense>
        </div>
      </div>

      <CtxInspector ctx={ctx} usingPins={usingPins} />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Shared bits                                                                 */
/* -------------------------------------------------------------------------- */

const MONACO_OPTIONS = {
  minimap: { enabled: false },
  fontSize: 13,
  lineNumbers: "on" as const,
  scrollBeyondLastLine: false,
  wordWrap: "on" as const,
  tabSize: 2,
  insertSpaces: true,
  padding: { top: 12, bottom: 12 },
  renderLineHighlight: "line" as const,
  scrollbar: { verticalScrollbarSize: 8, horizontalScrollbarSize: 8 },
  fixedOverflowWidgets: true,
};

function SnippetMenu({ items }: { items: Array<{ label: string; onClick: () => void }> }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => setOpen((v) => !v)}
        className="h-6 gap-1 px-1.5 text-[11px]"
      >
        <Sparkles className="size-3" />
        Snippets
      </Button>
      {open && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <div className="absolute left-0 top-7 z-20 flex w-56 flex-col rounded-md border border-border bg-popover p-1 shadow-md">
            {items.map((it) => (
              <button
                key={it.label}
                type="button"
                onClick={() => {
                  it.onClick();
                  setOpen(false);
                }}
                className="rounded px-2 py-1.5 text-left text-xs hover:bg-muted"
              >
                {it.label}
              </button>
            ))}
          </div>
        </>
      )}
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
          Em runtime, vem do run real. Aqui mostra só o shape que o autocomplete usa.
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
/* Builder pane — montador visual de query                                     */
/* -------------------------------------------------------------------------- */

type PgUiMode = "sql" | "orm" | "builder";

type BuilderOp = "select" | "insert" | "update" | "delete";

type BuilderOperator =
  | "="
  | "!="
  | "<"
  | "<="
  | ">"
  | ">="
  | "LIKE"
  | "ILIKE"
  | "IS NULL"
  | "IS NOT NULL"
  | "IN";

interface BuilderFilter {
  id: string;
  column: string;
  op: BuilderOperator;
  /** Valor literal ou template `{{ input.x }}`; ignorado se `op` é IS [NOT] NULL. */
  value: string;
}

interface BuilderSetValue {
  id: string;
  column: string;
  value: string;
}

interface BuilderConfig {
  op: BuilderOp;
  table?: string;
  columns?: string[];
  setValues?: BuilderSetValue[];
  filters?: BuilderFilter[];
  orderBy?: { column: string; direction: "asc" | "desc" } | null;
  limit?: number | null;
  returning?: boolean;
}

const DEFAULT_BUILDER: BuilderConfig = {
  op: "select",
  columns: [],
  setValues: [],
  filters: [],
  orderBy: null,
  limit: null,
  returning: true,
};

const OPERATORS: BuilderOperator[] = [
  "=",
  "!=",
  "<",
  "<=",
  ">",
  ">=",
  "LIKE",
  "ILIKE",
  "IN",
  "IS NULL",
  "IS NOT NULL",
];

function isBuilderConfig(v: unknown): v is BuilderConfig {
  return !!v && typeof v === "object" && "op" in (v as Record<string, unknown>);
}

function newId(): string {
  return Math.random().toString(36).slice(2, 9);
}

function quoteIdent(name: string): string {
  // Identificadores no Postgres com aspas duplas são case-sensitive — só citamos
  // quando há caractere fora do padrão `[a-z_][a-z0-9_]*`.
  return /^[a-z_][a-z0-9_]*$/.test(name) ? name : `"${name.replace(/"/g, '""')}"`;
}

function operatorNeedsValue(op: BuilderOperator): boolean {
  return op !== "IS NULL" && op !== "IS NOT NULL";
}

/** Constrói `{ sql, params }` a partir do BuilderConfig. */
function compileBuilder(cfg: BuilderConfig): { sql: string; params: unknown[] } {
  const params: unknown[] = [];
  if (!cfg.table) return { sql: "-- selecione uma tabela", params };

  const t = quoteIdent(cfg.table);

  // Helper pra parser de valor: número puro → number, "true"/"false" → bool,
  // "null" → null, IN com lista separada por vírgula → array.
  const coerce = (raw: string): unknown => {
    const s = raw.trim();
    if (s === "") return "";
    if (s === "true") return true;
    if (s === "false") return false;
    if (s === "null") return null;
    if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s);
    return raw;
  };

  const renderWhere = (): string => {
    const filters = (cfg.filters ?? []).filter((f) => f.column);
    if (filters.length === 0) return "";
    const parts = filters.map((f) => {
      const col = quoteIdent(f.column);
      if (f.op === "IS NULL") return `${col} IS NULL`;
      if (f.op === "IS NOT NULL") return `${col} IS NOT NULL`;
      if (f.op === "IN") {
        const items = (f.value ?? "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        if (items.length === 0) return `${col} IN ()`;
        const placeholders: string[] = [];
        for (const it of items) {
          params.push(coerce(it));
          placeholders.push(`$${params.length}`);
        }
        return `${col} IN (${placeholders.join(", ")})`;
      }
      params.push(coerce(f.value ?? ""));
      return `${col} ${f.op} $${params.length}`;
    });
    return `\nWHERE ${parts.join("\n  AND ")}`;
  };

  if (cfg.op === "select") {
    const cols =
      cfg.columns && cfg.columns.length > 0
        ? cfg.columns.map(quoteIdent).join(", ")
        : "*";
    let sql = `SELECT ${cols}\nFROM ${t}`;
    sql += renderWhere();
    if (cfg.orderBy?.column) {
      sql += `\nORDER BY ${quoteIdent(cfg.orderBy.column)} ${cfg.orderBy.direction.toUpperCase()}`;
    }
    if (cfg.limit && cfg.limit > 0) sql += `\nLIMIT ${cfg.limit}`;
    return { sql, params };
  }

  if (cfg.op === "insert") {
    const rows = (cfg.setValues ?? []).filter((s) => s.column);
    if (rows.length === 0) {
      return { sql: `INSERT INTO ${t} (-- adicione colunas) VALUES ()`, params };
    }
    const cols = rows.map((r) => quoteIdent(r.column)).join(", ");
    const placeholders = rows
      .map((r) => {
        params.push(coerce(r.value ?? ""));
        return `$${params.length}`;
      })
      .join(", ");
    let sql = `INSERT INTO ${t} (${cols})\nVALUES (${placeholders})`;
    if (cfg.returning !== false) sql += `\nRETURNING *`;
    return { sql, params };
  }

  if (cfg.op === "update") {
    const rows = (cfg.setValues ?? []).filter((s) => s.column);
    if (rows.length === 0) {
      return { sql: `UPDATE ${t} SET -- nada a atualizar`, params };
    }
    const sets = rows
      .map((r) => {
        params.push(coerce(r.value ?? ""));
        return `${quoteIdent(r.column)} = $${params.length}`;
      })
      .join(", ");
    let sql = `UPDATE ${t}\nSET ${sets}`;
    sql += renderWhere();
    if (cfg.returning !== false) sql += `\nRETURNING *`;
    return { sql, params };
  }

  // delete
  let sql = `DELETE FROM ${t}`;
  sql += renderWhere();
  if (cfg.returning !== false) sql += `\nRETURNING *`;
  return { sql, params };
}

function BuilderPane({
  values,
  onChange,
  schema,
}: {
  values: Record<string, unknown>;
  onChange: (patch: Record<string, unknown>) => void;
  schema: dbConnections.DatabaseSchema | null;
}) {
  const cfg = isBuilderConfig(values.builder) ? values.builder : DEFAULT_BUILDER;
  const table = cfg.table
    ? schema?.tables.find((t) => t.name === cfg.table && t.schema === "public") ?? null
    : null;
  const tableCols = table?.columns ?? [];

  // Persiste cfg e re-compila SQL+params toda vez que muda.
  const setCfg = (patch: Partial<BuilderConfig>) => {
    const next: BuilderConfig = { ...cfg, ...patch };
    const compiled = compileBuilder(next);
    onChange({ builder: next, query: compiled.sql, params: compiled.params });
  };

  const compiled = useMemo(() => compileBuilder(cfg), [cfg]);

  const toggleColumn = (name: string) => {
    const cur = new Set(cfg.columns ?? []);
    if (cur.has(name)) cur.delete(name);
    else cur.add(name);
    setCfg({ columns: [...cur] });
  };

  const addFilter = () => {
    const first = tableCols[0]?.name ?? "";
    setCfg({
      filters: [
        ...(cfg.filters ?? []),
        { id: newId(), column: first, op: "=", value: "" },
      ],
    });
  };
  const updateFilter = (id: string, patch: Partial<BuilderFilter>) => {
    setCfg({
      filters: (cfg.filters ?? []).map((f) => (f.id === id ? { ...f, ...patch } : f)),
    });
  };
  const removeFilter = (id: string) => {
    setCfg({ filters: (cfg.filters ?? []).filter((f) => f.id !== id) });
  };

  const addSetValue = () => {
    const first = tableCols[0]?.name ?? "";
    setCfg({
      setValues: [
        ...(cfg.setValues ?? []),
        { id: newId(), column: first, value: "" },
      ],
    });
  };
  const updateSetValue = (id: string, patch: Partial<BuilderSetValue>) => {
    setCfg({
      setValues: (cfg.setValues ?? []).map((s) =>
        s.id === id ? { ...s, ...patch } : s,
      ),
    });
  };
  const removeSetValue = (id: string) => {
    setCfg({ setValues: (cfg.setValues ?? []).filter((s) => s.id !== id) });
  };

  const showColumns = cfg.op === "select";
  const showSetValues = cfg.op === "insert" || cfg.op === "update";
  const showWhere = cfg.op === "select" || cfg.op === "update" || cfg.op === "delete";
  const showOrderLimit = cfg.op === "select";

  return (
    <div className="grid h-full min-h-[480px] grid-cols-[1fr_22rem] gap-3">
      {/* Builder controls */}
      <div className="flex min-h-0 flex-col gap-3 overflow-y-auto rounded-lg border border-border bg-muted/20 p-3">
        {/* Operação + Tabela */}
        <div className="grid grid-cols-2 gap-2">
          <div className="flex flex-col gap-1">
            <Label className="text-[11px] font-medium">
              <Wand2 className="mr-1 inline size-3" /> Operação
            </Label>
            <Select
              value={cfg.op}
              onValueChange={(v) => setCfg({ op: v as BuilderOp })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="select">SELECT</SelectItem>
                <SelectItem value="insert">INSERT</SelectItem>
                <SelectItem value="update">UPDATE</SelectItem>
                <SelectItem value="delete">DELETE</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-[11px] font-medium">
              <Table2 className="mr-1 inline size-3" /> Tabela
            </Label>
            <Select
              value={cfg.table ?? ""}
              onValueChange={(v) => setCfg({ table: v, columns: [] })}
              disabled={!schema}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione…" />
              </SelectTrigger>
              <SelectContent>
                {(schema?.tables ?? [])
                  .filter((t) => t.schema === "public")
                  .map((t) => (
                    <SelectItem key={t.name} value={t.name}>
                      {t.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {!cfg.table && (
          <div className="flex items-center gap-2 rounded-md border border-dashed border-border bg-background p-3 text-xs text-muted-foreground">
            <Info className="size-3.5" />
            Escolha uma tabela na lista ao lado pra começar a montar a query.
          </div>
        )}

        {/* SELECT — colunas */}
        {cfg.table && showColumns && (
          <BuilderSection
            icon={<ListChecks className="size-3.5" />}
            title="Colunas"
            hint={
              cfg.columns && cfg.columns.length > 0
                ? `${cfg.columns.length} selecionada(s)`
                : "vazio = SELECT *"
            }
          >
            <div className="grid grid-cols-2 gap-1">
              {tableCols.map((c) => {
                const checked = (cfg.columns ?? []).includes(c.name);
                return (
                  <label
                    key={c.name}
                    className={cn(
                      "flex cursor-pointer items-center gap-1.5 rounded border border-border bg-background px-2 py-1 text-xs",
                      checked && "border-primary/40 bg-primary/10",
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleColumn(c.name)}
                      className="accent-primary"
                    />
                    <span className="truncate font-mono">{c.name}</span>
                    <span className="ml-auto text-[10px] text-muted-foreground">
                      {c.dataType}
                    </span>
                  </label>
                );
              })}
            </div>
          </BuilderSection>
        )}

        {/* INSERT / UPDATE — SET values */}
        {cfg.table && showSetValues && (
          <BuilderSection
            icon={<Plus className="size-3.5" />}
            title={cfg.op === "insert" ? "Valores" : "SET"}
            hint={`${(cfg.setValues ?? []).length} campo(s)`}
            action={
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 gap-1 px-2 text-[11px]"
                onClick={addSetValue}
                disabled={tableCols.length === 0}
              >
                <Plus className="size-3" /> Add
              </Button>
            }
          >
            {(cfg.setValues ?? []).length === 0 ? (
              <p className="text-[11px] text-muted-foreground">Nenhum valor.</p>
            ) : (
              <div className="flex flex-col gap-1.5">
                {(cfg.setValues ?? []).map((s) => (
                  <div key={s.id} className="grid grid-cols-[1fr_2fr_auto] gap-1.5">
                    <Select
                      value={s.column}
                      onValueChange={(v) => updateSetValue(s.id, { column: v })}
                    >
                      <SelectTrigger className="h-8">
                        <SelectValue placeholder="coluna" />
                      </SelectTrigger>
                      <SelectContent>
                        {tableCols.map((c) => (
                          <SelectItem key={c.name} value={c.name}>
                            <span className="font-mono">{c.name}</span>
                            <span className="ml-1 text-[10px] text-muted-foreground">
                              {c.dataType}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      value={s.value}
                      onChange={(e) => updateSetValue(s.id, { value: e.target.value })}
                      placeholder="valor ou {{ input.x }}"
                      className="h-8 font-mono text-xs"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      className="text-destructive"
                      onClick={() => removeSetValue(s.id)}
                      aria-label="Remover"
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </BuilderSection>
        )}

        {/* WHERE */}
        {cfg.table && showWhere && (
          <BuilderSection
            icon={<Filter className="size-3.5" />}
            title="Filtros (WHERE)"
            hint={`${(cfg.filters ?? []).length} regra(s)`}
            action={
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 gap-1 px-2 text-[11px]"
                onClick={addFilter}
                disabled={tableCols.length === 0}
              >
                <Plus className="size-3" /> Add
              </Button>
            }
          >
            {(cfg.filters ?? []).length === 0 ? (
              <p className="text-[11px] text-muted-foreground">
                Sem filtros — atinge todas as linhas.
              </p>
            ) : (
              <div className="flex flex-col gap-1.5">
                {(cfg.filters ?? []).map((f) => {
                  const needsVal = operatorNeedsValue(f.op);
                  return (
                    <div
                      key={f.id}
                      className="grid grid-cols-[1fr_7rem_1.5fr_auto] gap-1.5"
                    >
                      <Select
                        value={f.column}
                        onValueChange={(v) => updateFilter(f.id, { column: v })}
                      >
                        <SelectTrigger className="h-8">
                          <SelectValue placeholder="coluna" />
                        </SelectTrigger>
                        <SelectContent>
                          {tableCols.map((c) => (
                            <SelectItem key={c.name} value={c.name}>
                              <span className="font-mono">{c.name}</span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Select
                        value={f.op}
                        onValueChange={(v) =>
                          updateFilter(f.id, { op: v as BuilderOperator })
                        }
                      >
                        <SelectTrigger className="h-8">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {OPERATORS.map((o) => (
                            <SelectItem key={o} value={o}>
                              {o}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Input
                        value={needsVal ? f.value : ""}
                        onChange={(e) => updateFilter(f.id, { value: e.target.value })}
                        placeholder={needsVal ? "valor ou {{ input.x }}" : "(n/a)"}
                        disabled={!needsVal}
                        className="h-8 font-mono text-xs"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        className="text-destructive"
                        onClick={() => removeFilter(f.id)}
                        aria-label="Remover"
                      >
                        <X className="size-3.5" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </BuilderSection>
        )}

        {/* ORDER BY / LIMIT */}
        {cfg.table && showOrderLimit && (
          <BuilderSection
            icon={<ArrowDownAZ className="size-3.5" />}
            title="Ordenação & Limite"
          >
            <div className="grid grid-cols-[1fr_6rem_6rem] gap-1.5">
              <Select
                value={cfg.orderBy?.column ?? "__none__"}
                onValueChange={(v) =>
                  setCfg({
                    orderBy:
                      v === "__none__"
                        ? null
                        : {
                            column: v,
                            direction: cfg.orderBy?.direction ?? "asc",
                          },
                  })
                }
              >
                <SelectTrigger className="h-8">
                  <SelectValue placeholder="coluna" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">(nenhuma)</SelectItem>
                  {tableCols.map((c) => (
                    <SelectItem key={c.name} value={c.name}>
                      <span className="font-mono">{c.name}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={cfg.orderBy?.direction ?? "asc"}
                onValueChange={(v) =>
                  cfg.orderBy &&
                  setCfg({
                    orderBy: { ...cfg.orderBy, direction: v as "asc" | "desc" },
                  })
                }
                disabled={!cfg.orderBy}
              >
                <SelectTrigger className="h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="asc">
                    <ArrowUpAZ className="mr-1 inline size-3" /> asc
                  </SelectItem>
                  <SelectItem value="desc">
                    <ArrowDownAZ className="mr-1 inline size-3" /> desc
                  </SelectItem>
                </SelectContent>
              </Select>
              <Input
                type="number"
                min={0}
                value={cfg.limit ?? ""}
                placeholder="LIMIT"
                onChange={(e) =>
                  setCfg({
                    limit: e.target.value === "" ? null : Number(e.target.value),
                  })
                }
                className="h-8"
              />
            </div>
          </BuilderSection>
        )}
      </div>

      {/* Preview SQL + params */}
      <aside className="flex min-h-0 flex-col gap-2 overflow-hidden rounded-lg border border-border">
        <div className="flex items-center gap-2 border-b border-border bg-muted/40 px-3 py-1.5 text-[11px] text-muted-foreground">
          <Code2 className="size-3.5" />
          <span>SQL gerado</span>
          <Badge variant="outline" className="ml-auto h-4 px-1 text-[10px]">
            {compiled.params.length} param(s)
          </Badge>
        </div>
        <div className="min-h-0 flex-1">
          <Suspense
            fallback={
              <pre className="h-full w-full overflow-auto bg-zinc-950 p-3 font-mono text-xs text-zinc-100">
                {compiled.sql}
              </pre>
            }
          >
            <MonacoEditor
              height="100%"
              defaultLanguage="sql"
              language="sql"
              theme="vs-dark"
              value={compiled.sql}
              options={{ ...MONACO_OPTIONS, readOnly: true }}
            />
          </Suspense>
        </div>
        <div className="border-t border-border bg-muted/30 p-2">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Parâmetros
          </div>
          {compiled.params.length === 0 ? (
            <p className="mt-1 text-[11px] italic text-muted-foreground">vazio</p>
          ) : (
            <ol className="mt-1 space-y-0.5 font-mono text-[11px]">
              {compiled.params.map((p, i) => (
                <li key={i} className="flex gap-1.5">
                  <span className="text-muted-foreground">${i + 1}</span>
                  <span className="truncate">{JSON.stringify(p)}</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      </aside>
    </div>
  );
}

function BuilderSection({
  icon,
  title,
  hint,
  action,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  hint?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-md border border-border bg-background p-2">
      <header className="mb-2 flex items-center gap-1.5 text-xs font-medium">
        {icon}
        <span>{title}</span>
        {hint && (
          <span className="text-[10px] font-normal text-muted-foreground">· {hint}</span>
        )}
        {action && <span className="ml-auto">{action}</span>}
      </header>
      {children}
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

function buildSampleCtx(pins: Record<string, Record<string, unknown>>): Record<string, unknown> {
  if (Object.keys(pins).length === 0) return DEFAULT_SAMPLE_CONTEXT;
  return { input: {}, vars: {}, env: {}, steps: { ...pins } };
}

function buildDts(
  ctx: Record<string, unknown>,
  schema?: dbConnections.DatabaseSchema | null,
): string {
  const inputType = inferTsType(ctx.input);
  const varsType = inferTsType(ctx.vars);
  const stepsType = inferTsType(ctx.steps);
  const schemaBlock = schema ? buildSchemaDts(schema) : "";
  return `${DRIZZLE_DTS_BASE}

interface ExecutionContext {
  input: ${inputType};
  vars: ${varsType};
  env: Record<string, string>;
  steps: ${stepsType};
}
${schemaBlock}
`;
}

/**
 * Gera namespace `schema` com uma constante por tabela introspectada.
 * Cada tabela vira `pgTable(...)` tipado; o usuário escreve
 * `db.select().from(schema.users).where(eq(schema.users.id, ...))` e o
 * Monaco oferece autocomplete das colunas reais.
 */
function buildSchemaDts(schema: dbConnections.DatabaseSchema): string {
  if (schema.tables.length === 0) return "";

  // Apenas tabelas no schema "public" pra evitar conflito de nome — outros
  // schemas ficam fora do autocomplete por agora.
  const visible = schema.tables.filter((t) => t.schema === "public");
  if (visible.length === 0) return "";

  const tables = visible
    .map((t) => {
      const cols = t.columns
        .map((c) => `    ${safeIdent(c.name)}: { name: "${c.name}"; type: ${jsTypeToTs(c.jsType, c.nullable)} }`)
        .join(";\n");
      return `  /** ${t.columns.length} colunas. */\n  ${safeIdent(t.name)}: {\n${cols};\n  }`;
    })
    .join(";\n");

  return `
/** Tabelas introspectadas da connection. Use em modo ORM:
 *   const rows = await db.select().from(schema.users).where(...)
 */
declare const schema: {
${tables};
};
`;
}

function jsTypeToTs(
  js: dbConnections.SchemaColumn["jsType"],
  nullable: boolean,
): string {
  const base =
    js === "string"
      ? "string"
      : js === "number"
        ? "number"
        : js === "boolean"
          ? "boolean"
          : js === "date"
            ? "Date | string"
            : js === "json"
              ? "any"
              : "any";
  return nullable ? `${base} | null` : base;
}

/** Sanitiza identificadores pra evitar quebras de sintaxe TS quando a coluna tem caracteres inválidos. */
function safeIdent(name: string): string {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(name) ? name : JSON.stringify(name);
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

function tryParseJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
}

function safeStringify(v: unknown): string {
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}
