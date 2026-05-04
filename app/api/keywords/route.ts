export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getDb } from "../../../lib/db/client";

// GET /api/keywords?siteId=xxx
export async function GET(request: NextRequest): Promise<NextResponse> {
  const siteId = request.nextUrl.searchParams.get("siteId");
  if (!siteId) {
    return NextResponse.json({ error: "siteId is required" }, { status: 400 });
  }

  const db = getDb();
  const { data, error } = await db
    .from("target_keywords")
    .select("id, keyword, status, article_id, created_at, completed_at")
    .eq("site_id", siteId)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ keywords: data ?? [] });
}

// POST /api/keywords
export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: { siteId?: string; keyword?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { siteId, keyword } = body;
  if (!siteId || !keyword?.trim()) {
    return NextResponse.json({ error: "siteId and keyword are required" }, { status: 400 });
  }

  const normalised = keyword.trim().toLowerCase();
  const db = getDb();

  // Check for existing keyword (case-insensitive) before hitting the unique index
  const { data: existing } = await db
    .from("target_keywords")
    .select("id, keyword, status")
    .eq("site_id", siteId)
    .ilike("keyword", normalised)
    .maybeSingle();

  if (existing) {
    return NextResponse.json(
      { error: `"${existing.keyword}" is already in your list (${existing.status})` },
      { status: 409 }
    );
  }

  const { data, error } = await db
    .from("target_keywords")
    .insert({ site_id: siteId, keyword: keyword.trim(), status: "pending" })
    .select("id, keyword, status, created_at")
    .single();

  if (error) {
    // Unique constraint violation — race condition fallback
    if (error.code === "23505") {
      return NextResponse.json({ error: "That keyword is already in your list" }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ keyword: data });
}

// DELETE /api/keywords?id=xxx
export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const id = request.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const db = getDb();
  const { error } = await db
    .from("target_keywords")
    .delete()
    .eq("id", id)
    .neq("status", "in_progress"); // Don't delete while article is being generated

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
