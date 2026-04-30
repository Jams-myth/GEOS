import OpenAI from "openai";
import { z } from "zod";
import { MODELS } from "../llm/models";
import type { ProposedChanges, GeminiReview } from "./types";

const GeminiReviewSchema = z.object({
  approved: z.boolean(),
  confidence: z.number().min(0).max(1),
  issues: z.array(z.string()),
  notes: z.string(),
});

const SYSTEM_PROMPT = `You are a senior SEO editor performing a sanity-check on an AI-generated improvement patch before it goes to human review.

Your job is NOT to evaluate strategy — that was done upstream. Your job is to catch hard errors in the patch:

1. **Fabricated data** — Does the proposed_content introduce statistics, URLs, or factual claims that don't appear in the article or assessment data? If so, flag them.
2. **Broken markdown** — Does the proposed_content contain malformed headings, unclosed code blocks, invalid footnote syntax, or broken tables?
3. **Scope creep** — Does the patch propose more than 5 changes, or does any single change exceed 500 words? If so, flag the specific change.
4. **Placeholder leakage** — Does the proposed_content contain any [PLACEHOLDER: ...] tokens that should have been filled in?
5. **Version mismatch** — Is article_version_at_proposal a non-negative integer?

Return exactly this JSON shape, no other text:
{
  "approved": true | false,
  "confidence": 0.0–1.0,
  "issues": ["...one string per hard failure found..."],
  "notes": "optional reviewer note"
}

Approve if there are zero hard failures. A patch with stylistic differences or minor redundancy should still be approved.`;

function getClient(): OpenAI {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is not set");
  return new OpenAI({
    baseURL: "https://openrouter.ai/api/v1",
    apiKey,
  });
}

export async function reviewPatchWithGemini(proposal: ProposedChanges): Promise<GeminiReview> {
  const prompt = `## Improvement Patch Proposal

article_id: ${proposal.article_id}
assessment_id: ${proposal.assessment_id}
article_version_at_proposal: ${proposal.article_version_at_proposal}
expected_impact: ${proposal.expected_impact}
estimated_position_gain: ${proposal.estimated_position_gain}
changes_count: ${proposal.changes.length}

### Changes

${proposal.changes
  .map(
    (c, i) =>
      `#### Change ${i + 1} — ${c.type} (${c.priority})\ntarget: ${c.target}\nrationale: ${c.rationale}\n\nproposed_content:\n${c.proposed_content}`
  )
  .join("\n\n---\n\n")}

### Notes from Planner

${proposal.notes || "(none)"}`;

  const response = await getClient().chat.completions.create({
    model: MODELS.EDITOR,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: prompt },
    ],
  });

  const text = (response.choices[0]?.message?.content ?? "{}").trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { approved: false, confidence: 0, issues: ["Reviewer returned non-JSON response"], notes: text.slice(0, 200) };
  }

  const validated = GeminiReviewSchema.safeParse(parsed);
  if (!validated.success) {
    return { approved: false, confidence: 0, issues: ["Reviewer schema invalid"], notes: validated.error.message };
  }

  return validated.data;
}
