export const runtime = "nodejs";
export const maxDuration = 300; // 5 min — Claude revision + Gemini re-score

import { NextRequest, NextResponse } from "next/server";
import { getDb } from "../../../../../lib/db/client";
import { reviseWithClaude } from "../../../../../lib/llm/claude";
import type { GenerateInput } from "../../../../../lib/llm/claude";
import { reviewWithGemini } from "../../../../../lib/llm/gemini";
import { parseMetaBlock } from "../../../../../lib/parsing/meta-block";
import { revalidateLiveSite } from "../../../../../lib/cms/nextjs-vercel";
import type { Json } from "../../../../../lib/db/types";

// Three targeted structural fixes for articles written before the v2 prompt
const RE_POLISH_REVISION_NOTES = [
  "Footnote format: Convert every Markdown footnote (`[^1]`, `[^2]`, `[^n]:`) to an HTML superscript. In-text citations must use `<sup><a href=\"#ref-n\">[n]</a></sup>`. The references list at the end must use a `## References` section with `<p id=\"ref-n\">[n] Author/Organisation. Title. Year. URL</p>` anchor elements. Remove all raw `[^n]` syntax entirely.",
  "Inline citations: For every named external source (NICE, MHRA, NHS, JAMA, a named clinical trial, a named study) mentioned in the article body, wrap the source name in a Markdown hyperlink pointing to the actual URL. The link should appear inline in the sentence where the source is first named — not only in the references list at the bottom.",
  "Pricing table totals: If the article contains a pricing comparison table listing monthly or per-dose costs for multiple providers, add a '6-Month Total' column (or row) that explicitly states the total cost for a standard 6-month course, including any one-off consultation or joining fees. Show the calculated figure — do not leave the arithmetic to the reader.",
];

interface DefaultAuthor {
  name?: string;
  credential?: string;
}

interface StructureTemplate {
  target_audience?: string;
  word_count_default?: [number, number];
}

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params;

  const db = getDb();

  // ── Load article ────────────────────────────────────────────────────────────
  const { data: article, error: articleError } = await db
    .from("articles")
    .select("id, slug, title, primary_keyword, secondary_keywords, body_md, status, site_id, version")
    .eq("id", id)
    .single();

  if (articleError || !article) {
    return NextResponse.json({ error: "Article not found" }, { status: 404 });
  }

  if (!article.body_md) {
    return NextResponse.json({ error: "Article has no body content" }, { status: 400 });
  }

  // ── Load site config for author/voice context ───────────────────────────────
  let authorName = "Editorial Team";
  let authorCredential = "";
  let brandVoice = "Professional, informative, UK English";
  let targetAudience = "General UK adult audience";
  let wordCountTarget: [number, number] = [1200, 1800];

  const siteId = article.site_id;

  if (siteId) {
    const { data: site } = await db
      .from("sites")
      .select("brand_voice, default_author_jsonb, structure_template_jsonb")
      .eq("id", siteId)
      .single();

    if (site) {
      const defaultAuthor = (site.default_author_jsonb as DefaultAuthor | null) ?? {};
      const structureTemplate = (site.structure_template_jsonb as StructureTemplate | null) ?? {};
      authorName = defaultAuthor.name ?? "Editorial Team";
      authorCredential = defaultAuthor.credential ?? "";
      brandVoice = site.brand_voice ?? brandVoice;
      targetAudience = structureTemplate.target_audience ?? targetAudience;
      wordCountTarget = structureTemplate.word_count_default ?? wordCountTarget;
    }
  }

  // Build minimal GenerateInput — scrapes not needed for a targeted revision
  const originalInput: GenerateInput = {
    primaryKeyword: article.primary_keyword ?? article.title ?? "",
    secondaryKeywords: (article.secondary_keywords as string[] | null) ?? [],
    targetAudience,
    informationGainAsset: null,
    wordCountTarget,
    authorName,
    authorCredential,
    brandVoice,
    scrapes: [],
    internalLinks: [],
    headline: article.title ?? "",
  };

  // ── Step 1: Targeted revision via Claude ────────────────────────────────────
  let revisedMarkdown: string;
  try {
    revisedMarkdown = await reviseWithClaude(
      {
        rawMarkdown: article.body_md,
        revisionNotes: RE_POLISH_REVISION_NOTES,
        originalInput,
      },
      article.id
    );
  } catch (err) {
    return NextResponse.json(
      { error: `Revision failed: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    );
  }

  // ── Step 2: Parse meta block ─────────────────────────────────────────────────
  const parsedDraft = parseMetaBlock(revisedMarkdown);

  // ── Step 3: Re-score with Gemini v2 rubric ──────────────────────────────────
  let editorResult;
  try {
    editorResult = await reviewWithGemini(parsedDraft, article.id);
  } catch (err) {
    return NextResponse.json(
      { error: `Re-score failed: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    );
  }

  const nextVersion = (article.version ?? 1) + 1;

  // ── Step 4: Persist revised body + scores ───────────────────────────────────
  const { error: updateError } = await db
    .from("articles")
    .update({
      body_md: parsedDraft.body_md,
      generation_scores_jsonb: editorResult.scores as unknown as Json,
      version: nextVersion,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (updateError) {
    return NextResponse.json(
      { error: `Failed to save revision: ${updateError.message}` },
      { status: 500 }
    );
  }

  // ── Step 5: Revalidate live site if published ────────────────────────────────
  let revalidated = false;
  if (article.status === "published" && siteId) {
    try {
      await revalidateLiveSite(siteId, [`/articles/${article.slug}`]);
      revalidated = true;
    } catch {
      // Non-fatal — article will pick up the new content within 1 hour
    }
  }

  return NextResponse.json({
    ok: true,
    scores: editorResult.scores,
    pass: editorResult.pass,
    hardChecks: editorResult.hard_checks,
    revisionNotes: editorResult.revision_notes,
    newVersion: nextVersion,
    revalidated,
  });
}
