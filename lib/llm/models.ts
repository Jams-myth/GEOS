export const MODELS = {
  WRITER: "claude-sonnet-4-5",
  EDITOR: "gemini-2.5-pro",
  CITATION_OPENAI: "gpt-4o",
  CITATION_PERPLEXITY: "sonar-pro",
} as const;

export type ModelId = (typeof MODELS)[keyof typeof MODELS];
