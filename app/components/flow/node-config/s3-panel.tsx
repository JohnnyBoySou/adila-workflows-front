/**
 * Painel dedicado pro nó `s3`. Substitui o renderer genérico por uma UI
 * com seções: Operação, Conexão, Teste e Histórico.
 *
 * Persiste em `values`:
 *   operation: "get" | "put" | "delete" | "list" | "head"
 *   bucket?: string                  — override do env AWS_S3_BUCKET_NAME
 *   key?: string                     — get/put/delete/head
 *   prefix?: string                  — list
 *   value?: string                   — put
 *   contentType?: string             — put (default text/plain)
 *   region?: string                  — override
 *   endpoint?: string                — override (R2/MinIO/Spaces)
 *
 * Credenciais nunca vão pra config — sempre via env vars do environment.
 */
import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Eye,
  History,
  KeyRound,
  List,
  Loader2,
  RefreshCw,
  Send,
  Settings2,
  Trash2,
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

type Operation = "get" | "put" | "delete" | "list" | "head";

const OPERATIONS: { value: Operation; label: string; icon: typeof KeyRound; hint: string }[] = [
  { value: "get", label: "GET — baixar objeto", icon: ArrowDownToLine, hint: "Lê o objeto e devolve o conteúdo." },
  { value: "put", label: "PUT — enviar objeto", icon: ArrowUpFromLine, hint: "Grava o conteúdo informado na key." },
  { value: "delete", label: "DELETE — apagar", icon: Trash2, hint: "Remove o objeto. Não devolve conteúdo." },
  { value: "list", label: "LIST — listar prefixo", icon: List, hint: "Lista as keys que começam com o prefixo." },
  { value: "head", label: "HEAD — metadados", icon: Eye, hint: "Só verifica existência + metadados (sem baixar body)." },
];

const SECTIONS = [
  { id: "operation", label: "Operação", icon: KeyRound },
  { id: "connection", label: "Conexão", icon: Settings2 },
  { id: "test", label: "Teste", icon: Send },
  { id: "history", label: "Histórico", icon: History },
] as const satisfies ReadonlyArray<SectionItem>;

type SectionId = (typeof SECTIONS)[number]["id"];

function readString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function readOperation(v: unknown): Operation {
  if (v === "get" || v === "put" || v === "delete" || v === "list" || v === "head") return v;
  return "get";
}

export function S3Panel({ values, onChange, onError, nodeId }: CustomPanelProps) {
  const [section, setSection] = useState<SectionId>("operation");
  const workflowId = useWorkflowId() ?? "";

  const op = readOperation(values.operation);
  const key = readString(values.key);
  const value = readString(values.value);

  // Validações leves — travam o Salvar.
  const requiresKey = op === "get" || op === "put" || op === "delete" || op === "head";
  const keyMissing = requiresKey && key.trim() === "";
  const valueMissing = op === "put" && value === "";

  function set(patch: Record<string, unknown>) {
    onChange(patch);
  }

  // Reporta validação no ciclo render — onError tolera chamadas síncronas.
  onError?.("key", keyMissing ? "Informe a key." : null);
  onError?.("value", valueMissing ? "Informe o conteúdo (value)." : null);

  return (
    <Sections sections={SECTIONS as unknown as SectionItem<SectionId>[]} value={section} onValueChange={setSection} ariaLabel="Seções do nó S3">
      {section === "operation" && (
        <OperationSection
          op={op}
          values={values}
          onSetOp={(next) => set({ operation: next })}
          onSet={set}
          keyMissing={keyMissing}
          valueMissing={valueMissing}
        />
      )}
      {section === "connection" && <ConnectionSection values={values} onSet={set} />}
      {section === "test" && <TestSection workflowId={workflowId} nodeId={nodeId} values={values} />}
      {section === "history" && <HistorySection workflowId={workflowId} nodeId={nodeId} />}
    </Sections>
  );
}

/* -------------------------------------------------------------------------- */
/* Operação                                                                   */
/* -------------------------------------------------------------------------- */

