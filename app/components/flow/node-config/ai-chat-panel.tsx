/**
 * Painel dedicado pro nó `ai_chat`. Substitui o renderer genérico
 * (FieldsList) por uma UI dividida em duas colunas:
 *
 *   esquerda  → configuração (provider, modelo, system, prompt, temperatura,
 *               maxOutputTokens)
 *   direita   → preview visual usando os componentes de chat IA do Vercel
 *               AI Elements (`Conversation`, `Message`, `MessageContent`)
 *               — não dispara LLM real, só pinta as mensagens com os
 *               templates resolvidos via `DEFAULT_SAMPLE_CONTEXT`/pinned-data.
 *
 * Shape persistido em `values` (idêntico ao schema atual do handler):
 *   provider: "anthropic" | "openai"
 *   model: string
 *   prompt: string
 *   system?: string
 *   temperature?: number
 *   maxOutputTokens?: number
 */
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Bot,
  Brain,
  Loader2,
  Play,
  Sparkles,
  Thermometer,
  Wand2,
} from "lucide-react";

import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Textarea } from "~/components/ui/textarea";
import { Badge } from "~/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { cn } from "~/lib/utils";

import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
} from "~/components/ai-elements/conversation";
import {
  Message,
  MessageContent,
} from "~/components/ai-elements/message";

import { usePinnedData } from "~/stores/pinned-data";
import { useWorkflowId } from "../workflow-context";
import { previewChat, type PreviewChatOutput } from "~/services/ai";

import type { CustomPanelProps } from "./types";
import {
  DEFAULT_SAMPLE_CONTEXT,
  hasTemplate,
  renderTemplate,
} from "./template";

/* -------------------------------------------------------------------------- */
/* Catálogo de modelos                                                         */
/* -------------------------------------------------------------------------- */

type Provider = "anthropic" | "openai";

interface ModelOption {
  id: string;
  label: string;
  hint?: string;
}

/**
 * Presets curados. O usuário ainda pode digitar livremente em "Outro"
 * pra acomodar modelos novos sem precisar atualizar o front.
 */
const MODELS: Record<Provider, ModelOption[]> = {
  anthropic: [
    { id: "claude-opus-4-7", label: "Opus 4.7", hint: "Mais capaz, mais caro" },
    { id: "claude-sonnet-4-6", label: "Sonnet 4.6", hint: "Balanceado" },
    { id: "claude-haiku-4-5-20251001", label: "Haiku 4.5", hint: "Rápido, barato" },
  ],
  openai: [
    { id: "gpt-5", label: "GPT-5" },
    { id: "gpt-4o", label: "GPT-4o" },
    { id: "gpt-4o-mini", label: "GPT-4o mini", hint: "Barato" },
    { id: "o3-mini", label: "o3-mini", hint: "Reasoning" },
  ],
};

const CUSTOM_MODEL_VALUE = "__custom__";

/* -------------------------------------------------------------------------- */
/* Painel                                                                      */
/* -------------------------------------------------------------------------- */

