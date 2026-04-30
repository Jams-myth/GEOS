import OpenAI from "openai";
import { z } from "zod";
import { getDb } from "../db/client";
import { loadPrompt } from "../llm/prompt-loader";
import { MODELS } from "../llm/models";
import type { ProposedChanges } from "./types";

const PatchChangeSchema = z.object({
  type: z.enum([
    "replace_section",
    "insert_section",
    "update_meta",
    "update_tldr",
    "update_faq",
    "add_footnote",
    "update_schema",
  ]),
  priority: z.enum(["critical", "recommended", "optional"]),
  target: z.string(),
  rationale: z.string(),
  proposed_content: z.string(),
});

const ProposedChangesSchema = z.object({
  article_id: z.string(),
  article_version_at_proposal: z.number().int(),
  assessment_id: z.string(),
  expected_impact: z.string(),
  estimated_position_gain: z.number().int().min(0),
  changes: z.array(PatchChangeSchema).min(1),
  gemini_review_required: z.boolean(),
  notes: z.string(),
});

function getClient(): OpenAI {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is not set");
  return new OpenAI({
    baseURL: "https://openrouter.ai/api/v1",
    apiKey,
  });
}

export async function generateImprovementProposal(
  articleId: string,
  assessmentId: string
): Promise<ProposedChanges> {
  const db = getDb();

  const { data: article, error: articleError } = await db
    .from("articles")
    .select(
      "id, title, slug, primary_keyword, secondary_keywords, body_md, meta_title, meta_description, schema_type, version"
    )
    .eq("id", articleId)
    .single();

  if (articleError || !article) {
    throw new Error(`Failed to load article ${articleId}: ${articleError?.message}`);
  }

  const { data: assessment, error: assessmentError } = await db
    .from("assessments")
    .select(
      "id, week_of, gsc_data_jsonb, ga4_data_jsonb, serp_positions_jsonb, ai_citations_jsonb, recommendations_jsonb"
    )
    .eq("id", assessmentId)
    .single();

  if (assessmentError || !assessment) {
    throw new Error(`Failed to load assessment ${assessmentId}: ${assessmentError?.message}`);
  }

  const systemPrompt = await loadPrompt("improvement-planner.md");

  const userPrompt = `## Article Data

article_id: ${article.id}
slug: ${article.slug}
version: ${article.version ?? 1}
primary_keyword: ${article.primary_keyword ?? ""}
secondary_keywords: ${JSON.stringify(article.secondary_keywords ?? [])}
meta_title: ${article.meta_title ?? ""}
meta_description: ${article.meta_description ?? ""}
schema_type: ${article.schema_type ?? ""}

### Article Body (body_md)

${article.body_md ?? ""}

---

## Assessment Data

assessment_id: ${assessment.id}
week_of: ${assessment.week_of}

### GSC Metrics
${JSON.stringify(assessment.gsc_data_jsonb, null, 2)}

### GA4 Metrics
${JSON.stringify(assessment.ga4_data_jsonb, null, 2)}

### SERP Position
${JSON.stringify(assessment.serp_positions_jsonb, null, 2)}

### AI Citations
${JSON.stringify(assessment.ai_citations_jsonb, null, 2)}

### Recommendations from Assessment Aggregator
${JSON.stringify(assessment.recommendations_jsonb, null, 2)}`;

  const response = await getClient().chat.completions.create({
    model: MODELS.WRITER,
    max_tokens: 4096,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
  });

  const rawText = (response.choices[0]?.message?.content ?? "").trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    throw new Error(`Improvement planner returned invalid JSON: ${rawText.slice(0, 200)}`);
  }

  const validated = ProposedChangesSchema.safeParse(parsed);
  if (!validated.success) {
    throw new Error(
      `Improvement planner JSON failed schema validation: ${validated.error.message}`
    );
  }

  return {
    ...validated.data,
    article_id: articleId,
    assessment_id: assessmentId,
    article_version_at_proposal: article.version ?? 1,
  };
}
