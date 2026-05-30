/**
 * Painel dedicado pro nó `chat_memory`. Seções:
 *
 *   Operação    — load / append, campos dinâmicos
 *   Conexão     — connectionString + tabela + schema esperado
 *   Teste       — dispara dry-run com environment selecionado
 *   Histórico   — últimas execuções deste node em runs reais
 *
 * Persiste em `values`:
 *   connectionString: string
 *   table?: string                — default "chat_messages"
 *   sessionId: string
 *   operation: "load" | "append"
 *
 *   load:
 *     limit?: number              — default 20, max 500
 *
 *   append:
 *     role: "user" | "assistant" | "system"
 *     content: string
 */
import { useMemo, useState } from "react";
import { useFieldError } from "./use-field-error";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Download,
  History,
  Loader2,
  MessageSquare,
  RefreshCw,
  Send,
  Settings2,
  Upload,
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

import { useWorkflowId } from "../workflow-context";
import type { CustomPanelProps } from "./types";

type Operation = "load" | "append";
type Role = "user" | "assistant" | "system";

const OPERATIONS: { value: Operation; label: string; icon: typeof Download; hint: string }[] = [
  { value: "load", label: "LOAD — carregar histórico", icon: Download, hint: "Devolve as últimas N mensagens da sessão (cronológico, mais antigas primeiro)." },
  { value: "append", label: "APPEND — gravar mensagem", icon: Upload, hint: "Grava uma mensagem (role + content) na sessão." },
];

const ROLES: { value: Role; label: string }[] = [
  { value: "user", label: "user" },
  { value: "assistant", label: "assistant" },
  { value: "system", label: "system" },
];

const SECTIONS = [
  { id: "operation", label: "Operação", icon: MessageSquare },
  { id: "connection", label: "Conexão", icon: Settings2 },
  { id: "test", label: "Teste", icon: Send },
  { id: "history", label: "Histórico", icon: History },
] as const satisfies ReadonlyArray<SectionItem>;

type SectionId = (typeof SECTIONS)[number]["id"];

function readString(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}
function readNumber(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}
function readOperation(v: unknown): Operation {
  return v === "append" ? "append" : "load";
}
function readRole(v: unknown): Role {
  return v === "assistant" || v === "system" ? v : "user";
}

export function ChatMemoryPanel({ values, onChange, onError, nodeId }: CustomPanelProps) {
  const [section, setSection] = useState<SectionId>("operation");
  const workflowId = useWorkflowId() ?? "";

  const op = readOperation(values.operation);
  const connectionString = readString(values.connectionString);
  const sessionId = readString(values.sessionId);
  const content = readString(values.content);

  const connMissing = connectionString.trim() === "";
  const sessionMissing = sessionId.trim() === "";
  const contentMissing = op === "append" && content.trim() === "";

  useFieldError(onError, "connectionString", connMissing ? "Informe a connection string." : null);
  useFieldError(onError, "sessionId", sessionMissing ? "Informe o sessionId." : null);
  useFieldError(onError, "content", contentMissing ? "Informe o conteúdo." : null);

  function set(patch: Record<string, unknown>) {
    onChange(patch);
  }

  return (
    <Sections
      sections={SECTIONS as unknown as SectionItem<SectionId>[]}
      value={section}
      onValueChange={setSection}
      ariaLabel="Seções do nó Chat Memory"
    >
      {section === "operation" && (
        <OperationSection op={op} values={values} onSet={set} contentMissing={contentMissing} sessionMissing={sessionMissing} />
      )}
      {section === "connection" && (
        <ConnectionSection values={values} onSet={set} connMissing={connMissing} />
      )}
      {section === "test" && (
        <TestSection workflowId={workflowId} nodeId={nodeId} values={values} />
      )}
      {section === "history" && (
        <HistorySection workflowId={workflowId} nodeId={nodeId} />
      )}
    </Sections>
  );
}

/* -------------------------------------------------------------------------- */
/* Operação                                                                   */
/* -------------------------------------------------------------------------- */