export function AiChatPanel({ values, onChange, onError }: CustomPanelProps) {
  const provider = ((typeof values.provider === "string" ? values.provider : "anthropic") as Provider);
  const model = typeof values.model === "string" ? values.model : "";
  const prompt = typeof values.prompt === "string" ? values.prompt : "";
  const system = typeof values.system === "string" ? values.system : "";
  const temperature =
    typeof values.temperature === "number" ? values.temperature : undefined;
  const maxOutputTokens =
    typeof values.maxOutputTokens === "number" ? values.maxOutputTokens : undefined;

  const presetIds = useMemo(() => MODELS[provider].map((m) => m.id), [provider]);
  const isCustomModel = !!model && !presetIds.includes(model);
  const [customMode, setCustomMode] = useState(isCustomModel);

  // Quando muda provider, se o modelo atual não existe no preset novo,
  // entra em modo custom — preservando o valor digitado.
  useEffect(() => {
    if (model && !MODELS[provider].some((m) => m.id === model)) {
      setCustomMode(true);
    }
  }, [provider, model]);

  // Validação leve — espelha o handler (ai-chat.ts: model + prompt obrigatórios).
  useEffect(() => {
    onError?.("model", model.trim() === "" ? "Escolha um modelo." : null);
  }, [model, onError]);
  useEffect(() => {
    onError?.("prompt", prompt.trim() === "" ? "Defina o prompt." : null);
  }, [prompt, onError]);

  const workflowId = useWorkflowId();
  const pins = usePinnedData(workflowId ?? "");
  const sampleCtx = useMemo(() => buildSampleCtx(pins), [pins]);
  const usingPins = Object.keys(pins).length > 0;

  const renderedSystem = useMemo(
    () => (system ? String(renderTemplate(system, sampleCtx) ?? "") : ""),
    [system, sampleCtx],
  );
  const renderedPrompt = useMemo(
    () => (prompt ? String(renderTemplate(prompt, sampleCtx) ?? "") : ""),
    [prompt, sampleCtx],
  );

  /* ── Estado de "Testar prompt" — dispara o backend /ai/preview-chat ─── */
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<PreviewChatOutput | null>(null);
  const [testError, setTestError] = useState<string | null>(null);

  const canTest =
    !!model.trim() && !!renderedPrompt.trim() && !testing;

  // Sempre que o usuário mexer no config, o resultado antigo deixa de ser
  // representativo — limpamos pra evitar "preview enganoso".
  useEffect(() => {
    setTestResult(null);
    setTestError(null);
  }, [provider, model, system, prompt, temperature, maxOutputTokens]);

  async function runTest() {
    setTesting(true);
    setTestError(null);
    setTestResult(null);
    try {
      const out = await previewChat({
        provider,
        model,
        prompt: renderedPrompt,
        system: renderedSystem || undefined,
        temperature,
        maxOutputTokens,
      });
      setTestResult(out);
    } catch (err) {
      setTestError(err instanceof Error ? err.message : String(err));
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-4 min-h-[520px]">
      {/* ── Coluna esquerda: configuração ───────────────────────────── */}
      <div className="flex flex-col gap-4 overflow-y-auto pr-1">
        {/* Provider + modelo */}
        <section className="flex flex-col gap-3">
          <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Modelo
          </Label>

          <div className="grid grid-cols-2 gap-2">
            <ProviderToggle
              value={provider}
              onChange={(p) => onChange({ provider: p })}
            />
            <ModelSelect
              provider={provider}
              model={model}
              customMode={customMode}
              onChange={(v) => onChange({ model: v })}
              onCustomMode={(on) => {
                setCustomMode(on);
                if (!on) onChange({ model: MODELS[provider][0]?.id });
              }}
            />
          </div>

          {customMode && (
            <Input
              value={model}
              placeholder={
                provider === "anthropic"
                  ? "ex: claude-sonnet-4-5"
                  : "ex: gpt-4-turbo-preview"
              }
              onChange={(e) => onChange({ model: e.target.value })}
              aria-label="ID do modelo customizado"
            />
          )}
        </section>

        {/* System prompt */}
        <section className="flex flex-col gap-1.5">
          <Label htmlFor="ai-system" className="text-xs font-medium flex items-center gap-1.5">
            <Brain className="size-3.5 text-muted-foreground" />
            System (opcional)
          </Label>
          <Textarea
            id="ai-system"
            rows={3}
            value={system}
            placeholder="Você é um assistente conciso. Responda em PT-BR."
            onChange={(e) => onChange({ system: e.target.value || undefined })}
            className="font-mono text-xs"
          />
          <TemplateHint text={system} />
        </section>

        {/* Prompt */}
        <section className="flex flex-col gap-1.5">
          <Label htmlFor="ai-prompt" className="text-xs font-medium flex items-center gap-1.5">
            <Sparkles className="size-3.5 text-muted-foreground" />
            Prompt <span className="text-destructive">*</span>
          </Label>
          <Textarea
            id="ai-prompt"
            rows={6}
            value={prompt}
            placeholder="Resuma o seguinte texto: {{ steps.fetch.body.content }}"
            onChange={(e) => onChange({ prompt: e.target.value })}
            className="font-mono text-xs"
          />
          <TemplateHint text={prompt} />
        </section>

        {/* Avançado: temperatura + max tokens */}
        <section className="grid grid-cols-2 gap-3">
          <TemperatureField
            value={temperature}
            onChange={(v) => onChange({ temperature: v })}
          />
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ai-max-tokens" className="text-xs font-medium">
              Max output tokens
            </Label>
            <Input
              id="ai-max-tokens"
              type="number"
              min={1}
              value={maxOutputTokens ?? ""}
              placeholder="(sem limite)"
              onChange={(e) => {
                const raw = e.target.value;
                if (raw === "") return onChange({ maxOutputTokens: undefined });
                const n = Number(raw);
                onChange({ maxOutputTokens: Number.isFinite(n) ? n : undefined });
              }}
            />
            <p className="text-[10px] text-muted-foreground leading-tight">
              ~4 chars ≈ 1 token.{" "}
              {maxOutputTokens
                ? `Limite atual: ~${(maxOutputTokens * 4).toLocaleString("pt-BR")} chars.`
                : "Sem limite — usa default do modelo."}
            </p>
          </div>
        </section>
      </div>

      {/* ── Coluna direita: preview de chat ─────────────────────────── */}
      <div className="flex flex-col gap-2 min-h-0">
        <div className="flex items-center justify-between gap-2">
          <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Preview
          </Label>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-[10px] font-normal gap-1">
              <Bot className="size-3" />
              {usingPins ? "pins" : "sample"}
            </Badge>
            <Button
              type="button"
              size="sm"
              variant={testResult ? "outline" : "default"}
              disabled={!canTest}
              onClick={runTest}
              className="h-7 gap-1.5 text-xs"
            >
              {testing ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  Testando…
                </>
              ) : (
                <>
                  <Play className="size-3.5" />
                  Testar prompt
                </>
              )}
            </Button>
          </div>
        </div>

        <div className="flex-1 min-h-0 rounded-md border bg-muted/20 overflow-hidden flex flex-col">
          <ChatPreview
            provider={provider}
            model={model}
            system={renderedSystem}
            prompt={renderedPrompt}
            hasRawPrompt={!!prompt}
            result={testResult}
            error={testError}
            loading={testing}
          />
        </div>

        <p className="text-[10px] text-muted-foreground leading-relaxed">
          <strong>Testar prompt</strong> chama o LLM real com a config atual (limite ~15/min).
          Templates <code className="rounded bg-muted px-1 font-mono">{`{{ … }}`}</code>{" "}
          são resolvidos com {usingPins ? "os pins do workflow" : "o sample context"}.
        </p>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Subcomponentes                                                              */
/* -------------------------------------------------------------------------- */

function ProviderToggle({
  value,
  onChange,
}: {
  value: Provider;
  onChange: (v: Provider) => void;
}) {
  return (
    <div className="grid grid-cols-2 rounded-md border bg-muted/30 p-0.5 h-9">
      {(["anthropic", "openai"] as Provider[]).map((p) => (
        <button
          key={p}
          type="button"
          onClick={() => onChange(p)}
          className={cn(
            "rounded-sm text-xs font-medium transition-colors",
            value === p
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {p === "anthropic" ? "Anthropic" : "OpenAI"}
        </button>
      ))}
    </div>
  );
}

function ModelSelect({
  provider,
  model,
  customMode,
  onChange,
  onCustomMode,
}: {
  provider: Provider;
  model: string;
  customMode: boolean;
  onChange: (v: string) => void;
  onCustomMode: (on: boolean) => void;
}) {
  const opts = MODELS[provider];
  const selectValue = customMode ? CUSTOM_MODEL_VALUE : model || "";

  return (
    <Select
      value={selectValue}
      onValueChange={(v) => {
        if (v === CUSTOM_MODEL_VALUE) {
          onCustomMode(true);
        } else {
          onCustomMode(false);
          onChange(v);
        }
      }}
    >
      <SelectTrigger className="h-9">
        <SelectValue placeholder="Selecione o modelo" />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectLabel className="text-[10px] uppercase tracking-wide">
            {provider === "anthropic" ? "Claude" : "GPT"}
          </SelectLabel>
          {opts.map((m) => (
            <SelectItem key={m.id} value={m.id}>
              <div className="flex flex-col items-start">
                <span>{m.label}</span>
                {m.hint && (
                  <span className="text-[10px] text-muted-foreground">
                    {m.hint}
                  </span>
                )}
              </div>
            </SelectItem>
          ))}
        </SelectGroup>
        <SelectGroup>
          <SelectItem value={CUSTOM_MODEL_VALUE}>
            <span className="text-muted-foreground">Outro modelo…</span>
          </SelectItem>
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}

function TemperatureField({
  value,
  onChange,
}: {
  value: number | undefined;
  onChange: (v: number | undefined) => void;
}) {
  const v = value ?? 0.7;
  const tier =
    v <= 0.3 ? "Determinístico" : v <= 1.0 ? "Balanceado" : "Criativo";

  return (
    <div className="flex flex-col gap-1.5">
      <Label
        htmlFor="ai-temperature"
        className="text-xs font-medium flex items-center justify-between"
      >
        <span className="flex items-center gap-1.5">
          <Thermometer className="size-3.5 text-muted-foreground" />
          Temperature
        </span>
        <span className="text-[10px] font-normal text-muted-foreground">
          {tier}
        </span>
      </Label>
      <div className="flex items-center gap-2">
        <Input
          id="ai-temperature"
          type="range"
          min={0}
          max={2}
          step={0.1}
          value={v}
          onChange={(e) => onChange(Number(e.target.value))}
          className="flex-1 h-9 cursor-pointer p-0 [&::-webkit-slider-thumb]:appearance-none"
          aria-label="Temperature"
        />
        <Input
          type="number"
          min={0}
          max={2}
          step={0.1}
          value={value ?? ""}
          placeholder="0.7"
          onChange={(e) => {
            const raw = e.target.value;
            if (raw === "") return onChange(undefined);
            const n = Number(raw);
            onChange(Number.isFinite(n) ? n : undefined);
          }}
          className="w-16 h-9 text-xs"
          aria-label="Valor numérico de temperature"
        />
      </div>
    </div>
  );
}

function TemplateHint({ text }: { text: string }) {
  if (!hasTemplate(text)) return null;
  return (
    <p className="text-[10px] text-muted-foreground flex items-center gap-1">
      <Wand2 className="size-3" />
      Contém <code className="rounded bg-muted px-1 font-mono">{`{{ … }}`}</code>{" "}
      — resolvido em runtime e no preview ao lado.
    </p>
  );
}

function ChatPreview({
  provider,
  model,
  system,
  prompt,
  hasRawPrompt,
  result,
  error,
  loading,
}: {
  provider: Provider;
  model: string;
  system: string;
  prompt: string;
  hasRawPrompt: boolean;
  result: PreviewChatOutput | null;
  error: string | null;
  loading: boolean;
}) {
  // Etiqueta do "assistant" que aparece junto da resposta.
  const assistantLabel =
    MODELS[provider].find((m) => m.id === model)?.label ?? model ?? "assistant";

  if (!hasRawPrompt && !system) {
    return (
      <ConversationEmptyState
        icon={<Bot className="size-8" />}
        title="Sem mensagens ainda"
        description="Preencha o prompt à esquerda pra ver como a conversa será montada."
      />
    );
  }

  return (
    <Conversation className="flex-1 min-h-0">
      <ConversationContent className="gap-4 p-3">
        {system && (
          <Message from="system">
            <MessageContent className="border border-dashed border-amber-300/40 bg-amber-50/30 dark:bg-amber-950/20 text-amber-900 dark:text-amber-100 rounded-md px-3 py-2 max-w-full">
              <div className="text-[10px] uppercase tracking-wide font-medium opacity-70 mb-1">
                System
              </div>
              <div className="whitespace-pre-wrap text-xs">{system}</div>
            </MessageContent>
          </Message>
        )}

        {prompt && (
          <Message from="user">
            <MessageContent className="whitespace-pre-wrap text-xs">
              {prompt}
            </MessageContent>
          </Message>
        )}

        <Message from="assistant">
          <MessageContent className="max-w-full">
            <div className="text-[10px] uppercase tracking-wide font-medium text-muted-foreground mb-1 flex items-center justify-between gap-2">
              <span className="flex items-center gap-1">
                <Bot className="size-3" />
                {assistantLabel}
              </span>
              {result && (
                <span className="font-mono normal-case">
                  {formatUsage(result)}
                </span>
              )}
            </div>

            {loading && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="size-3.5 animate-spin" />
                Chamando o modelo…
              </div>
            )}

            {!loading && error && (
              <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-2 py-1.5 text-xs text-destructive">
                <AlertTriangle className="size-3.5 shrink-0 mt-0.5" />
                <span className="break-words">{error}</span>
              </div>
            )}

            {!loading && !error && result && (
              <div className="whitespace-pre-wrap text-xs leading-relaxed">
                {result.text}
              </div>
            )}

            {!loading && !error && !result && (
              <div className="text-xs italic text-muted-foreground">
                Clique em <strong>Testar prompt</strong> pra chamar o modelo
                ou rode o workflow inteiro pra ver a resposta real.
              </div>
            )}
          </MessageContent>
        </Message>
      </ConversationContent>
    </Conversation>
  );
}

function formatUsage(result: PreviewChatOutput): string {
  const u = result.usage ?? {};
  const inT = typeof u.inputTokens === "number" ? u.inputTokens : undefined;
  const outT = typeof u.outputTokens === "number" ? u.outputTokens : undefined;
  const tot = typeof u.totalTokens === "number" ? u.totalTokens : undefined;
  const parts: string[] = [];
  if (inT !== undefined && outT !== undefined) {
    parts.push(`${inT}→${outT} tok`);
  } else if (tot !== undefined) {
    parts.push(`${tot} tok`);
  }
  if (result.elapsedMs) parts.push(`${(result.elapsedMs / 1000).toFixed(1)}s`);
  if (result.finishReason && result.finishReason !== "stop") {
    parts.push(result.finishReason);
  }
  return parts.join(" · ");
}

/* -------------------------------------------------------------------------- */
/* Sample context — mesma estratégia do code-panel                             */
/* -------------------------------------------------------------------------- */

/**
 * Constrói o `ctx` de preview a partir dos pins do workflow. Pin do trigger
 * (start / webhook_trigger) vai pra `input`; demais pins viram `steps[id]`.
 * Sem pins, devolve o `DEFAULT_SAMPLE_CONTEXT` pra que `{{ steps.x.y }}`
 * resolva em algo visível.
 */
function buildSampleCtx(
  pins: Record<string, Record<string, unknown>>,
): Record<string, unknown> {
  if (Object.keys(pins).length === 0) return DEFAULT_SAMPLE_CONTEXT;

  const steps: Record<string, unknown> = {};
  let input: unknown = undefined;
  for (const [id, value] of Object.entries(pins)) {
    if (id === "start" || id === "webhook_trigger") {
      input = value;
    } else {
      steps[id] = value;
    }
  }
  return {
    input: input ?? DEFAULT_SAMPLE_CONTEXT.input,
    vars: DEFAULT_SAMPLE_CONTEXT.vars,
    env: DEFAULT_SAMPLE_CONTEXT.env,
    steps,
  };
}
