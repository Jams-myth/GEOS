import OpenAI from "openai";
import { z } from "zod";
import { MODELS } from "./models";
import { loadPrompt } from "./prompt-loader";
import { withRetry } from "../util/retry";
import { logTokenUsage } from "../cost/tracker";
import type { ParsedDraft } from "../parsing/meta-block";

// 100-point YMYL/GEO Master Scorecard v2
// accuracy(20) + density(15) + structural(10) + eeat(15) + entity(10) + directness(10) + consensus(10) + freshness(10) = 100
const EditorScoresSchema = z.object({
  accuracy_fact_checking:        z.number().min(0).max(20),
  information_density:           z.number().min(0).max(15),
  structural_machine_readability: z.number().min(0).max(10),
  authoritative_eeat:            z.number().min(0).max(15),
  entity_optimisation:           z.number().min(0).max(10),
  directness_intent:             z.number().min(0).max(10),
  consensus_safety:              z.number().min(0).max(10),
  source_freshness:              z.number().min(0).max(10),
  total:                         z.number().min(0).max(100),
});

const HardChecksSchema = z.object({
  tables:               z.number().int().min(0),
  footnotes:            z.number().int().min(0),
  quotes:               z.number().int().min(0),
  faq_questions:        z.number().int().min(0),
  tldr_bullets:         z.number().int().min(0),
  placeholder_detected: z.boolean(),
  meta_block_ok:        z.boolean(),
});

const EditorResultSchema = z.object({
  pass:              z.boolean(),
  scores:            EditorScoresSchema,
  hard_checks:       HardChecksSchema,
  revision_notes:    z.array(z.string()),
  placeholderDetected: z.boolean(),
});

export type EditorResult = z.infer<typeof EditorResultSchema>;
export type EditorScores = z.infer<typeof EditorScoresSchema>;

function getClient(): OpenAI {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is not set");
  return new OpenAI({
    baseURL: "https://openrouter.ai/api/v1",
    apiKey,
  });
}

export async function reviewWithGemini(
  draft: ParsedDraft,
  articleId?: string
): Promise<EditorResult> {
  const systemPrompt = await loadPrompt("editor-rubric.md");

  const prompt = `Review the following article draft against the YMYL/GEO Master Scorecard.
META BLOCK parsed upstream — meta_block_ok is ${draft.ok ? "true" : "false"}.

META TITLE: ${draft.meta_title}
META DESCRIPTION: ${draft.meta_description}
SCHEMA TYPE: ${draft.schema_type}
TLDR BULLETS: ${JSON.stringify(draft.tldr_bullets)}
META BLOCK PARSE ERRORS: ${draft.errors.length > 0 ? draft.errors.join("; ") : "none"}

## Article Body (starts at H1)

${draft.body_md}`;

  return withRetry(async () => {
    const response = await getClient().chat.completions.create({
      model: MODELS.EDITOR,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: prompt },
      ],
    });

    logTokenUsage({
      articleId,
      functionName: "generate-article",
      stepName: "editor-review",
      model: MODELS.EDITOR,
      inputTokens: response.usage?.prompt_tokens ?? 0,
      outputTokens: response.usage?.completion_tokens ?? 0,
    });

    const text = response.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(text) as unknown;
    const validated = EditorResultSchema.safeParse(parsed);

    if (!validated.success) {
      throw new Error(`Editor returned invalid result structure: ${validated.error.message}`);
    }

    return validated.data;
  });
}
