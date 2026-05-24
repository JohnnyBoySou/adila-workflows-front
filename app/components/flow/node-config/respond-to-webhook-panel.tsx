/**
 * Painel dedicado pro nó `respond_to_webhook`. Seções:
 *
 *   Resposta   — status, headers (kv), body (json/text)
 *   Preview    — renderiza a resposta resolvida + amostra cURL
 *   Histórico  — últimas execuções (status devolvido)
 *
 * O handler retorna `{ __webhookResponse: { status, headers, body } }`.
 * Só faz efeito quando o trigger está em `responseMode: "sync"`.
 */
import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Eye, History, Loader2, Send } from "lucide-react";

import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Sections, type SectionItem } from "~/components/ui/sections";
import { Textarea } from "~/components/ui/textarea";
import { cn } from "~/lib/utils";
import { queryKeys } from "~/lib/query-keys";
import * as nodesApi from "~/services/workflow-nodes";
import type { NodeInvocation } from "~/services/workflow-nodes";

import { useWorkflowId } from "../workflow-context";
import type { CustomPanelProps } from "./types";

const SECTIONS = [
  { id: "response", label: "Resposta", icon: Send },
  { id: "preview", label: "Preview", icon: Eye },
  { id: "history", label: "Histórico", icon: History },
] as const satisfies ReadonlyArray<SectionItem>;

type SectionId = (typeof SECTIONS)[number]["id"];

const STATUS_PRESETS = [200, 201, 202, 204, 301, 400, 401, 403, 404, 422, 500];

const COMMON_HEADERS = [
  { name: "Content-Type", value: "application/json" },
  { name: "Cache-Control", value: "no-store" },
  { name: "X-Request-Id", value: "{{ steps.start.requestId }}" },
];

function statusFamily(code: number): string {
  if (code >= 200 && code < 300) return "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400";
  if (code >= 300 && code < 400) return "border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-400";
  if (code >= 400 && code < 500) return "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400";
  return "border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-400";
}

export function RespondToWebhookPanel({ values, onChange, onError, nodeId }: CustomPanelProps) {
  const [section, setSection] = useState<SectionId>("response");
  const workflowId = useWorkflowId() ?? "";

  const statusValid =
    typeof values.status !== "number" || (values.status >= 100 && values.status < 600);
  onError?.("status", statusValid ? null : "Status fora de 100–599.");

  return (
    <Sections
      sections={SECTIONS as unknown as SectionItem<SectionId>[]}
      value={section}
      onValueChange={setSection}
      ariaLabel="Seções do nó Respond to Webhook"
    >
      {section === "response" && <ResponseSection values={values} onChange={onChange} />}
      {section === "preview" && <PreviewSection workflowId={workflowId} nodeId={nodeId} values={values} />}
      {section === "history" && <HistorySection workflowId={workflowId} nodeId={nodeId} />}
    </Sections>
  );
}

/* -------------------------------------------------------------------------- */
/* Resposta                                                                   */
/* -------------------------------------------------------------------------- */

