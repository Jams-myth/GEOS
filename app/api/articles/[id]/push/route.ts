export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getDb } from "../../../../../lib/db/client";
import { submitToSpeedyIndex } from "../../../../../lib/indexing/speedyindex";
import type { Json } from "../../../../../lib/db/types";

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
    .select("id, slug, url, status, published_at, site_id")
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
  // Always use /articles/ — the canonical path on comparemeds.uk
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

  // ── SpeedyIndex submission ────────────────────────────────────────────────
  let indexingJobId: string | null = null;
  let indexingStatus: string | null = null;
  let indexingError: string | null = null;

  const speedyKey = process.env.SPEEDYINDEX_API_KEY;
  if (speedyKey && !speedyKey.startsWith("<")) {
    try {
      const result = await submitToSpeedyIndex(articleUrl);
      indexingJobId = result.jobId;
      indexingStatus = result.status;

      // Persist so the admin can see it on the article detail page
      await db
        .from("articles")
        .update({
          indexing_jobs_jsonb: [
            { adapter: "speedyindex", jobId: result.jobId, status: result.status, submittedAt: new Date().toISOString() },
          ] as unknown as Json,
        })
        .eq("id", id);
    } catch (err) {
      indexingError = err instanceof Error ? err.message : "SpeedyIndex submission failed";
    }
  } else {
    indexingError = "SPEEDYINDEX_API_KEY not configured";
  }

  // ── ISR revalidation ──────────────────────────────────────────────────────
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
    indexing: {
      submitted: !!indexingJobId,
      jobId: indexingJobId,
      status: indexingStatus,
      error: indexingError,
    },
  });
}
