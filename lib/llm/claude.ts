import Anthropic from "@anthropic-ai/sdk";
import { MODELS } from "./models";
import { loadPrompt } from "./prompt-loader";
import { withRetry } from "../util/retry";
import { logTokenUsage } from "../cost/tracker";

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
}

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
  } = input;

  const igaSection = informationGainAsset
    ? `Information Gain Asset:\n${informationGainAsset}`
    : `Information Gain Asset: None available. Emit [PLACEHOLDER: INSERT UNIQUE DATA] in Section 3.9 as directed by the framework — do not fabricate.`;

  const scrapeContent = scrapes
    .map(
      (s, i) =>
        `### Source ${i + 1}: ${s.source_domain} (authority: ${s.authority_score}/10)\nURL: ${s.url}\n\n${s.content_md}`
    )
    .join("\n\n---\n\n");

  const internalLinksSection =
    internalLinks.length > 0
      ? `Internal link opportunities (use [INTERNAL LINK: topic] format where relevant):\n${internalLinks.join("\n")}`
      : "Internal links: None provided.";

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

${internalLinksSection}

## Scraped Sources

${scrapeContent}`;
}

export async function generateWithClaude(
  input: GenerateInput,
  articleId?: string
): Promise<string> {
  const systemPrompt = await loadPrompt("writer-system.md");
  const userPrompt = buildUserPrompt(input);

  return withRetry(async () => {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const response = await client.messages.create({
      model: MODELS.WRITER,
      system: systemPrompt,
      max_tokens: 8192,
      messages: [{ role: "user", content: userPrompt }],
    });

    logTokenUsage({
      articleId,
      functionName: "generate-article",
      stepName: "generate-draft",
      model: MODELS.WRITER,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    });

    return response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("");
  });
}

export interface RevisionInput {
  rawMarkdown: string;
  revisionNotes: string[];
  originalInput: Omit<GenerateInput, "scrapes" | "internalLinks"> & {
    scrapes: ScrapeResult[];
    internalLinks: string[];
  };
}

export async function reviseWithClaude(
  input: RevisionInput,
  articleId?: string
): Promise<string> {
  const systemPrompt = await loadPrompt("writer-system.md");

  const userPrompt = `You are revising an article draft based on editorial feedback. Apply all revision notes below to the draft while maintaining full compliance with your system prompt directives.

## Revision Notes

${input.revisionNotes.map((note, i) => `${i + 1}. ${note}`).join("\n")}

## Current Draft

${input.rawMarkdown}

## Original Brief (for context)

Primary Keyword: ${input.originalInput.primaryKeyword}
Author: ${input.originalInput.authorName}, ${input.originalInput.authorCredential}
Target Audience: ${input.originalInput.targetAudience}
Brand Voice: ${input.originalInput.brandVoice}

Produce the complete revised article. Output begins at the META BLOCK and ends at the Author Bio.`;

  return withRetry(async () => {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const response = await client.messages.create({
      model: MODELS.WRITER,
      system: systemPrompt,
      max_tokens: 8192,
      messages: [{ role: "user", content: userPrompt }],
    });

    logTokenUsage({
      articleId,
      functionName: "generate-article",
      stepName: "revise",
      model: MODELS.WRITER,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    });

    return response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("");
  });
}