function ResponseSection({
  values,
  onChange,
}: {
  values: Record<string, unknown>;
  onChange: (patch: Record<string, unknown>) => void;
}) {
  const status = typeof values.status === "number" ? values.status : 200;
  const headers = (values.headers as Record<string, string>) ?? {};
  const bodyRaw =
    values.body === undefined
      ? ""
      : typeof values.body === "string"
        ? values.body
        : JSON.stringify(values.body, null, 2);

  function setStatus(n: number) {
    onChange({ status: n });
  }
  function setHeader(oldKey: string, newKey: string) {
    const next: Record<string, string> = {};
    for (const [k, v] of Object.entries(headers)) next[k === oldKey ? newKey : k] = v;
    onChange({ headers: next });
  }
  function setHeaderValue(k: string, v: string) {
    onChange({ headers: { ...headers, [k]: v } });
  }
  function removeHeader(k: string) {
    const next = { ...headers };
    delete next[k];
    onChange({ headers: next });
  }
  function addHeader(seed?: { name: string; value: string }) {
    if (seed && seed.name in headers) return;
    let i = 1;
    let k = seed?.name ?? "X-Custom";
    while (!seed && k in headers) {
      i++;
      k = `X-Custom-${i}`;
    }
    onChange({ headers: { ...headers, [k]: seed?.value ?? "" } });
  }
  function setBody(raw: string) {
    if (raw.trim() === "") {
      onChange({ body: undefined });
      return;
    }
    try {
      onChange({ body: JSON.parse(raw) });
    } catch {
      onChange({ body: raw });
    }
  }

  return (
    <div className="space-y-4">
      <SectionHeader title="Resposta HTTP" hint="Use templates ({{ steps.X.body }}) — o handler resolve antes de devolver." />

      <FieldRow label="Status">
        <div className="space-y-1.5">
          <Input
            type="number"
            min={100}
            max={599}
            value={status}
            onChange={(e) => setStatus(Number(e.target.value))}
            className="h-8 w-24 font-mono text-xs"
          />
          <div className="flex flex-wrap gap-1">
            {STATUS_PRESETS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStatus(s)}
                className={cn(
                  "rounded-md border px-1.5 py-0.5 font-mono text-[10px]",
                  s === status ? statusFamily(s) : "border-border bg-background text-muted-foreground hover:border-primary/40",
                )}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      </FieldRow>

      <div className="space-y-2">
        <Label className="text-[11px] font-medium">Headers</Label>
        {Object.keys(headers).length === 0 ? (
          <EmptyHint>Nenhum header definido — o caller só vai receber Content-Type padrão.</EmptyHint>
        ) : (
          <div className="space-y-1.5">
            {Object.entries(headers).map(([k, v]) => (
              <div key={k} className="flex items-start gap-1.5">
                <Input
                  value={k}
                  onChange={(e) => setHeader(k, e.target.value)}
                  className="h-7 max-w-[180px] font-mono text-xs"
                  placeholder="X-Custom-Header"
                />
                <span className="pt-1.5 text-muted-foreground">:</span>
                <Input
                  value={v}
                  onChange={(e) => setHeaderValue(k, e.target.value)}
                  className="h-7 flex-1 font-mono text-xs"
                  placeholder="application/json"
                />
                <Button size="sm" variant="ghost" onClick={() => removeHeader(k)} className="h-7 px-2 text-[11px]">
                  ×
                </Button>
              </div>
            ))}
          </div>
        )}
        <div className="flex flex-wrap gap-1">
          {COMMON_HEADERS.map((h) => (
            <Button
              key={h.name}
              size="sm"
              variant="outline"
              onClick={() => addHeader(h)}
              disabled={h.name in headers}
              className="h-6 px-2 text-[10px]"
            >
              + {h.name}
            </Button>
          ))}
          <Button size="sm" variant="outline" onClick={() => addHeader()} className="h-6 px-2 text-[10px]">
            + custom
          </Button>
        </div>
      </div>

      <FieldRow label="Body" hint="JSON ou string. Vazio = sem body. Tipos primitivos (num/bool) também passam.">
        <Textarea
          rows={6}
          spellCheck={false}
          value={bodyRaw}
          onChange={(e) => setBody(e.target.value)}
          className="font-mono text-[11px]"
          placeholder='{"ok": true, "id": "{{ steps.fetch.id }}"}'
        />
      </FieldRow>

      <div className="rounded-md border border-dashed border-border bg-muted/20 p-2 text-[10px] text-muted-foreground">
        💡 Só efetivo com <strong>webhook_trigger</strong> em <code className="font-mono">responseMode: sync</code>. Em async,
        o caller já recebeu <code className="font-mono">202</code> antes deste nó rodar.
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Preview                                                                    */
/* -------------------------------------------------------------------------- */

function PreviewSection({
  workflowId,
  nodeId,
  values,
}: {
  workflowId: string;
  nodeId?: string;
  values: Record<string, unknown>;
}) {
  const [inputText, setInputText] = useState("{}");
  const [stepsText, setStepsText] = useState("{}");
  const [parseErr, setParseErr] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () =>
      nodesApi.dryRunRespond(workflowId, nodeId!, {
        config: values,
        input: JSON.parse(inputText || "{}"),
        steps: JSON.parse(stepsText || "{}"),
      }),
  });

  if (!workflowId || !nodeId) return <EmptyHint>Salve o workflow antes de testar.</EmptyHint>;

  function run() {
    setParseErr(null);
    try {
      JSON.parse(inputText || "{}");
      JSON.parse(stepsText || "{}");
    } catch (err) {
      setParseErr((err as Error).message);
      return;
    }
    mutation.mutate();
  }

  const envelope = useMemo(() => {
    const r = mutation.data;
    if (!r || !r.ok) return null;
    const wrapped = (r.output as Record<string, unknown>).__webhookResponse as
      | { status: number; headers: Record<string, string>; body: unknown }
      | undefined;
    return wrapped ?? null;
  }, [mutation.data]);

  return (
    <div className="space-y-3">
      <SectionHeader title="Preview da resposta" hint="Resolve templates contra o estado mockado e mostra o envelope final." />

      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        <FieldRow label="input (JSON)">
          <Textarea rows={4} spellCheck={false} className="font-mono text-[11px]" value={inputText} onChange={(e) => { setInputText(e.target.value); if (parseErr) setParseErr(null); }} />
        </FieldRow>
        <FieldRow label="steps (JSON)">
          <Textarea rows={4} spellCheck={false} className="font-mono text-[11px]" value={stepsText} onChange={(e) => { setStepsText(e.target.value); if (parseErr) setParseErr(null); }} />
        </FieldRow>
      </div>

      {parseErr && <p className="text-[10px] text-destructive">JSON inválido: {parseErr}</p>}

      <div className="flex justify-end">
        <Button size="sm" onClick={run} disabled={mutation.isPending}>
          {mutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          Resolver
        </Button>
      </div>

      {mutation.data && !mutation.data.ok && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-2 py-1.5">
          <p className="text-[10px] font-medium text-destructive">Handler falhou</p>
          <p className="mt-0.5 break-words font-mono text-[11px] text-destructive/90">{mutation.data.error}</p>
        </div>
      )}

      {envelope && <EnvelopePreview envelope={envelope} />}
    </div>
  );
}

