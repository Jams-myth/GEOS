import OpenAI from "openai";
import { MODELS } from "./models";
import { loadPrompt } from "./prompt-loader";
import { withRetry } from "../util/retry";
import { logTokenUsage } from "../cost/tracker";
import type { GeminiBrief } from "./gemini-brief";

export interface ScrapeResult {
  url: string;
  content_md: string;
  source_domain: string;
  authority_score: number;
}

export interface GenerateInput {
  primaryKeyword: string;
  secondaryKeywords: string[];
  targetAudience: string;
  informationGainAsset: string | null;
  wordCountTarget: [number, number];
  authorName: string;
  authorCredential: string;
  brandVoice: string;
  scrapes: ScrapeResult[];
  internalLinks: string[];
  headline: string;
  geminiBrief?: GeminiBrief;
}

// Cap each source at 6,000 chars (~1,500 tokens) — enough for Claude to extract
// facts and citations without dumping the full article into every prompt
const SOURCE_CHAR_LIMIT = 6_000;

function buildUserPrompt(input: GenerateInput): string {
  const {
    primaryKeyword,
    secondaryKeywords,
    targetAudience,
    informationGainAsset,
    wordCountTarget,
    authorName,
    authorCredential,
    brandVoice,
    scrapes,
    internalLinks,
    headline,
    geminiBrief,
  } = input;

  const igaSection = informationGainAsset
    ? `Information Gain Asset:\n${informationGainAsset}`
    : `Information Gain Asset: None available. Emit [PLACEHOLDER: INSERT UNIQUE DATA] in Section 3.9 as directed by the framework — do not fabricate.`;

  const scrapeContent = scrapes
    .map((s, i) => {
      const truncated =
        s.content_md.length > SOURCE_CHAR_LIMIT
          ? s.content_md.slice(0, SOURCE_CHAR_LIMIT) + "\n\n[...truncated]"
          : s.content_md;
      return `### Source ${i + 1}: ${s.source_domain} (authority: ${s.authority_score}/10)\nURL: ${s.url}\n\n${truncated}`;
    })
    .join("\n\n---\n\n");

  const internalLinksSection =
    internalLinks.length > 0
      ? `Internal link opportunities (use [INTERNAL LINK: topic] format where relevant):\n${internalLinks.join("\n")}`
      : "Internal links: None provided.";

  const briefSection = geminiBrief
    ? `## Strategic Brief (from Gemini research pass — follow this exactly)

Angle: ${geminiBrief.angle}

Must Cover (non-negotiable sections):
${geminiBrief.must_cover.map((t) => `- ${t}`).join("\n")}

Content Gap to Fill: ${geminiBrief.content_gap}

AI Citation Targets (cite these specifically):
${geminiBrief.ai_citation_targets.map((t) => `- ${t}`).join("\n")}

Recommended H2 Structure:
${geminiBrief.recommended_h2s.map((h, i) => `${i + 1}. ${h}`).join("\n")}

Key Entities to Name: ${geminiBrief.key_entities.join(", ")}

Ranking Signals: ${geminiBrief.ranking_signals}
`
    : "";

  const publishDate = new Date().toISOString().split("T")[0]; // YYYY-MM-DD

  return `Generate a complete article for the following brief. Follow all directives in your system prompt exactly.

## Required Inputs (Framework Section 2)

Headline: ${headline}
Primary Keyword: ${primaryKeyword}
Secondary Keywords: ${secondaryKeywords.join(", ")}
Target Audience: ${targetAudience}
${igaSection}
Word Count Target: ${wordCountTarget[0]}–${wordCountTarget[1]} words
Author Name: ${authorName}
Author Credential: ${authorCredential}
Tone / Brand Voice: ${brandVoice}
Publish Date: ${publishDate}

${internalLinksSection}

${briefSection}
## Scraped Sources

${scrapeContent}`;
}

function getClient(): OpenAI {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is not set");
  return new OpenAI({
    baseURL: "https://openrouter.ai/api/v1",
    apiKey,
  });
}

export async function generateWithClaude(
  input: GenerateInput,
  articleId?: string
): Promise<string> {
  const systemPrompt = await loadPrompt("writer-system.md");
  const userPrompt = buildUserPrompt(input);

  return withRetry(async () => {
    const response = await getClient().chat.completions.create({
      model: MODELS.WRITER,
      max_tokens: 8192,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    });

    logTokenUsage({
      articleId,
      functionName: "generate-article",
      stepName: "generate-draft",
      model: MODELS.WRITER,
      inputTokens: response.usage?.prompt_tokens ?? 0,
      outputTokens: response.usage?.completion_tokens ?? 0,
    });

    return response.choices[0]?.message?.content ?? "";
  });
}

export interface RevisionInput {
  rawMarkdown: string;
  revisionNotes: string[];
  originalInput: GenerateInput;
}

// Targeted fix — only sent when the single Gemini quality check flags specific issues.
// No full rewrite: Claude applies the revision notes to the existing draft.
// Sources are NOT re-sent to keep token cost low.
export async function reviseWithClaude(
  input: RevisionInput,
  articleId?: string
): Promise<string> {
  const systemPrompt = await loadPrompt("writer-system.md");

  const userPrompt = `You are revising an article draft based on editorial feedback. Apply all revision notes precisely to the draft while maintaining full compliance with your system prompt directives.

## Revision Notes (apply all of these)

${input.revisionNotes.map((note, i) => `${i + 1}. ${note}`).join("\n")}

## Current Draft

${input.rawMarkdown}

## Original Brief (context only)

Primary Keyword: ${input.originalInput.primaryKeyword}
Author: ${input.originalInput.authorName}, ${input.originalInput.authorCredential}
Target Audience: ${input.originalInput.targetAudience}
Brand Voice: ${input.originalInput.brandVoice}

Produce the complete revised article. Output begins at the META BLOCK and ends at the Author Bio.`;

  return withRetry(async () => {
    const response = await getClient().chat.completions.create({
      model: MODELS.WRITER,
      max_tokens: 8192,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    });

    logTokenUsage({
      articleId,
      functionName: "generate-article",
      stepName: "revise",
      model: MODELS.WRITER,
      inputTokens: response.usage?.prompt_tokens ?? 0,
      outputTokens: response.usage?.completion_tokens ?? 0,
    });

    return response.choices[0]?.message?.content ?? "";
  });
}