function OperationSection({
  op,
  values,
  onSet,
  contentMissing,
  sessionMissing,
}: {
  op: Operation;
  values: Record<string, unknown>;
  onSet: (patch: Record<string, unknown>) => void;
  contentMissing: boolean;
  sessionMissing: boolean;
}) {
  return (
    <div className="space-y-4">
      <SectionHeader title="Operação" hint="Load lê histórico da sessão; append grava nova mensagem." />

      <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
        {OPERATIONS.map((o) => {
          const Icon = o.icon;
          const active = o.value === op;
          return (
            <button
              key={o.value}
              type="button"
              onClick={() => onSet({ operation: o.value })}
              className={cn(
                "flex items-start gap-2 rounded-md border px-2.5 py-2 text-left transition-colors",
                active
                  ? "border-primary bg-primary/10"
                  : "border-border bg-background hover:border-primary/40",
              )}
            >
              <Icon className={cn("mt-0.5 size-4 shrink-0", active ? "text-primary" : "text-muted-foreground")} />
              <div className="min-w-0">
                <p className={cn("text-[12px] font-medium", active && "text-primary")}>{o.label}</p>
                <p className="text-[10px] text-muted-foreground">{o.hint}</p>
              </div>
            </button>
          );
        })}
      </div>

      <FieldRow
        label="Session ID"
        hint="Identificador da conversa. Geralmente vem do trigger — ex: {{input.userId}} ou {{input.chatId}}."
        error={sessionMissing ? "Obrigatório." : null}
      >
        <Input
          value={readString(values.sessionId)}
          onChange={(e) => onSet({ sessionId: e.target.value })}
          placeholder="{{input.userId}}"
          className="font-mono text-xs"
        />
      </FieldRow>

      {op === "load" ? (
        <FieldRow label="Limite" hint="Últimas N mensagens. Default 20, máximo 500.">
          <Input
            type="number"
            min={1}
            max={500}
            value={readNumber(values.limit) ?? ""}
            onChange={(e) => onSet({ limit: e.target.value === "" ? undefined : Number(e.target.value) })}
            className="font-mono text-xs"
            placeholder="20"
          />
        </FieldRow>
      ) : (
        <>
          <FieldRow label="Role" hint="Quem está falando — user / assistant / system.">
            <Select value={readRole(values.role)} onValueChange={(v) => onSet({ role: v })}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLES.map((r) => (
                  <SelectItem key={r.value} value={r.value}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FieldRow>

          <FieldRow
            label="Conteúdo"
            hint="Texto da mensagem. Para append da resposta do LLM, use {{steps.chat.message}}."
            error={contentMissing ? "Obrigatório." : null}
          >
            <Textarea
              rows={4}
              spellCheck={false}
              value={readString(values.content)}
              onChange={(e) => onSet({ content: e.target.value })}
              className="font-mono text-xs"
              placeholder="{{steps.chat.message}}"
            />
          </FieldRow>
        </>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Conexão                                                                    */
/* -------------------------------------------------------------------------- */

function ConnectionSection({
  values,
  onSet,
  connMissing,
}: {
  values: Record<string, unknown>;
  onSet: (patch: Record<string, unknown>) => void;
  connMissing: boolean;
}) {
  const table = readString(values.table) || "chat_messages";

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Conexão"
        hint="Postgres externo (não pode ser o DB do app). Pode ser o mesmo do vector_store."
      />

      <FieldRow
        label="Connection string"
        hint="Recomendado: {{env.MEMORY_DB_URL}} ou {{env.DATABASE_VECTOR_STORE_URL}} se compartilharem."
        error={connMissing ? "Obrigatório." : null}
      >
        <Input
          value={readString(values.connectionString)}
          onChange={(e) => onSet({ connectionString: e.target.value })}
          placeholder="{{env.MEMORY_DB_URL}}"
          className="font-mono text-xs"
        />
      </FieldRow>

      <FieldRow label="Tabela" hint="Default `chat_messages`. Identificador SQL válido (letras/dígitos/_).">
        <Input
          value={readString(values.table)}
          onChange={(e) => onSet({ table: e.target.value })}
          placeholder="chat_messages"
          className="font-mono text-xs"
        />
      </FieldRow>

      <div className="space-y-1.5 rounded-md border border-dashed border-border bg-muted/20 p-2.5">
        <p className="text-[11px] font-medium">Schema esperado da tabela</p>
        <pre className="overflow-x-auto rounded-md border border-border bg-background/60 p-2 font-mono text-[10px] leading-relaxed">
{`CREATE TABLE "${table}" (
  id          bigserial PRIMARY KEY,
  session_id  text NOT NULL,
  role        text NOT NULL CHECK (role IN ('user','assistant','system')),
  content     text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ON "${table}" (session_id, created_at DESC);`}
        </pre>
        <p className="text-[10px] text-muted-foreground">
          O índice composto é o que faz o LOAD ser barato quando a tabela cresce — sem ele, cada
          load varre tudo da sessão. O LOAD devolve em ordem cronológica (mais antigas primeiro)
          mesmo que a query use <code>DESC LIMIT</code>.
        </p>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Teste                                                                      */
/* -------------------------------------------------------------------------- */

function TestSection({
  workflowId,
  nodeId,
  values,
}: {
  workflowId: string;
  nodeId?: string;
  values: Record<string, unknown>;
}) {
  const [environmentId, setEnvironmentId] = useState<string | null>(null);
  const [inputText, setInputText] = useState("{}");
  const [inputErr, setInputErr] = useState<string | null>(null);

  const envQuery = useQuery({
    queryKey: queryKeys.environments.list(),
    queryFn: () => environmentsApi.list(),
  });

  const mutation = useMutation({
    mutationFn: () => {
      let parsed: Record<string, unknown> = {};
      const t = inputText.trim();
      if (t) parsed = JSON.parse(t) as Record<string, unknown>;
      return nodesApi.dryRunChatMemory(workflowId, nodeId!, {
        config: values,
        input: parsed,
        environmentId,
      });
    },
  });

  if (!workflowId || !nodeId) {
    return <EmptyHint>Salve o workflow antes de testar — o teste depende do nodeId.</EmptyHint>;
  }

  function run() {
    setInputErr(null);
    const t = inputText.trim();
    if (t) {
      try {
        JSON.parse(t);
      } catch (err) {
        setInputErr((err as Error).message);
        return;
      }
    }
    mutation.mutate();
  }

  const result = mutation.data;
  const op = readOperation(values.operation);

  return (
    <div className="space-y-3">
      <SectionHeader
        title="Disparar agora"
        hint="Executa o handler com env vars decriptadas. Sem persistir step."
      />

      <FieldRow label="Environment" hint="De onde vem MEMORY_DB_URL (ou afim). Sem environment → roda com env vazio.">
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

      <FieldRow label="Input simulado (JSON)" hint="Vira o {{input}} do template — útil se sessionId ou content vierem do input.">
        <Textarea
          rows={4}
          spellCheck={false}
          className="font-mono text-[11px]"
          value={inputText}
          onChange={(e) => {
            setInputText(e.target.value);
            if (inputErr) setInputErr(null);
          }}
        />
        {inputErr && <p className="text-[10px] text-destructive">JSON inválido: {inputErr}</p>}
      </FieldRow>

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
          <p className="mt-0.5 break-words text-[11px] text-destructive/90">{result.error}</p>
          <p className="mt-1 text-[10px] text-muted-foreground">{result.durationMs}ms</p>
        </div>
      )}

      {result && result.ok && <ResultView output={result.output} durationMs={result.durationMs} operation={op} />}
    </div>
  );
}

function ResultView({
  output,
  durationMs,
  operation,
}: {
  output: Record<string, unknown>;
  durationMs: number;
  operation: Operation;
}) {
  if (operation === "load") {
    const messages = Array.isArray(output.messages)
      ? (output.messages as Array<Record<string, unknown>>)
      : [];
    return (
      <div className="space-y-2 rounded-md border border-emerald-500/40 bg-emerald-500/5 p-2">
        <div className="flex items-center justify-between text-[11px]">
          <span className="font-medium text-emerald-600">{messages.length} mensagem(ns)</span>
          <span className="text-[10px] tabular-nums text-muted-foreground">{durationMs}ms</span>
        </div>
        {messages.length === 0 ? (
          <p className="px-1 text-[10px] text-muted-foreground">(histórico vazio para essa sessão)</p>
        ) : (
          <div className="max-h-80 space-y-1.5 overflow-auto pr-1">
            {messages.map((m, i) => (
              <MessageBubble key={i} role={readString(m.role)} content={readString(m.content)} createdAt={m.createdAt} />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-md border border-emerald-500/40 bg-emerald-500/5 p-2">
      <div className="flex items-center justify-between text-[11px]">
        <span className="font-medium text-emerald-600">Mensagem gravada</span>
        <span className="text-[10px] tabular-nums text-muted-foreground">{durationMs}ms</span>
      </div>
    </div>
  );
}

function MessageBubble({ role, content, createdAt }: { role: string; content: string; createdAt: unknown }) {
  const tone =
    role === "assistant"
      ? "border-sky-500/40 bg-sky-500/5"
      : role === "system"
        ? "border-amber-500/40 bg-amber-500/5"
        : "border-border bg-background";
  const when = typeof createdAt === "string" ? new Date(createdAt).toLocaleString("pt-BR") : "";
  return (
    <div className={cn("rounded-md border px-2 py-1.5", tone)}>
      <div className="flex items-center justify-between gap-2 text-[10px]">
        <span className="font-mono uppercase tracking-wide text-muted-foreground">{role}</span>
        {when && <span className="tabular-nums text-muted-foreground">{when}</span>}
      </div>
      <p className="mt-1 whitespace-pre-wrap break-words text-[11px]">{content}</p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Histórico                                                                  */
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
      <div className="flex items-start justify-between gap-2">
        <SectionHeader title="Últimas execuções" hint={`As ${limit} chamadas mais recentes deste node em runs reais.`} />
        <Button
          size="sm"
          variant="ghost"
          onClick={() => query.refetch()}
          disabled={query.isFetching}
          className="h-7 px-2 text-[11px]"
        >
          <RefreshCw className={cn("size-3.5", query.isFetching && "animate-spin")} />
          Atualizar
        </Button>
      </div>

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
      const out = inv.output as Record<string, unknown>;
      if (Array.isArray(out.messages)) return `${out.messages.length} msg(s) carregada(s)`;
      if (out.appended === true) return "mensagem gravada";
      return safeStringify(out).slice(0, 90);
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
/* Helpers visuais                                                            */
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

function safeStringify(v: unknown): string {
  if (v === undefined || v === null) return "";
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}

