import { createHash } from "crypto";
import { scrapeWithFirecrawl } from "./firecrawl";
import { scrapeWithJina } from "./jina";
import { getDb } from "../db/client";

export interface ScrapeResult {
  url: string;
  content_md: string;
  source_domain: string;
  authority_score: number;
}

// Editable domain authority map
export const DOMAIN_AUTHORITY: Record<string, number> = {
  "bbc.co.uk": 10,
  "bbc.com": 10,
  "reuters.com": 10,
  "nhs.uk": 10,
  "gov.uk": 10,
  "who.int": 10,
  "pubmed.ncbi.nlm.nih.gov": 10,
  "nice.org.uk": 9,
  "theguardian.com": 8,
  "thetimes.co.uk": 8,
  "ft.com": 8,
  "economist.com": 8,
};

function getAuthorityScore(domain: string): number {
  return DOMAIN_AUTHORITY[domain] ?? 5;
}

function urlHash(url: string): string {
  return createHash("sha256").update(url).digest("hex");
}

export async function scrapeSources(urls: string[]): Promise<ScrapeResult[]> {
  const db = getDb();
  const results: ScrapeResult[] = [];
  const now = new Date();

  for (const url of urls) {
    const hash = urlHash(url);

    // Check cache
    const { data: cached } = await db
      .from("source_scrapes")
      .select("*")
      .eq("url_hash", hash)
      .gt("expires_at", now.toISOString())
      .single();

    if (cached) {
      results.push({
        url: cached.url,
        content_md: cached.content_md,
        source_domain: cached.source_domain,
        authority_score: cached.authority_score ?? 5,
      });
      continue;
    }

    // Scrape fresh — skip URL silently if both scrapers fail
    let scrapeResult: { content_md: string; source_domain: string } | null = null;
    try {
      scrapeResult = await scrapeWithFirecrawl(url);
    } catch {
      try {
        scrapeResult = await scrapeWithJina(url);
      } catch (err) {
        console.warn(`[scrape] Skipping ${url} — both scrapers failed: ${err instanceof Error ? err.message : String(err)}`);
        continue;
      }
    }

    const domain = scrapeResult.source_domain;
    const authority_score = getAuthorityScore(domain);
    const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    await db.from("source_scrapes").upsert({
      url,
      url_hash: hash,
      content_md: scrapeResult.content_md,
      source_domain: domain,
      authority_score,
      scraped_at: now.toISOString(),
      expires_at: expiresAt.toISOString(),
    });

    results.push({
      url,
      content_md: scrapeResult.content_md,
      source_domain: domain,
      authority_score,
    });
  }

  return results;
}
