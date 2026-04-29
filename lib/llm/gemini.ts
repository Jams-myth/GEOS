import { GoogleGenerativeAI } from "@google/generative-ai";
import { z } from "zod";
import { MODELS } from "./models";
import { loadPrompt } from "./prompt-loader";
import type { ParsedDraft } from "../parsing/meta-block";

const EditorScoresSchema = z.object({
  keyword_density: z.number().min(0).max(10),
  semantic_coverage: z.number().min(0).max(10),
  eeat: z.number().min(0).max(10),
  geo_citation: z.number().min(0).max(10),
  readability: z.number().min(0).max(10),
  internal_linking: z.number().min(0).max(10),
  schema_completeness: z.number().min(0).max(10),
  originality: z.number().min(0).max(10),
});

const HardChecksSchema = z.object({
  tables: z.number().int().min(0),
  footnotes: z.number().int().min(0),
  quotes: z.number().int().min(0),
  faq_questions: z.number().int().min(0),
  tldr_bullets: z.number().int().min(0),
  placeholder_detected: z.boolean(),
  meta_block_ok: z.boolean(),
});

const EditorResultSchema = z.object({
  pass: z.boolean(),
  scores: EditorScoresSchema,
  hard_checks: HardChecksSchema,
  revision_notes: z.array(z.string()),
  placeholderDetected: z.boolean(),
});

export type EditorResult = z.infer<typeof EditorResultSchema>;

export async function reviewWithGemini(draft: ParsedDraft): Promise<EditorResult> {
  const systemPrompt = await loadPrompt("editor-rubric.md");

  const apiKey = process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) throw new Error("GOOGLE_AI_API_KEY is not set");

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: MODELS.EDITOR,
    systemInstruction: systemPrompt,
    generationConfig: {
      responseMimeType: "application/json",
    },
  });

  const prompt = `Review the following article draft. The META BLOCK has already been parsed upstream — meta_block_ok is ${draft.ok ? "true" : "false"}.

META TITLE: ${draft.meta_title}
META DESCRIPTION: ${draft.meta_description}
SCHEMA TYPE: ${draft.schema_type}
TLDR BULLETS: ${JSON.stringify(draft.tldr_bullets)}
META BLOCK PARSE ERRORS: ${draft.errors.length > 0 ? draft.errors.join("; ") : "none"}

## Article Body (starts at H1)

${draft.body_md}`;

  const result = await model.generateContent(prompt);
  const text = result.response.text();

  const parsed = JSON.parse(text) as unknown;
  const validated = EditorResultSchema.safeParse(parsed);

  if (!validated.success) {
    throw new Error(`Gemini returned invalid editor result structure: ${validated.error.message}`);
  }

  return validated.data;
}
