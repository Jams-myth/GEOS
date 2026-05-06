import { NextRequest, NextResponse } from "next/server";
import { getDb } from "../../../../../lib/db/client";
import { inngest } from "../../../../../inngest/client";

/**
 * POST /api/articles/[id]/regenerate
 *
 * Clears the article's scores and queues a full regeneration via the
 * generate-article Inngest function. Uses the article's existing
 * primary_keyword and site_id to fire a fresh topic.selected event,
 * fetching new Google News source URLs for grounding.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = getDb();

  // Load the article
  const { data: article, error } = await db
    .from("articles")
    .select("id, title, primary_keyword, site_id, status")
    .eq("id", id)
    .single();

  if (error || !article) {
    return NextResponse.json({ ok: false, error: "Article not found" }, { status: 404 });
  }

  const keyword = article.primary_keyword ?? article.title;
  const siteId = article.site_id;

  if (!siteId) {
    return NextResponse.json({ ok: false, error: "Article has no site_id" }, { status: 400 });
  }

  // Fetch fresh source URLs from Google News for this keyword
  let sourceUrls: string[] = [];
  try {
    const newsUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(keyword)}&hl=en-GB&gl=GB&ceid=GB:en`;
    const res = await fetch(newsUrl, { signal: AbortSignal.timeout(10_000) });
    if (res.ok) {
      const xml = await res.text();
      const links = [...xml.matchAll(/<link>(.*?)<\/link>/g)]
        .map((m) => m[1].trim())
        .filter((u) => u.startsWith("https://") && !u.includes("news.google.com"));
      sourceUrls = links.slice(0, 5);
    }
  } catch {
    // Non-fatal — generate-article can work without source URLs
  }

  // Clear the stale scores so the admin card reflects "regenerating" state
  await db
    .from("articles")
    .update({
      generation_scores_jsonb: null,
      status: "draft",
    })
    .eq("id", id);

  // Fire a fresh topic.selected event — generate-article uses a deterministic
  // article ID (hash of siteId + headline) so it will upsert over this record
  await inngest.send({
    name: "topic.selected",
    data: {
      siteId,
      headline: article.title,
      sourceUrls,
      keywordCluster: keyword,
    },
  });

  return NextResponse.json({
    ok: true,
    message: "Regeneration queued. The article will be rewritten and re-scored — check Discord when ready.",
    keyword,
    sourceUrlCount: sourceUrls.length,
  });
}
