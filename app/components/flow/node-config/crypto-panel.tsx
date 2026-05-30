/**
 * Painel dedicado pro nó `crypto`. Seções:
 *
 *   Operação   — picker (hash/hmac/uuid/random/base64) + fields condicionais
 *   Teste      — input mockável; mostra digest/output + cópia rápida
 *   Histórico  — última execução (digest truncado)
 *
 * Persiste em `values`:
 *   { operation, algorithm?, value?, secret?, encoding?, bytes?, mode? }
 *
 * Atenção a UX: `secret` é sensível — não pré-preenchemos com placeholder real e
 * borramos a visualização por default na seção de Teste.
 */
import { useMemo, useState } from "react";
import { useFieldError } from "./use-field-error";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Check, Copy, Eye, EyeOff, History, KeyRound, Loader2, Send, Shield } from "lucide-react";

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

type Op = "hash" | "hmac" | "uuid" | "random" | "base64";

const OPS: { value: Op; label: string; description: string; icon: typeof Shield }[] = [
  { value: "hash", label: "hash", description: "Digest determinístico de um valor.", icon: Shield },
  { value: "hmac", label: "hmac", description: "Hash autenticado com chave secreta.", icon: KeyRound },
  { value: "uuid", label: "uuid", description: "UUID v4 aleatório.", icon: Shield },
  { value: "random", label: "random", description: "Bytes aleatórios (até 256).", icon: Shield },
  { value: "base64", label: "base64", description: "Encode / decode UTF-8 ↔ base64.", icon: Shield },
];

const HASH_ALGOS = ["md5", "sha1", "sha256", "sha512"] as const;
const ALGO_STRENGTH: Record<(typeof HASH_ALGOS)[number], { hint: string; danger: boolean }> = {
  md5: { hint: "Quebrado — só pra checksums não-cripto.", danger: true },
  sha1: { hint: "Deprecated — evite em contextos novos.", danger: true },
  sha256: { hint: "Padrão moderno.", danger: false },
  sha512: { hint: "Saída maior; mesmo nível de segurança que SHA-256.", danger: false },
};

const ENCODINGS = ["hex", "base64"] as const;

const SECTIONS = [
  { id: "operation", label: "Operação", icon: Shield },
  { id: "test", label: "Teste", icon: Send },
  { id: "history", label: "Histórico", icon: History },
] as const satisfies ReadonlyArray<SectionItem>;

type SectionId = (typeof SECTIONS)[number]["id"];

