import OpenAI from "openai";
import { MODELS } from "./models";
import { loadPrompt } from "./prompt-loader";
import { withRetry } from "../util/retry";
import { logTokenUsage } from "../cost/tracker";
import type { GeminiBrief } from "./gemini-brief";

function getClient(): OpenAI {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is not set");
  return new OpenAI({ baseURL: "https://openrouter.ai/api/v1", apiKey });
}

export async function polishWithDeepSeek(params: {
  articleMarkdown: string;
  geminiBrief: GeminiBrief;
  articleId?: string;
}): Promise<string> {
  const systemPrompt = await loadPrompt("deepseek-polish.md");

  const userPrompt = `## Strategic Brief (used to write this article)

Angle: ${params.geminiBrief.angle}
Key Entities to cover: ${params.geminiBrief.key_entities.join(", ")}
AI Citation Targets: ${params.geminiBrief.ai_citation_targets.join(" | ")}
Content Gap to fill: ${params.geminiBrief.content_gap}

## Article to Polish

${params.articleMarkdown}`;

  return withRetry(async () => {
    const response = await getClient().chat.completions.create({
      model: MODELS.POLISHER,
      max_tokens: 8192,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    });

    logTokenUsage({
      articleId: params.articleId,
      functionName: "generate-article",
      stepName: "deepseek-polish",
      model: MODELS.POLISHER,
      inputTokens: response.usage?.prompt_tokens ?? 0,
      outputTokens: response.usage?.completion_tokens ?? 0,
    });

    return response.choices[0]?.message?.content ?? params.articleMarkdown;
  });
}
