/**
 * Service de IA utilitária — espelha a feature `ai` do backend.
 *
 * Por enquanto expõe só `previewChat`, usado pelo dialog do nó `ai_chat`
 * pra testar um prompt sem precisar disparar um workflow inteiro.
 */
import { $fetch, unwrap } from "./index";

export type AiProvider = "anthropic" | "openai";

export type PreviewChatInput = {
  provider?: AiProvider;
  model: string;
  prompt: string;
  system?: string;
  temperature?: number;
  maxOutputTokens?: number;
};

export type PreviewChatOutput = {
  text: string;
  finishReason: string;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
    [key: string]: unknown;
  };
  elapsedMs: number;
};

export function previewChat(input: PreviewChatInput): Promise<PreviewChatOutput> {
  return unwrap(
    $fetch<PreviewChatOutput>("/ai/preview-chat", {
      method: "POST",
      body: input,
      // Chamadas a LLM podem demorar — não use o timeout default de 15s.
      timeout: 120_000,
      // Sem retry: o backend já loga e devolve 400; reexecutar gastaria créditos.
      retry: { type: "linear", attempts: 0, delay: 0 },
    }),
  );
}