function readString(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

export function CryptoPanel({ values, onChange, onError, nodeId }: CustomPanelProps) {
  const [section, setSection] = useState<SectionId>("operation");
  const workflowId = useWorkflowId() ?? "";

  const op = readString(values.operation, "hash") as Op;
  const valueMissing = (op === "hash" || op === "hmac" || op === "base64") && !readString(values.value);
  const secretMissing = op === "hmac" && !readString(values.secret);

  useFieldError(onError, "value", valueMissing ? "Valor obrigatório." : null);
  useFieldError(onError, "secret", secretMissing ? "Secret obrigatório." : null);

  return (
    <Sections
      sections={SECTIONS as unknown as SectionItem<SectionId>[]}
      value={section}
      onValueChange={setSection}
      ariaLabel="Seções do nó Crypto"
    >
      {section === "operation" && <OperationSection values={values} onChange={onChange} op={op} />}
      {section === "test" && <TestSection workflowId={workflowId} nodeId={nodeId} values={values} op={op} />}
      {section === "history" && <HistorySection workflowId={workflowId} nodeId={nodeId} op={op} />}
    </Sections>
  );
}

/* -------------------------------------------------------------------------- */
/* Operação                                                                   */
/* -------------------------------------------------------------------------- */

function OperationSection({
  values,
  onChange,
  op,
}: {
  values: Record<string, unknown>;
  onChange: (patch: Record<string, unknown>) => void;
  op: Op;
}) {
  const meta = OPS.find((o) => o.value === op)!;
  const algo = readString(values.algorithm, "sha256") as (typeof HASH_ALGOS)[number];
  const encoding = readString(values.encoding, "hex") as (typeof ENCODINGS)[number];

  return (
    <div className="space-y-4">
      <SectionHeader title="Operação" hint={meta.description} />

      <div className="grid grid-cols-5 gap-1.5">
        {OPS.map((o) => {
          const active = o.value === op;
          const Icon = o.icon;
          return (
            <button
              key={o.value}
              type="button"
              onClick={() => {
                const next: Record<string, unknown> = { operation: o.value };
                if (o.value === "uuid") {
                  Object.assign(next, { algorithm: undefined, value: undefined, secret: undefined, encoding: undefined, bytes: undefined, mode: undefined });
                }
                if (o.value === "hash") {
                  Object.assign(next, { secret: undefined, bytes: undefined, mode: undefined });
                  if (!values.algorithm) next.algorithm = "sha256";
                  if (!values.encoding) next.encoding = "hex";
                }
                if (o.value === "hmac") {
                  Object.assign(next, { bytes: undefined, mode: undefined });
                  if (!values.algorithm) next.algorithm = "sha256";
                  if (!values.encoding) next.encoding = "hex";
                }
                if (o.value === "random") {
                  Object.assign(next, { algorithm: undefined, value: undefined, secret: undefined, mode: undefined });
                  if (!values.encoding) next.encoding = "hex";
                  if (typeof values.bytes !== "number") next.bytes = 16;
                }
                if (o.value === "base64") {
                  Object.assign(next, { algorithm: undefined, secret: undefined, encoding: undefined, bytes: undefined });
                  if (!values.mode) next.mode = "encode";
                }
                onChange(next);
              }}
              className={cn(
                "flex flex-col items-center gap-1 rounded-md border px-2 py-2 transition-colors",
                active ? "border-primary bg-primary/10 text-primary" : "border-border bg-background hover:border-primary/40",
              )}
            >
              <Icon className={cn("size-3.5", active ? "text-primary" : "text-muted-foreground")} />
              <p className="font-mono text-[11px] font-medium">{o.label}</p>
            </button>
          );
        })}
      </div>

      {(op === "hash" || op === "hmac") && (
        <>
          <FieldRow label="Algoritmo">
            <div className="flex flex-wrap gap-1">
              {HASH_ALGOS.map((a) => {
                const active = a === algo;
                const danger = ALGO_STRENGTH[a].danger;
                return (
                  <button
                    key={a}
                    type="button"
                    onClick={() => onChange({ algorithm: a })}
                    className={cn(
                      "rounded-md border px-2 py-1 font-mono text-[11px]",
                      active && !danger && "border-primary bg-primary/10 text-primary",
                      active && danger && "border-amber-500/60 bg-amber-500/10 text-amber-700 dark:text-amber-400",
                      !active && "border-border bg-background text-muted-foreground hover:border-primary/40",
                    )}
                  >
                    {a.toUpperCase()}
                  </button>
                );
              })}
            </div>
            <p
              className={cn(
                "mt-1 text-[10px]",
                ALGO_STRENGTH[algo].danger ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground",
              )}
            >
              {ALGO_STRENGTH[algo].hint}
            </p>
          </FieldRow>

          <FieldRow label="Valor" hint="Texto a hashear. Aceita templates ({{ steps.X.body }}).">
            <Textarea
              rows={3}
              spellCheck={false}
              value={readString(values.value)}
              onChange={(e) => onChange({ value: e.target.value })}
              className="font-mono text-xs"
              placeholder="conteúdo a hashear"
            />
          </FieldRow>

          {op === "hmac" && (
            <FieldRow label="Secret" hint="Use {{ env.MEU_SECRET }} — não cole valores sensíveis aqui.">
              <Input
                value={readString(values.secret)}
                onChange={(e) => onChange({ secret: e.target.value })}
                placeholder="{{ env.WEBHOOK_SECRET }}"
                className="font-mono text-xs"
              />
            </FieldRow>
          )}

          <FieldRow label="Encoding">
            <div className="flex gap-1">
              {ENCODINGS.map((e) => {
                const active = e === encoding;
                return (
                  <button
                    key={e}
                    type="button"
                    onClick={() => onChange({ encoding: e })}
                    className={cn(
                      "flex-1 rounded-md border px-2 py-1.5 font-mono text-[11px]",
                      active ? "border-primary bg-primary/10 text-primary" : "border-border bg-background text-muted-foreground hover:border-primary/40",
                    )}
                  >
                    {e}
                  </button>
                );
              })}
            </div>
          </FieldRow>
        </>
      )}

      {op === "uuid" && (
        <div className="rounded-md border border-dashed border-border bg-muted/20 p-2 text-[10px] text-muted-foreground">
          Sem configuração — gera um UUID v4 novo a cada execução. Output: <code className="font-mono">{`{uuid}`}</code>.
        </div>
      )}

      {op === "random" && (
        <div className="grid grid-cols-2 gap-2">
          <FieldRow label="Bytes" hint="1–256. Default 16.">
            <Input
              type="number"
              min={1}
              max={256}
              value={typeof values.bytes === "number" ? values.bytes : 16}
              onChange={(e) => onChange({ bytes: Math.max(1, Math.min(256, Number(e.target.value) || 16)) })}
              className="font-mono text-xs"
            />
          </FieldRow>
          <FieldRow label="Encoding">
            <div className="flex gap-1">
              {ENCODINGS.map((e) => {
                const active = e === encoding;
                return (
                  <button
                    key={e}
                    type="button"
                    onClick={() => onChange({ encoding: e })}
                    className={cn(
                      "flex-1 rounded-md border px-2 py-1.5 font-mono text-[11px]",
                      active ? "border-primary bg-primary/10 text-primary" : "border-border bg-background text-muted-foreground hover:border-primary/40",
                    )}
                  >
                    {e}
                  </button>
                );
              })}
            </div>
          </FieldRow>
        </div>
      )}

      {op === "base64" && (
        <>
          <FieldRow label="Modo">
            <div className="grid grid-cols-2 gap-1">
              {(["encode", "decode"] as const).map((m) => {
                const active = m === (values.mode ?? "encode");
                return (
                  <button
                    key={m}
                    type="button"
                    onClick={() => onChange({ mode: m })}
                    className={cn(
                      "rounded-md border px-2 py-1.5 font-mono text-[11px]",
                      active ? "border-primary bg-primary/10 text-primary" : "border-border bg-background text-muted-foreground hover:border-primary/40",
                    )}
                  >
                    {m === "encode" ? "encode (UTF-8 → base64)" : "decode (base64 → UTF-8)"}
                  </button>
                );
              })}
            </div>
          </FieldRow>
          <FieldRow label="Valor">
            <Textarea
              rows={3}
              spellCheck={false}
              value={readString(values.value)}
              onChange={(e) => onChange({ value: e.target.value })}
              className="font-mono text-xs"
              placeholder={values.mode === "decode" ? "SGVsbG8=" : "Hello"}
            />
          </FieldRow>
        </>
      )}

      <div className="rounded-md border border-dashed border-border bg-muted/20 p-2 text-[10px] text-muted-foreground">
        💡 Output por op:
        <ul className="mt-1 list-disc pl-4 space-y-0.5">
          <li><code className="font-mono">hash / hmac</code> → <code>{`{digest}`}</code></li>
          <li><code className="font-mono">uuid</code> → <code>{`{uuid}`}</code></li>
          <li><code className="font-mono">random / base64</code> → <code>{`{value}`}</code></li>
        </ul>
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
  op,
}: {
  workflowId: string;
  nodeId?: string;
  values: Record<string, unknown>;
  op: Op;
}) {
  const [revealSecret, setRevealSecret] = useState(false);

  const mutation = useMutation({
    mutationFn: () => nodesApi.dryRunCrypto(workflowId, nodeId!, { config: values, input: {}, steps: {}, vars: {} }),
  });

  if (!workflowId || !nodeId) return <EmptyHint>Salve o workflow antes de testar.</EmptyHint>;

  const result = mutation.data;

  return (
    <div className="space-y-3">
      <SectionHeader title={`Preview: ${op}`} hint="Roda o handler com env vazio — use {{ env.X }} em produção pra secrets reais." />

      {op === "hmac" && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-[10px] text-amber-700 dark:text-amber-400">
          ⚠ O teste usa o secret literal do campo. Se você colou {`{{ env.X }}`}, o handler vai computar HMAC da string literal (env não é resolvido sem environmentId).
        </div>
      )}

      {(op === "hash" || op === "hmac") && (
        <div className="rounded-md border border-border bg-muted/20 p-2 text-[11px]">
          <p className="text-muted-foreground">Pré-visualização do input</p>
          <p className="font-mono text-xs break-all">
            {readString(values.algorithm, "sha256").toUpperCase()}({truncate(readString(values.value), 60)})
          </p>
          {op === "hmac" && (
            <p className="mt-1 text-[10px] text-muted-foreground">
              secret: {revealSecret ? <span className="font-mono">{readString(values.secret) || "(vazio)"}</span> : <span className="font-mono">{"•".repeat(Math.min(readString(values.secret).length, 12)) || "(vazio)"}</span>}
              <button
                type="button"
                onClick={() => setRevealSecret((s) => !s)}
                className="ml-2 inline-flex items-center gap-0.5 rounded border border-border px-1 text-[10px] hover:border-primary/40"
              >
                {revealSecret ? <EyeOff className="size-2.5" /> : <Eye className="size-2.5" />}
                {revealSecret ? "ocultar" : "mostrar"}
              </button>
            </p>
          )}
        </div>
      )}

      <div className="flex justify-end">
        <Button size="sm" onClick={() => mutation.mutate()} disabled={mutation.isPending}>
          {mutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          Computar
        </Button>
      </div>

      {result && !result.ok && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-2 py-1.5">
          <p className="text-[10px] font-medium text-destructive">Handler falhou</p>
          <p className="mt-0.5 break-words font-mono text-[11px] text-destructive/90">{result.error}</p>
        </div>
      )}

      {result && result.ok && <ResultCard output={result.output} durationMs={result.durationMs} />}
    </div>
  );
}

