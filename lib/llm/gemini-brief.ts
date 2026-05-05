import OpenAI from "openai";
import { z } from "zod";
import { MODELS } from "./models";
import { loadPrompt } from "./prompt-loader";
import { withRetry } from "../util/retry";
import { logTokenUsage } from "../cost/tracker";

const GeminiBriefSchema = z.object({
  angle: z.string(),
  must_cover: z.array(z.string()),
  content_gap: z.string(),
  ai_citation_targets: z.array(z.string()),
  recommended_h2s: z.array(z.string()),
  key_entities: z.array(z.string()),
  ranking_signals: z.string(),
});

export type GeminiBrief = z.infer<typeof GeminiBriefSchema>;

interface BriefSource {
  source_domain: string;
  content_md: string;
  authority_score: number;
}

// Send only the first 8 non-empty lines of each source — enough context, minimal tokens
function summariseSources(scrapes: BriefSource[]): string {
  if (scrapes.length === 0) return "No source material available.";
  return scrapes
    .map((s, i) => {
      const lines = s.content_md.split("\n").filter((l) => l.trim()).slice(0, 8);
      return `### Source ${i + 1}: ${s.source_domain} (authority: ${s.authority_score}/10)\n${lines.join("\n")}`;
    })
    .join("\n\n---\n\n");
}

export async function generateGeminiBrief(params: {
  keyword: string;
  headline: string;
  targetAudience: string;
  scrapes: BriefSource[];
  articleId?: string;
}): Promise<GeminiBrief> {
  const systemPrompt = await loadPrompt("gemini-brief.md");

  const userPrompt = `Target Keyword: ${params.keyword}
Article Headline: ${params.headline}
Target Audience: ${params.targetAudience}

## Existing Top Content (summarised)

${summariseSources(params.scrapes)}`;

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is not set");

  const client = new OpenAI({ baseURL: "https://openrouter.ai/api/v1", apiKey });

  return withRetry(async () => {
    const response = await client.chat.completions.create({
      model: MODELS.EDITOR,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    });

    logTokenUsage({
      articleId: params.articleId,
      functionName: "generate-article",
      stepName: "gemini-brief",
      model: MODELS.EDITOR,
      inputTokens: response.usage?.prompt_tokens ?? 0,
      outputTokens: response.usage?.completion_tokens ?? 0,
    });

    const text = response.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(text) as unknown;
    const validated = GeminiBriefSchema.safeParse(parsed);

    if (!validated.success) {
      throw new Error(`Gemini brief returned invalid structure: ${validated.error.message}`);
    }

    return validated.data;
  });
}
