import { getDb } from "../db/client";

// Pricing per 1M tokens (USD). Updated 2025 — adjust if rates change.
const INPUT_PRICE_PER_M: Record<string, number> = {
  "claude-sonnet-4-5": 3.0,
  "gemini-2.5-pro": 1.25,
  "gpt-4o": 2.5,
  "sonar-pro": 1.0,
};

const OUTPUT_PRICE_PER_M: Record<string, number> = {
  "claude-sonnet-4-5": 15.0,
  "gemini-2.5-pro": 10.0,
  "gpt-4o": 10.0,
  "sonar-pro": 1.0,
};

export interface TokenUsageParams {
  articleId?: string;
  functionName: string;
  stepName: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
}

export function logTokenUsage(params: TokenUsageParams): void {
  const inputPrice = INPUT_PRICE_PER_M[params.model] ?? 0;
  const outputPrice = OUTPUT_PRICE_PER_M[params.model] ?? 0;
  const costUsd =
    (params.inputTokens / 1_000_000) * inputPrice +
    (params.outputTokens / 1_000_000) * outputPrice;

  // Fire-and-forget — logging failure must never break the pipeline
  void Promise.resolve(
    getDb()
      .from("token_usage_logs")
      .insert({
        ...(params.articleId ? { article_id: params.articleId } : {}),
        function_name: params.functionName,
        step_name: params.stepName,
        model: params.model,
        input_tokens: params.inputTokens,
        output_tokens: params.outputTokens,
        cost_usd: costUsd,
      })
  ).catch(() => {});
}