function ResultCard({ output, durationMs }: { output: Record<string, unknown>; durationMs: number }) {
  // O handler nomeia o output de formas diferentes — pega o primeiro string field.
  const [key, value] = useMemo(() => {
    for (const [k, v] of Object.entries(output)) {
      if (typeof v === "string") return [k, v] as const;
    }
    return ["output", JSON.stringify(output)] as const;
  }, [output]);

  const [copied, setCopied] = useState(false);
  function copy() {
    void navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  }

  return (
    <div className="space-y-2">
      <div className="rounded-md border border-emerald-500/40 bg-emerald-500/5 p-3">
        <div className="mb-1 flex items-center justify-between gap-2">
          <p className="text-[10px] uppercase tracking-wide text-emerald-700 dark:text-emerald-400">{key}</p>
          <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
            <span>{value.length} chars</span>
            <span>·</span>
            <span>{durationMs}ms</span>
            <button
              type="button"
              onClick={copy}
              className="inline-flex items-center gap-0.5 rounded border border-border px-1 py-0.5 hover:border-primary/40"
            >
              {copied ? <Check className="size-2.5 text-emerald-600" /> : <Copy className="size-2.5" />}
              {copied ? "ok" : "copiar"}
            </button>
          </div>
        </div>
        <p className="break-all font-mono text-[11px] font-medium">{value}</p>
      </div>

      {Object.keys(output).length > 1 && (
        <div className="rounded-md border border-border bg-muted/20 p-2">
          <p className="mb-1 text-[10px] font-medium text-muted-foreground">Output completo</p>
          <pre className="max-h-40 overflow-auto rounded-md border border-border bg-background p-2 font-mono text-[10px] leading-relaxed">
            {JSON.stringify(output, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s || "''";
  return `${s.slice(0, n)}…`;
}

/* -------------------------------------------------------------------------- */
/* Histórico                                                                  */
/* -------------------------------------------------------------------------- */

function HistorySection({ workflowId, nodeId, op }: { workflowId: string; nodeId?: string; op: Op }) {
  const limit = 25;
  const query = useQuery({
    queryKey: queryKeys.workflowNodes.invocations(workflowId, nodeId ?? "", limit),
    queryFn: () => nodesApi.listInvocations(workflowId, nodeId!, limit),
    enabled: Boolean(workflowId && nodeId),
  });

  if (!workflowId || !nodeId) return <EmptyHint>Salve o workflow antes de ver histórico.</EmptyHint>;

  return (
    <div className="space-y-2">
      <SectionHeader title="Últimas execuções" hint={`Operação atual: ${op}`} />
      {query.isPending && <div className="flex items-center gap-2 px-2 py-4 text-[11px] text-muted-foreground"><Loader2 className="size-3.5 animate-spin" /> Carregando…</div>}
      {query.data && query.data.length === 0 && <EmptyHint>Nenhuma execução registrada ainda.</EmptyHint>}
      {query.data && query.data.length > 0 && (
        <div className="overflow-hidden rounded-md border border-border bg-background">
          <table className="w-full text-[11px]">
            <thead className="bg-muted/40 text-[10px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-2 py-1.5 text-left">Quando</th>
                <th className="px-2 py-1.5 text-left">Output (truncado)</th>
              </tr>
            </thead>
            <tbody>
              {query.data.map((inv) => <CryptoRow key={inv.id} inv={inv} />)}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function CryptoRow({ inv }: { inv: NodeInvocation }) {
  const summary = useMemo(() => {
    if (inv.status === "failed" && inv.error) {
      const msg = (inv.error as Record<string, unknown>).message;
      return typeof msg === "string" ? msg : "—";
    }
    const out = inv.output as Record<string, unknown> | null;
    if (!out) return "—";
    for (const v of Object.values(out)) {
      if (typeof v === "string") return truncate(v, 40);
    }
    return JSON.stringify(out);
  }, [inv]);

  return (
    <tr className="border-t border-border/60">
      <td className="px-2 py-1.5 text-muted-foreground">{new Date(inv.createdAt).toLocaleString("pt-BR")}</td>
      <td className="px-2 py-1.5 font-mono text-[10px] break-all">{summary}</td>
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
