import { getDb } from "../../../lib/db/client";
import KeywordsClient from "./KeywordsClient";

export const dynamic = "force-dynamic";

// Use the first (and currently only) site — could be extended to a site picker later
async function getDefaultSite() {
  const db = getDb();
  const { data } = await db.from("sites").select("id, name").order("created_at").limit(1).single();
  return data;
}

async function getKeywords(siteId: string) {
  const db = getDb();
  const { data } = await db
    .from("target_keywords")
    .select("id, keyword, status, article_id, created_at, completed_at")
    .eq("site_id", siteId)
    .order("created_at", { ascending: false });
  return data ?? [];
}

export default async function KeywordsPage() {
  const site = await getDefaultSite();
  if (!site) {
    return (
      <div className="text-sm text-gray-500">No sites configured.</div>
    );
  }

  const keywords = await getKeywords(site.id);

  return (
    <KeywordsClient
      siteId={site.id}
      initialKeywords={keywords as Parameters<typeof KeywordsClient>[0]["initialKeywords"]}
    />
  );
}