function OperationSection({
  op,
  values,
  onSetOp,
  onSet,
  keyMissing,
  valueMissing,
}: {
  op: Operation;
  values: Record<string, unknown>;
  onSetOp: (next: Operation) => void;
  onSet: (patch: Record<string, unknown>) => void;
  keyMissing: boolean;
  valueMissing: boolean;
}) {
  const meta = OPERATIONS.find((o) => o.value === op)!;

  return (
    <div className="space-y-4">
      <SectionHeader title="Operação" hint="Escolha o que o nó faz no bucket." />

      <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
        {OPERATIONS.map((o) => {
          const Icon = o.icon;
          const active = o.value === op;
          return (
            <button
              key={o.value}
              type="button"
              onClick={() => onSetOp(o.value)}
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

      <div className="rounded-md border border-dashed border-border bg-muted/20 p-2.5">
        <p className="text-[10px] text-muted-foreground">{meta.hint}</p>
      </div>

      {(op === "get" || op === "put" || op === "delete" || op === "head") && (
        <FieldRow label="Key" hint="Caminho completo do objeto no bucket. Suporta `{{ … }}`." error={keyMissing ? "Obrigatório." : null}>
          <Input
            value={readString(values.key)}
            onChange={(e) => onSet({ key: e.target.value })}
            placeholder="reports/2025/january.pdf"
            className="font-mono text-xs"
          />
        </FieldRow>
      )}

      {op === "list" && (
        <FieldRow label="Prefix" hint="Filtra keys que começam com este prefixo. Vazio = listar tudo (até 1000).">
          <Input
            value={readString(values.prefix)}
            onChange={(e) => onSet({ prefix: e.target.value })}
            placeholder="reports/2025/"
            className="font-mono text-xs"
          />
        </FieldRow>
      )}

      {op === "put" && (
        <>
          <FieldRow label="Conteúdo (value)" hint="Texto bruto. Use `{{steps.X.body}}` pra encadear de outro nó." error={valueMissing ? "Obrigatório." : null}>
            <Textarea
              rows={4}
              value={readString(values.value)}
              onChange={(e) => onSet({ value: e.target.value })}
              spellCheck={false}
              className="font-mono text-xs"
              placeholder="Hello, world!"
            />
          </FieldRow>
          <FieldRow label="Content-Type" hint="MIME type. Default: text/plain.">
            <Input
              value={readString(values.contentType)}
              onChange={(e) => onSet({ contentType: e.target.value })}
              placeholder="application/json"
              className="font-mono text-xs"
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
}: {
  values: Record<string, unknown>;
  onSet: (patch: Record<string, unknown>) => void;
}) {
  return (
    <div className="space-y-4">
      <SectionHeader
        title="Conexão"
        hint="Credenciais e bucket default vêm das variáveis de ambiente do workflow. Os campos abaixo só sobrescrevem caso necessário."
      />

      <div className="space-y-1.5 rounded-md border border-dashed border-border bg-muted/20 p-2.5">
        <p className="text-[11px] font-medium">Env vars esperadas no environment</p>
        <ul className="space-y-0.5 text-[10px] text-muted-foreground">
          <li><code className="rounded bg-muted px-1">AWS_S3_BUCKET_NAME</code> — bucket default</li>
          <li><code className="rounded bg-muted px-1">AWS_DEFAULT_REGION</code> — região (default us-east-1)</li>
          <li><code className="rounded bg-muted px-1">AWS_ENDPOINT_URL</code> — opcional (R2/MinIO/Spaces)</li>
          <li><code className="rounded bg-muted px-1">AWS_ACCESS_KEY_ID</code> + <code className="rounded bg-muted px-1">AWS_SECRET_ACCESS_KEY</code></li>
          <li><code className="rounded bg-muted px-1">AWS_S3_FORCE_PATH_STYLE</code> — <code>"true"</code> ativa path-style (MinIO)</li>
        </ul>
        <p className="pt-1 text-[10px] text-muted-foreground">
          Crie em <strong>Environments → Variáveis</strong>. Marque chaves de acesso como secretas.
        </p>
      </div>

      <FieldRow label="Bucket (override)" hint="Sobrescreve AWS_S3_BUCKET_NAME só pra este nó.">
        <Input
          value={readString(values.bucket)}
          onChange={(e) => onSet({ bucket: e.target.value })}
          placeholder="(usa o do environment)"
          className="font-mono text-xs"
        />
      </FieldRow>

      <FieldRow label="Region (override)" hint="Ex: us-east-1, sa-east-1, auto (R2).">
        <Input
          value={readString(values.region)}
          onChange={(e) => onSet({ region: e.target.value })}
          placeholder="(usa o do environment)"
          className="font-mono text-xs"
        />
      </FieldRow>

      <FieldRow label="Endpoint (override)" hint="Útil pra R2 / MinIO / DigitalOcean Spaces.">
        <Input
          value={readString(values.endpoint)}
          onChange={(e) => onSet({ endpoint: e.target.value })}
          placeholder="https://<account>.r2.cloudflarestorage.com"
          className="font-mono text-xs"
        />
      </FieldRow>
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
      return nodesApi.dryRunS3(workflowId, nodeId!, {
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

  return (
    <div className="space-y-3">
      <SectionHeader
        title="Disparar agora"
        hint="Executa a operação no S3 sem persistir step. Use um environment com credenciais válidas."
      />

      <FieldRow label="Environment" hint="De onde virão AWS_ACCESS_KEY_ID etc. Sem environment → roda com env vazio.">
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

      <FieldRow label="Input simulado (JSON)" hint="Disponível como {{input.x}} nos campos.">
        <Textarea
          rows={3}
          spellCheck={false}
          className="font-mono text-[11px]"
          value={inputText}
          onChange={(e) => {
            setInputText(e.target.value);
            if (inputErr) setInputErr(null);
          }}
          placeholder='{ "userId": "abc" }'
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

      {result && result.ok && (
        <ResultView output={result.output} durationMs={result.durationMs} operation={readOperation(values.operation)} />
      )}
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
  if (operation === "list") {
    const keys = Array.isArray(output.keys) ? (output.keys as Array<Record<string, unknown>>) : [];
    return (
      <div className="space-y-2 rounded-md border border-emerald-500/40 bg-emerald-500/5 p-2">
        <div className="flex items-center justify-between text-[11px]">
          <span className="font-medium text-emerald-600">{keys.length} objeto(s)</span>
          <span className="text-[10px] tabular-nums text-muted-foreground">{durationMs}ms</span>
        </div>
        {keys.length === 0 ? (
          <p className="px-1 text-[10px] text-muted-foreground">(prefixo vazio)</p>
        ) : (
          <div className="max-h-72 overflow-auto rounded-md border border-border bg-background">
            <table className="w-full text-[11px]">
              <thead className="bg-muted/40 text-[10px] uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-2 py-1 text-left">Key</th>
                  <th className="px-2 py-1 text-right">Tamanho</th>
                  <th className="px-2 py-1 text-left">Modificado</th>
                </tr>
              </thead>
              <tbody>
                {keys.map((k, i) => (
                  <tr key={i} className="border-t border-border/60">
                    <td className="px-2 py-1 font-mono text-[10px]">{String(k.key ?? "")}</td>
                    <td className="px-2 py-1 text-right tabular-nums text-muted-foreground">
                      {typeof k.size === "number" ? formatBytes(k.size) : "—"}
                    </td>
                    <td className="px-2 py-1 text-muted-foreground">
                      {typeof k.lastModified === "string"
                        ? new Date(k.lastModified).toLocaleString("pt-BR")
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {output.isTruncated === true && (
          <p className="text-[10px] text-amber-700 dark:text-amber-400">
            Listagem truncada (mais de 1000 objetos). Refine o prefix.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded-md border border-emerald-500/40 bg-emerald-500/5 p-2">
      <div className="flex items-center justify-between text-[11px]">
        <span className="font-medium text-emerald-600">OK</span>
        <span className="text-[10px] tabular-nums text-muted-foreground">{durationMs}ms</span>
      </div>
      <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-md border border-border bg-background/60 p-2 font-mono text-[10px] leading-relaxed">
        {safeStringify(output)}
      </pre>
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
      if (Array.isArray(out.keys)) return `${out.keys.length} key(s)`;
      if (typeof out.etag === "string") return `etag ${out.etag.slice(0, 14)}`;
      if (out.deleted === true) return "deleted";
      const s = safeStringify(out);
      return s.length > 80 ? `${s.slice(0, 80)}…` : s;
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
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
