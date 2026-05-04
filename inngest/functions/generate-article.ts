import { createHash } from "node:crypto";
import { inngest } from "../client";
import { getDb } from "../../lib/db/client";
import { generateWithClaude, reviseWithClaude } from "../../lib/llm/claude";
import type { GenerateInput, ScrapeResult, RevisionInput } from "../../lib/llm/claude";
import { reviewWithGemini } from "../../lib/llm/gemini";
import { parseMetaBlock } from "../../lib/parsing/meta-block";
import { scrapeSources } from "../../lib/scrape/index";
import { uploadToSupabaseStorage, fetchAsBuffer } from "../../lib/storage/supabase-storage";
import { publishArticleRow, revalidateLiveSite } from "../../lib/cms/nextjs-vercel";
import { submitToIndexer } from "../../lib/indexing/index";
import { notifyDiscord } from "../../lib/notify/discord";
import { sendArticlePublishedEmail } from "../../lib/notify/email";
import type { IndexingAdapter } from "../../lib/db/types";
import type { Json } from "../../lib/db/types";

interface DefaultAuthor {
  name?: string;
  credential?: string;
}

interface StructureTemplate {
  target_audience?: string;
  word_count_default?: [number, number];
}

interface NotificationConfig {
  email?: string;
}

interface ApprovalConfig {
  auto_publish?: boolean;
}

interface FalImageResponse {
  data?: Array<{ url?: string }>;
  images?: Array<{ url?: string }>;
}

function slugify(headline: string): string {
  return headline
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80);
}

function extractInfoGainAsset(scrapes: ScrapeResult[]): string | null {
  // Sort by authority score descending
  const sorted = [...scrapes].sort((a, b) => b.authority_score - a.authority_score);

  for (const scrape of sorted) {
    const lines = scrape.content_md.split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.length < 60) continue; // Too short for meaningful context

      // Statistics: numbers with %, £, $, units
      if (/\b\d+(\.\d+)?[\s]?[%£$€]|\b\d+[\s]?(mg|kg|ml|km|mph|bpm|mmhg)\b/i.test(trimmed)) {
        const words = trimmed.split(/\s+/);
        if (words.length >= 15) return trimmed;
      }

      // Named quotes: lines starting with " or containing 'said' / 'according to'
      if (
        trimmed.startsWith('"') ||
        /\b(said|according to|stated|confirmed|noted|told|explains)\b/i.test(trimmed)
      ) {
        const words = trimmed.split(/\s+/);
        if (words.length >= 15) return trimmed;
      }

      // Named studies: references to studies, trials, research
      if (/\b(study|trial|research|survey|report|analysis|data)\b/i.test(trimmed)) {
        const words = trimmed.split(/\s+/);
        if (words.length >= 15) return trimmed;
      }
    }
  }
  return null;
}

function countFootnotes(bodyMd: string): number {
  return (bodyMd.match(/\[\^[0-9]+\]:/g) ?? []).length;
}

function countTables(bodyMd: string): number {
  // Count header separator lines (| ---) — one per table
  return (bodyMd.match(/^\|[\s\-|]+$/gm) ?? []).length;
}

function countQuotes(bodyMd: string): number {
  return (bodyMd.match(/^>/gm) ?? []).length;
}

