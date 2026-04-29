import { getDb } from "../db/client";
import type { ArticleInsert } from "../db/types";
import type { Json } from "../db/types.generated";
import type { ParsedDraft } from "../parsing/meta-block";

interface PublishInput {
  siteId: string;
  articleId: string;
  slug: string;
  title: string;
  primaryKeyword: string;
  secondaryKeywords: string[];
  authorName: string;
  authorCredential: string;
  parsedMeta: Pick<ParsedDraft, "meta_title" | "meta_description" | "schema_type" | "tldr_bullets" | "body_md">;
  featuredImageUrl: string;
  faqJsonLd?: Json;
  footnoteCount?: number;
  tableCount?: number;
  quoteCount?: number;
  generationScores?: Json;
}

interface PublishResult {
  id: string;
  slug: string;
  url: string;
}

export async function publishArticleRow(input: PublishInput): Promise<PublishResult> {
  const db = getDb();

  const { data: site, error: siteError } = await db
    .from("sites")
    .select("domain")
    .eq("id", input.siteId)
    .single();

  if (siteError || !site) throw new Error(`Site not found: ${input.siteId}`);

  const url = `https://${site.domain}/blog/${input.slug}`;
  const now = new Date().toISOString();

  const upsertRow: ArticleInsert = {
    id: input.articleId,
    site_id: input.siteId,
    slug: input.slug,
    url,
    title: input.title,
    meta_title: input.parsedMeta.meta_title,
    meta_description: input.parsedMeta.meta_description,
    schema_type: input.parsedMeta.schema_type,
    tldr_bullets: input.parsedMeta.tldr_bullets,
    author_name: input.authorName,
    author_credential: input.authorCredential,
    body_md: input.parsedMeta.body_md,
    primary_keyword: input.primaryKeyword,
    secondary_keywords: input.secondaryKeywords,
    featured_image_url: input.featuredImageUrl,
    faq_json_ld: input.faqJsonLd ?? null,
    generation_scores_jsonb: input.generationScores ?? null,
    footnote_count: input.footnoteCount ?? 0,
    table_count: input.tableCount ?? 0,
    quote_count: input.quoteCount ?? 0,
    status: "published",
    published_at: now,
    updated_at: now,
  };

  const { data, error } = await db
    .from("articles")
    .upsert(upsertRow, { onConflict: "id" })
    .select("id, slug, url")
    .single();

  if (error || !data) throw new Error(`Failed to publish article: ${error?.message}`);

  return data;
}

export async function updateArticleBody(
  articleId: string,
  newBodyMd: string
): Promise<number> {
  const db = getDb();

  const { data, error } = await db
    .from("articles")
    .update({
      body_md: newBodyMd,
      updated_at: new Date().toISOString(),
    })
    .eq("id", articleId)
    .select("version")
    .single();

  if (error || !data) throw new Error(`Failed to update article ${articleId}: ${error?.message}`);

  // Increment version manually since Supabase doesn't support expressions in update
  const newVersion = (data.version ?? 1) + 1;
  await db.from("articles").update({ version: newVersion }).eq("id", articleId);

  return newVersion;
}

export async function revalidateLiveSite(
  siteId: string,
  paths: string[]
): Promise<void> {
  const db = getDb();

  // Try to get revalidate URL from site config, fall back to env var
  let revalidateUrl: string | undefined;

  const { data: site } = await db
    .from("sites")
    .select("vercel_config_jsonb")
    .eq("id", siteId)
    .single();

  const vercelConfig = site?.vercel_config_jsonb as Record<string, string> | null;
  revalidateUrl = vercelConfig?.revalidate_url ?? process.env.VERCEL_REVALIDATE_URL;

  if (!revalidateUrl) {
    throw new Error(`No revalidate URL configured for site ${siteId}. Set VERCEL_REVALIDATE_URL or configure vercel_config_jsonb.revalidate_url.`);
  }

  const secret = process.env.VERCEL_REVALIDATE_SECRET;
  if (!secret) throw new Error("VERCEL_REVALIDATE_SECRET is not set");

  const response = await fetch(revalidateUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${secret}`,
    },
    body: JSON.stringify({ paths }),
  });

  if (!response.ok) {
    throw new Error(`Revalidation failed: ${response.status} ${await response.text()}`);
  }
}