function EnvelopePreview({
  envelope,
}: {
  envelope: { status: number; headers: Record<string, string>; body: unknown };
}) {
  const bodyStr = useMemo(() => safeStringify(envelope.body), [envelope.body]);
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className={cn("rounded-md border px-2 py-0.5 font-mono text-[11px]", statusFamily(envelope.status))}>
          HTTP {envelope.status}
        </span>
        <span className="text-[10px] text-muted-foreground">
          {Object.keys(envelope.headers).length} header(s) · body{" "}
          {envelope.body === null || envelope.body === undefined ? "vazio" : `${bodyStr.length} bytes`}
        </span>
      </div>

      {Object.keys(envelope.headers).length > 0 && (
        <div className="overflow-hidden rounded-md border border-border bg-background">
          <table className="w-full text-[11px]">
            <tbody>
              {Object.entries(envelope.headers).map(([k, v]) => (
                <tr key={k} className="border-t border-border/60 first:border-t-0">
                  <td className="px-2 py-1 font-mono text-[10px] text-muted-foreground">{k}</td>
                  <td className="px-2 py-1 font-mono text-[10px] break-all">{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div>
        <p className="mb-1 text-[10px] font-medium text-muted-foreground">Body</p>
        <pre className="max-h-48 overflow-auto rounded-md border border-border bg-background p-2 font-mono text-[10px] leading-relaxed">
          {bodyStr || "(vazio)"}
        </pre>
      </div>
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

  if (!workflowId || !nodeId) return <EmptyHint>Salve o workflow antes de ver histórico.</EmptyHint>;

  return (
    <div className="space-y-2">
      <SectionHeader title="Últimas execuções" />

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
                <th className="px-2 py-1.5 text-left">Status devolvido</th>
              </tr>
            </thead>
            <tbody>
              {query.data.map((inv) => (
                <RespondRow key={inv.id} inv={inv} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function RespondRow({ inv }: { inv: NodeInvocation }) {
  const wrapped = (inv.output as Record<string, unknown> | null)?.__webhookResponse as
    | { status?: number }
    | undefined;
  const code = typeof wrapped?.status === "number" ? wrapped.status : null;
  return (
    <tr className="border-t border-border/60">
      <td className="px-2 py-1.5 text-muted-foreground">{new Date(inv.createdAt).toLocaleString("pt-BR")}</td>
      <td className="px-2 py-1.5">
        {code !== null ? (
          <span className={cn("rounded-md border px-1.5 py-0.5 font-mono text-[10px]", statusFamily(code))}>{code}</span>
        ) : (
          <span className="font-mono text-[10px] text-muted-foreground">—</span>
        )}
      </td>
    </tr>
  );
}

/* helpers */
function SectionHeader({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="mb-3">
      <h3 className="text-sm font-semibold">{title}</h3>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
function FieldRow({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-[11px] font-medium">{label}</Label>
      {children}
      {hint && <p className="text-[10px] text-muted-foreground">{hint}</p>}
    </div>
  );
}
function EmptyHint({ children }: { children: React.ReactNode }) {
  return <div className="rounded-md border border-dashed border-border bg-background/40 px-3 py-4 text-center text-[11px] text-muted-foreground">{children}</div>;
}
function safeStringify(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v;
  try { return JSON.stringify(v, null, 2); } catch { return String(v); }
}
