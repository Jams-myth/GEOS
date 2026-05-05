// OpenRouter model IDs — used everywhere LLM calls are made via OpenRouter
export const MODELS = {
  WRITER: "deepseek/deepseek-v4-flash",      // Fast draft generation — 21x cheaper than Sonnet
  POLISHER: "deepseek/deepseek-v4-pro",       // Final GEO/entity polish pass
  EDITOR: "google/gemini-2.5-pro-preview",    // Strategic brief + YMYL quality check
  CITATION_OPENAI: "openai/gpt-4o",
  CITATION_PERPLEXITY: "perplexity/sonar-pro",
} as const;

export type ModelId = (typeof MODELS)[keyof typeof MODELS];
