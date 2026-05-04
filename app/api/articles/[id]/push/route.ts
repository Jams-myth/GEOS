export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getDb } from "../../../../../lib/db/client";

interface VercelConfig {
  revalidate_url?: string;
  revalidate_token?: string;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params;

  let body: { siteId?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { siteId } = body;
  if (!siteId) {
    return NextResponse.json({ error: "siteId is required" }, { status: 400 });
  }

  const db = getDb();

  // Fetch article
  const { data: article, error: articleError } = await db
    .from("articles")
    .select("id, slug, status, published_at, site_id")
    .eq("id", id)
    .single();

  if (articleError || !article) {
    return NextResponse.json({ error: "Article not found" }, { status: 404 });
  }

  // Fetch site config
  const { data: site, error: siteError } = await db
    .from("sites")
    .select("id, name, domain, vercel_config_jsonb")
    .eq("id", siteId)
    .single();

  if (siteError || !site) {
    return NextResponse.json({ error: "Site not found" }, { status: 404 });
  }

  const domain = site.domain.replace(/^https?:\/\//, "");
  const articleUrl = `https://${domain}/articles/${article.slug}`;
  const now = new Date().toISOString();

  // Update article: assign to site, mark published, set live URL
  const { error: updateError } = await db
    .from("articles")
    .update({
      site_id: siteId,
      url: articleUrl,
      status: "published",
      published_at: article.published_at ?? now,
      updated_at: now,
    })
    .eq("id", id);

  if (updateError) {
    return NextResponse.json({ error: `Failed to update article: ${updateError.message}` }, { status: 500 });
  }

  // Attempt ISR revalidation on the target site
  let revalidated = false;
  let revalidateError: string | null = null;

  const vercelConfig = site.vercel_config_jsonb as VercelConfig | null;
  const revalidateUrl = vercelConfig?.revalidate_url;
  const revalidateToken =
    vercelConfig?.revalidate_token ?? process.env.VERCEL_REVALIDATE_SECRET;

  if (revalidateUrl && revalidateToken) {
    try {
      const res = await fetch(revalidateUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-revalidate-token": revalidateToken,
        },
        body: JSON.stringify({ slug: article.slug }),
      });

      if (res.ok) {
        revalidated = true;
      } else {
        revalidateError = `Revalidation returned ${res.status}`;
      }
    } catch (err) {
      revalidateError = `Revalidation request failed: ${err instanceof Error ? err.message : String(err)}`;
    }
  } else {
    revalidateError = revalidateUrl
      ? "No revalidate token configured"
      : "No revalidate URL configured — article will appear within 1 hour";
  }

  return NextResponse.json({
    ok: true,
    articleUrl,
    siteName: site.name,
    revalidated,
    revalidateNote: revalidateError,
  });
}
