// OpenRouter model IDs — used everywhere LLM calls are made via OpenRouter
export const MODELS = {
  WRITER: "anthropic/claude-sonnet-4-5",
  EDITOR: "google/gemini-2.5-pro-preview",
  CITATION_OPENAI: "openai/gpt-4o",
  CITATION_PERPLEXITY: "perplexity/sonar-pro",
} as const;

export type ModelId = (typeof MODELS)[keyof typeof MODELS];