export const generateArticle = inngest.createFunction(
  {
    id: "generate-article",
    concurrency: { limit: 2 },
    retries: 3,
    triggers: [{ event: "topic.selected" }],
  },
  async ({ event, step }) => {
    // Deterministic article ID — retries hit the same upsert
    const articleId = createHash("sha256")
      .update(`${event.data.siteId}-${event.data.headline}`)
      .digest("hex")
      .slice(0, 36);

    // ─── Step 1: Load site config ────────────────────────────────────────────
    const { site, keywordCluster } = await step.run(
      `load-site-config-${articleId}`,
      async () => {
        const db = getDb();

        const { data: siteData, error: siteError } = await db
          .from("sites")
          .select(
            "id, name, domain, brand_voice, default_author_jsonb, structure_template_jsonb, indexing_adapters, notification_config_jsonb, approval_config_jsonb, monthly_cost_cap_usd"
          )
          .eq("id", event.data.siteId)
          .single();

        if (siteError || !siteData) {
          throw new Error(`Site not found: ${event.data.siteId}`);
        }

        const { data: kwData } = await db
          .from("keyword_clusters")
          .select("*")
          .eq("primary_keyword", event.data.keywordCluster)
          .eq("site_id", event.data.siteId)
          .single();

        return { site: siteData, keywordCluster: kwData ?? null };
      }
    );

    // ─── Step 1b: Monthly cost cap preflight ─────────────────────────────────
    if (site.monthly_cost_cap_usd != null) {
      const capExceeded = await step.run(`check-cost-cap-${articleId}`, async () => {
        const db = getDb();
        const startOfMonth = new Date();
        startOfMonth.setDate(1);
        startOfMonth.setHours(0, 0, 0, 0);

        const { data } = await db
          .from("token_usage_logs")
          .select("cost_usd")
          .gte("created_at", startOfMonth.toISOString());

        const monthlySpend = (data ?? []).reduce((s, r) => s + Number(r.cost_usd), 0);
        return monthlySpend >= site.monthly_cost_cap_usd!;
      });

      if (capExceeded) {
        return {
          status: "skipped",
          reason: "monthly_cost_cap_exceeded",
          siteId: event.data.siteId,
        };
      }
    }

    // ─── Step 2: Scrape sources ───────────────────────────────────────────────
    const scrapes = await step.run(`scrape-sources-${articleId}`, async () => {
      return scrapeSources(event.data.sourceUrls);
    });

    // ─── Step 3: Select Information Gain Asset ────────────────────────────────
    const infoGainAsset = await step.run(`select-info-gain-asset-${articleId}`, async () => {
      return extractInfoGainAsset(scrapes);
    });

    // ─── Step 4: Generate draft ───────────────────────────────────────────────
    const defaultAuthor = (site.default_author_jsonb as DefaultAuthor | null) ?? {};
    const structureTemplate = (site.structure_template_jsonb as StructureTemplate | null) ?? {};

    const generateInput: GenerateInput = {
      primaryKeyword: keywordCluster?.primary_keyword || event.data.keywordCluster || event.data.headline,
      secondaryKeywords: keywordCluster?.related_keywords ?? [],
      targetAudience: structureTemplate.target_audience ?? "General UK adult audience",
      informationGainAsset: infoGainAsset,
      wordCountTarget: structureTemplate.word_count_default ?? [1200, 1800],
      authorName: defaultAuthor.name ?? "Editorial Team",
      authorCredential: defaultAuthor.credential ?? "",
      brandVoice: site.brand_voice ?? "Professional, informative, UK English",
      scrapes,
      internalLinks: [],
      headline: event.data.headline,
    };

    const rawMarkdown = await step.run(`generate-draft-${articleId}`, async () => {
      return generateWithClaude(generateInput, articleId);
    });

    // ─── Step 5: Parse meta block ─────────────────────────────────────────────
    const parsedDraft = await step.run(`parse-meta-block-${articleId}`, async () => {
      return parseMetaBlock(rawMarkdown);
    });

    // ─── Step 6: Editor review 1 ─────────────────────────────────────────────
    const editorResult1 = await step.run(`editor-review-1-${articleId}`, async () => {
      return reviewWithGemini(parsedDraft, articleId);
    });

    // Placeholder check after first review
    if (editorResult1.placeholderDetected) {
      await step.run(`flag-placeholder-manual-review-${articleId}`, async () => {
        await notifyDiscord({
          kind: "placeholder_detected",
          articleId,
          headline: event.data.headline,
        });
      });
      return { status: "manual_review_required", reason: "placeholder_detected" };
    }

    // Track current state through revision loop
    let currentMarkdown = rawMarkdown;
    let currentParsed = parsedDraft;
    let currentEditorResult = editorResult1;

    // ─── Steps 7–9: Revision loop ─────────────────────────────────────────────
    if (!currentEditorResult.pass) {
      // Revision 1
      const revisionInput1: RevisionInput = {
        rawMarkdown: currentMarkdown,
        revisionNotes: currentEditorResult.revision_notes,
        originalInput: generateInput,
      };

      currentMarkdown = await step.run(`revise-1-${articleId}`, async () => {
        return reviseWithClaude(revisionInput1, articleId);
      });

      currentParsed = await step.run(`parse-meta-block-rev1-${articleId}`, async () => {
        return parseMetaBlock(currentMarkdown);
      });

      currentEditorResult = await step.run(`editor-review-2-${articleId}`, async () => {
        return reviewWithGemini(currentParsed, articleId);
      });

      // Placeholder check after revision 1
      if (currentEditorResult.placeholderDetected) {
        await step.run(`flag-placeholder-rev1-${articleId}`, async () => {
          await notifyDiscord({
            kind: "placeholder_detected",
            articleId,
            headline: event.data.headline,
          });
        });
        return { status: "manual_review_required", reason: "placeholder_detected" };
      }

      if (!currentEditorResult.pass) {
        // Revision 2
        const revisionInput2: RevisionInput = {
          rawMarkdown: currentMarkdown,
          revisionNotes: currentEditorResult.revision_notes,
          originalInput: generateInput,
        };

        currentMarkdown = await step.run(`revise-2-${articleId}`, async () => {
          return reviseWithClaude(revisionInput2, articleId);
        });

        currentParsed = await step.run(`parse-meta-block-rev2-${articleId}`, async () => {
          return parseMetaBlock(currentMarkdown);
        });

        currentEditorResult = await step.run(`editor-review-3-${articleId}`, async () => {
          return reviewWithGemini(currentParsed, articleId);
        });

        // Placeholder check after revision 2
        if (currentEditorResult.placeholderDetected) {
          await step.run(`flag-placeholder-rev2-${articleId}`, async () => {
            await notifyDiscord({
              kind: "placeholder_detected",
              articleId,
              headline: event.data.headline,
            });
          });
          return { status: "manual_review_required", reason: "placeholder_detected" };
        }

        // Allow publish if only meta_block_ok failed but content scores are strong
        const scores = Object.values(currentEditorResult.scores);
        const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
        const onlyMetaFailing =
          !currentEditorResult.hard_checks.meta_block_ok &&
          !currentEditorResult.placeholderDetected &&
          currentEditorResult.hard_checks.footnotes >= 3 &&
          currentEditorResult.hard_checks.faq_questions >= 4 &&
          currentEditorResult.hard_checks.tldr_bullets >= 4 &&
          avgScore >= 7;

        if (!currentEditorResult.pass && !onlyMetaFailing) {
          // Still failing after 2 revisions — send to manual review
          await step.run(`notify-manual-review-${articleId}`, async () => {
            const notificationConfig =
              (site.notification_config_jsonb as NotificationConfig | null) ?? {};
            await notifyDiscord({
              kind: "manual_review",
              articleId,
              headline: event.data.headline,
              draftExcerpt: currentParsed.body_md.slice(0, 200),
              revisionNotes: currentEditorResult.revision_notes,
            });
            if (notificationConfig.email) {
              const { sendManualReviewEmail } = await import("../../lib/notify/email");
              await sendManualReviewEmail({
                to: notificationConfig.email,
                headline: event.data.headline,
                articleId,
                revisionNotes: currentEditorResult.revision_notes,
                reason: "Failed editor review after 2 revisions",
              });
            }
          });
          return { status: "manual_review_required", reason: "failed_after_2_revisions" };
        }
      }
    }

    // ─── Step 9b: Semantic duplicate check via pgvector ──────────────────────
    const isDuplicate = await step.run(`check-duplicate-${articleId}`, async () => {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) return false; // Skip if OpenAI not configured

      const OpenAI = (await import("openai")).default;
      const client = new OpenAI({ apiKey });

      // Embed the first 2000 chars of the final body to keep token cost low
      const textToEmbed = currentParsed.body_md.slice(0, 2000);
      const embeddingResponse = await client.embeddings.create({
        model: "text-embedding-3-small",
        input: textToEmbed,
      });
      const embedding = embeddingResponse.data[0].embedding;

      const db = getDb();
      // Store embedding on the article row (upsert-safe — article may not exist yet)
      // We store as a JSON string; the DB column is vector(1536)
      await db
        .from("articles")
        .update({ body_embedding: JSON.stringify(embedding) })
        .eq("id", articleId);

      // Check for near-duplicate articles (cosine similarity > 0.9)
      const { data: matches } = await db.rpc("match_articles", {
        query_embedding: JSON.stringify(embedding),
        match_threshold: 0.9,
        match_count: 1,
        site_id_filter: event.data.siteId,
      });

      // Exclude self from results
      return (matches ?? []).some((m: { id: string }) => m.id !== articleId);
    });

    if (isDuplicate) {
      return {
        status: "skipped",
        reason: "semantic_duplicate_detected",
        articleId,
      };
    }

    // ─── Step 10: Generate and store featured image ───────────────────────────
    const featuredImageUrl = await step.run(`generate-and-store-image-${articleId}`, async () => {
      const falKey = process.env.FAL_KEY;
      if (!falKey) throw new Error("FAL_KEY is not set");

      const imagePrompt = `Professional photograph showing ${event.data.headline}, clean white background, editorial style`;

      const falResponse = await fetch("https://fal.run/fal-ai/flux/schnell", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Key ${falKey}`,
        },
        body: JSON.stringify({
          prompt: imagePrompt,
          image_size: "landscape_16_9",
        }),
        signal: AbortSignal.timeout(60_000),
      });

      if (!falResponse.ok) {
        throw new Error(`fal.ai image generation failed: ${falResponse.status} ${falResponse.statusText}`);
      }

      const falData = (await falResponse.json()) as FalImageResponse;
      const ephemeralUrl =
        falData.data?.[0]?.url ?? falData.images?.[0]?.url;

      if (!ephemeralUrl) {
        throw new Error("fal.ai response did not contain an image URL");
      }

      // Fetch and upload to Supabase Storage — return only the permanent URL
      const buffer = await fetchAsBuffer(ephemeralUrl);
      const permanentUrl = await uploadToSupabaseStorage(
        buffer,
        `${articleId}/featured.png`
      );

      // ephemeralUrl is intentionally not returned — only the permanent Supabase URL leaves this closure
      return permanentUrl;
    });

    // ─── Step 11: Publish to Supabase ─────────────────────────────────────────
    const published = await step.run(`publish-to-supabase-${articleId}`, async () => {
      const slug = slugify(event.data.headline);
      const footnoteCount = countFootnotes(currentParsed.body_md);
      const tableCount = countTables(currentParsed.body_md);
      const quoteCount = countQuotes(currentParsed.body_md);

      const defaultAuthorLocal = (site.default_author_jsonb as DefaultAuthor | null) ?? {};

      return publishArticleRow({
        siteId: event.data.siteId,
        articleId,
        slug,
        title: event.data.headline,
        primaryKeyword: event.data.keywordCluster,
        secondaryKeywords: keywordCluster?.related_keywords ?? [],
        authorName: defaultAuthorLocal.name ?? "Editorial Team",
        authorCredential: defaultAuthorLocal.credential ?? "",
        parsedMeta: {
          meta_title: currentParsed.meta_title,
          meta_description: currentParsed.meta_description,
          schema_type: currentParsed.schema_type,
          tldr_bullets: currentParsed.tldr_bullets,
          body_md: currentParsed.body_md,
        },
        featuredImageUrl,
        footnoteCount,
        tableCount,
        quoteCount,
        generationScores: currentEditorResult.scores as unknown as Json,
      });
    });

    // ─── Step 12: Revalidate Vercel ───────────────────────────────────────────
    // REVALIDATION — only fires on successful publish path
    await step.run(`revalidate-vercel-${articleId}`, async () => {
      await revalidateLiveSite(event.data.siteId, [
        `/blog/${published.slug}`,
        "/blog",
        "/sitemap.xml",
      ]);
    });

    // ─── Steps 13–14: Indexing ────────────────────────────────────────────────
    const indexingAdapters = await step.run(`load-indexing-adapters-${articleId}`, async () => {
      return (site.indexing_adapters ?? []) as IndexingAdapter[];
    });

    const indexingResults: Array<{ adapter: string; jobId: string; status: string }> = [];

    for (const adapter of indexingAdapters) {
      const result = await step.run(`index-${adapter}-${articleId}`, async () => {
        return submitToIndexer(adapter, published.url);
      });
      indexingResults.push(result);
    }

    // Persist indexing job results
    if (indexingResults.length > 0) {
      await step.run(`persist-indexing-jobs-${articleId}`, async () => {
        const db = getDb();
        await db
          .from("articles")
          .update({ indexing_jobs_jsonb: indexingResults as unknown as Json })
          .eq("id", articleId);
      });
    }

    // ─── Step 15: Send notifications ──────────────────────────────────────────
    await step.run(`send-notifications-${articleId}`, async () => {
      const notificationConfig =
        (site.notification_config_jsonb as NotificationConfig | null) ?? {};

      const scores = currentEditorResult.scores as Record<string, number>;

      await notifyDiscord({
        kind: "article_published",
        articleId,
        title: event.data.headline,
        url: published.url,
        scores,
        footnoteCount: countFootnotes(currentParsed.body_md),
        tableCount: countTables(currentParsed.body_md),
        quoteCount: countQuotes(currentParsed.body_md),
      });

      if (notificationConfig.email) {
        await sendArticlePublishedEmail({
          to: notificationConfig.email,
          articleTitle: event.data.headline,
          articleUrl: published.url,
          scores,
          siteId: event.data.siteId,
        });
      }
    });

    // ─── Step 16: Emit article.published event ────────────────────────────────
    await step.sendEvent(`emit-published-${articleId}`, {
      name: "article.published",
      data: {
        articleId: published.id,
        siteId: event.data.siteId,
        url: published.url,
      },
    });

    return {
      status: "published",
      articleId: published.id,
      url: published.url,
    };
  }
);
