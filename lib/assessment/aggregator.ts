import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { MODELS } from "../llm/models";
import { loadPrompt } from "../llm/prompt-loader";
import type { GscArticleMetrics } from "../analytics/gsc";
import type { Ga4ArticleMetrics } from "../analytics/ga4";
import type { SerpResult } from "../serp/dataforseo";
import type { ArticleCitationResult } from "../citation/index";

const RecommendationSchema = z.object({
  priority: z.enum(["critical", "recommended", "optional"]),
  issue: z.string(),
  action: z.string(),
  expected_outcome: z.string(),
  metric: z.string(),
});

export type Recommendation = z.infer<typeof RecommendationSchema>;

export interface AggregatorInput {
  article: {
    id: string;
    title: string;
    primaryKeyword: string;
    url: string;
    publishedAt: string;
    version: number;
  };
  gsc: GscArticleMetrics;
  ga4: Ga4ArticleMetrics;
  serp: SerpResult;
  citations: ArticleCitationResult;
  previousWeek: {
    gsc: GscArticleMetrics;
    serp: SerpResult;
  } | null;
}

export async function aggregateRecommendations(
  input: AggregatorInput
): Promise<Recommendation[]> {
  const systemPrompt = await loadPrompt("assessment-aggregator.md");
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const userPrompt = JSON.stringify(input, null, 2);

  const response = await client.messages.create({
    model: MODELS.WRITER,
    system: systemPrompt,
    max_tokens: 2048,
    messages: [{ role: "user", content: userPrompt }],
  });

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");

  // Extract JSON array — the model may wrap it in a code fence
  const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/) ?? [null, text];
  const jsonStr = (jsonMatch[1] ?? text).trim();

  const parsed = JSON.parse(jsonStr) as unknown;
  const validated = z.array(RecommendationSchema).safeParse(parsed);

  if (!validated.success) {
    throw new Error(`Aggregator returned invalid recommendations: ${validated.error.message}`);
  }

  return validated.data;
}
