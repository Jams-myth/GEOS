import OpenAI from "openai";
import { inngest } from "../client";
import { getDb } from "../../lib/db/client";
import { notifyDiscord } from "../../lib/notify/discord";
import { fetchXPosts } from "../../lib/sources/x";
import { fetchGdeltArticles } from "../../lib/sources/gdelt";
import { MODELS } from "../../lib/llm/models";
import type { Json } from "../../lib/db/types";

async function generateHeadlineFromKeyword(keyword: string): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return keyword;

  const client = new OpenAI({ baseURL: "https://openrouter.ai/api/v1", apiKey });

  const response = await client.chat.completions.create({
    model: MODELS.WRITER,
    max_tokens: 60,
    messages: [
      {
        role: "user",
        content: `Convert this SEO keyword into a compelling, properly capitalised article headline for a UK health/medication comparison website. Return ONLY the headline, nothing else.\n\nKeyword: ${keyword.trim()}`,
      },
    ],
  });

  return response.choices[0]?.message?.content?.trim() || keyword;
}

interface RedditPost {
  headline: string;
  sourceUrl: string;
  engagement: number;
  publishedAt: string; // ISO string — Date objects are serialized by Inngest steps
}

interface NewsItem {
  headline: string;
  sourceUrl: string;
  engagement: number;
  publishedAt: string; // ISO string — Date objects are serialized by Inngest steps
}

interface ScoredCandidate {
  headline: string;
  sourceUrl: string;
  score: number;
}

interface StructureTemplate {
  topic_sources?: {
    reddit?: string[];
    google_news_queries?: string[];
    x_queries?: string[];
    gdelt_queries?: string[];
  };
  target_audience?: string;
  word_count_default?: [number, number];
  keyword_clusters?: string[];
}

interface ApprovalConfig {
  auto_publish?: boolean;
}

function recencyWeight(publishedAt: Date): number {
  const ageMs = Date.now() - publishedAt.getTime();
  const ageHours = ageMs / (1000 * 60 * 60);
  if (ageHours < 6) return 1.0;
  if (ageHours < 24) return 0.8;
  if (ageHours < 72) return 0.5;
  return 0.2;
}

function keywordMatchBonus(headline: string, keywords: string[]): number {
  const headlineWords = headline.toLowerCase().split(/\s+/);
  let bonus = 0;
  for (const kw of keywords) {
    const kwWords = kw.toLowerCase().split(/\s+/);
    for (const kwWord of kwWords) {
      if (headlineWords.includes(kwWord)) {
        bonus += 10;
        break;
      }
    }
  }
  return bonus;
}

function wordOverlapRatio(a: string, b: string): number {
  const aWords = new Set(a.toLowerCase().split(/\s+/).filter((w) => w.length > 3));
  const bWords = b
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 3);
  if (aWords.size === 0 || bWords.length === 0) return 0;
  const matches = bWords.filter((w) => aWords.has(w)).length;
  return matches / Math.max(aWords.size, bWords.length);
}

async function fetchRedditPosts(subreddits: string[]): Promise<RedditPost[]> {
  const posts: RedditPost[] = [];
  for (const subreddit of subreddits) {
    try {
      const url = `https://www.reddit.com/r/${subreddit}/hot.json?limit=25`;
      const response = await fetch(url, {
        headers: { "User-Agent": "seo-geo-pipeline/1.0" },
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) continue;
      const json = (await response.json()) as {
        data?: {
          children?: Array<{
            data?: { title?: string; url?: string; score?: number; created_utc?: number };
          }>;
        };
      };
      const children = json?.data?.children ?? [];
      for (const child of children) {
        const d = child.data;
        if (!d?.title || !d?.url) continue;
        posts.push({
          headline: d.title,
          sourceUrl: d.url,
          engagement: d.score ?? 0,
          publishedAt: new Date((d.created_utc ?? 0) * 1000).toISOString(),
        });
      }
    } catch {
      // Silently skip failed subreddits
    }
  }
  return posts;
}

async function fetchGoogleNewsItems(queries: string[]): Promise<NewsItem[]> {
  const items: NewsItem[] = [];
  for (const query of queries) {
    try {
      const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-GB&gl=GB&ceid=GB:en`;
      const response = await fetch(url, {
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) continue;
      const xml = await response.text();

      // Simple regex-based XML parsing — no xml2js dependency
      const itemMatches = xml.matchAll(/<item>([\s\S]*?)<\/item>/g);
      for (const match of itemMatches) {
        const itemXml = match[1];
        const titleMatch = itemXml.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>|<title>(.*?)<\/title>/);
        const linkMatch = itemXml.match(/<link>(.*?)<\/link>/);
        const pubDateMatch = itemXml.match(/<pubDate>(.*?)<\/pubDate>/);

        const headline = (titleMatch?.[1] ?? titleMatch?.[2] ?? "").trim();
        const sourceUrl = (linkMatch?.[1] ?? "").trim();
        const pubDateStr = (pubDateMatch?.[1] ?? "").trim();

        if (!headline || !sourceUrl) continue;

        const publishedAt = (pubDateStr ? new Date(pubDateStr) : new Date()).toISOString();
        items.push({ headline, sourceUrl, engagement: 0, publishedAt });
      }
    } catch {
      // Silently skip failed queries
    }
  }
  return items;
}

export const topicDiscovery = inngest.createFunction(
  {
    id: "topic-discovery",
    concurrency: { limit: 1 },
    triggers: [{ cron: "0 6 * * *" }, { cron: "0 18 * * *" }, { event: "content/topic.discovery.requested" }],
  },
  async ({ step }) => {
    // Step 1: Load all sites
    const sites = await step.run("load-all-sites", async () => {
      const db = getDb();
      const { data, error } = await db
        .from("sites")
        .select("id, name, domain, approval_config_jsonb, structure_template_jsonb");
      if (error) throw new Error(`Failed to load sites: ${error.message}`);
      return data ?? [];
    });

    // Process each site sequentially to avoid rate limits
    for (const site of sites) {
      const siteId = site.id;
      const structureTemplate = (site.structure_template_jsonb as StructureTemplate | null) ?? {};
      const approvalConfig = (site.approval_config_jsonb as ApprovalConfig | null) ?? {};

      const subreddits = structureTemplate?.topic_sources?.reddit ?? [];
      const googleNewsQueries = structureTemplate?.topic_sources?.google_news_queries ?? [];
      const xQueries = structureTemplate?.topic_sources?.x_queries ?? [];
      const gdeltQueries = structureTemplate?.topic_sources?.gdelt_queries ?? [];
      const keywordList = structureTemplate?.keyword_clusters ?? [];

      // Step 2-pre: Process target keywords — these take priority over news discovery
      const targetKeywords = await step.run(`load-target-keywords-${siteId}`, async () => {
        const db = getDb();
        const { data } = await db
          .from("target_keywords")
          .select("id, keyword")
          .eq("site_id", siteId)
          .eq("status", "pending")
          .order("created_at")
          .limit(3); // Process up to 3 per run to avoid overloading
        return data ?? [];
      });

      for (const kw of targetKeywords) {
        await step.run(`mark-keyword-in-progress-${kw.id}`, async () => {
          const db = getDb();
          await db.from("target_keywords").update({ status: "in_progress" }).eq("id", kw.id);
        });

        const kwSourceUrls = await step.run(`fetch-sources-for-keyword-${kw.id}`, async () => {
          const newsItems = await fetchGoogleNewsItems([kw.keyword]);
          return newsItems.slice(0, 5).map((item) => item.sourceUrl);
        });

        const kwHeadline = await step.run(`generate-headline-for-keyword-${kw.id}`, async () => {
          return generateHeadlineFromKeyword(kw.keyword);
        });

        await step.sendEvent(`keyword-article-${kw.id}`, {
          name: "topic.selected",
          data: {
            siteId,
            headline: kwHeadline,
            sourceUrls: kwSourceUrls,
            keywordCluster: kw.keyword,
            targetKeywordId: kw.id,
          },
        });
      }

      // Step 2a: Fetch Reddit posts
      const redditPosts = await step.run(`fetch-reddit-${siteId}`, async () => {
        return fetchRedditPosts(subreddits);
      });

      // Step 2b: Fetch Google News items
      const newsItems = await step.run(`fetch-google-news-${siteId}`, async () => {
        return fetchGoogleNewsItems(googleNewsQueries);
      });

      // Step 2c: Fetch X (Twitter) posts
      const xPosts = await step.run(`fetch-x-posts-${siteId}`, async () => {
        return fetchXPosts(xQueries);
      });

      // Step 2d: Fetch GDELT articles
      const gdeltArticles = await step.run(`fetch-gdelt-${siteId}`, async () => {
        return fetchGdeltArticles(gdeltQueries);
      });

      // Step 2e: Score, dedupe, and insert candidates
      const insertedCandidates = await step.run(`score-and-dedupe-${siteId}`, async () => {
        const db = getDb();

        // Merge all candidates — publishedAt is already an ISO string from step serialization
        const rawCandidates: Array<{ headline: string; sourceUrl: string; engagement: number; publishedAt: string }> = [
          ...redditPosts,
          ...newsItems,
          ...xPosts,
          ...gdeltArticles,
        ];

        // Filter out non-scrapeable URLs (images, videos, reddit media)
        const UNSCRAPEBLE_PATTERNS = [/imgur\.com/, /redd\.it/, /\.jpg$/, /\.jpeg$/, /\.png$/, /\.gif$/, /\.mp4$/];
        const allCandidates = rawCandidates.filter(
          (c) => c.sourceUrl.startsWith("https://") && !UNSCRAPEBLE_PATTERNS.some((p) => p.test(c.sourceUrl))
        );

        // Score each candidate
        const scored: ScoredCandidate[] = allCandidates.map((c) => {
          const rw = recencyWeight(new Date(c.publishedAt));
          const km = keywordMatchBonus(c.headline, keywordList);
          const score = c.engagement * rw + km;
          return { headline: c.headline, sourceUrl: c.sourceUrl, score };
        });

        // Sort by score descending
        scored.sort((a, b) => b.score - a.score);

        // Fetch existing article titles for deduplication
        const { data: existingArticles } = await db
          .from("articles")
          .select("title")
          .eq("site_id", siteId);
        const existingTitles = (existingArticles ?? []).map((a) => a.title);

        // Fetch active topic candidates for deduplication
        const { data: existingCandidates } = await db
          .from("topic_candidates")
          .select("headline")
          .eq("site_id", siteId)
          .not("status", "in", '("rejected","expired")');
        const existingCandidateHeadlines = (existingCandidates ?? []).map((c) => c.headline);

        // Deduplicate and take top 10
        const deduped: ScoredCandidate[] = [];
        for (const candidate of scored) {
          if (deduped.length >= 10) break;

          // Check against existing articles (>50% word overlap = skip)
          const duplicatesArticle = existingTitles.some(
            (title) => wordOverlapRatio(candidate.headline, title) > 0.5
          );
          if (duplicatesArticle) continue;

          // Check against existing topic candidates
          const duplicatesCandidate = existingCandidateHeadlines.some(
            (h) => wordOverlapRatio(candidate.headline, h) > 0.5
          );
          if (duplicatesCandidate) continue;

          deduped.push(candidate);
        }

        // Insert into topic_candidates
        const inserts = deduped.map((c) => ({
          site_id: siteId,
          headline: c.headline,
          sources_jsonb: [c.sourceUrl] as Json,
          score: c.score,
          status: "pending" as const,
          discovered_at: new Date().toISOString(),
        }));

        if (inserts.length > 0) {
          const { data: inserted, error } = await db
            .from("topic_candidates")
            .insert(inserts)
            .select("id, headline, score, sources_jsonb");
          if (error) throw new Error(`Failed to insert topic candidates: ${error.message}`);
          return inserted ?? [];
        }
        return [];
      });

      if (insertedCandidates.length === 0) continue;

      if (approvalConfig.auto_publish === true) {
        // Auto-select the highest-scoring candidate
        const top = insertedCandidates[0];

        await step.run(`select-top-candidate-${siteId}`, async () => {
          const db = getDb();
          await db
            .from("topic_candidates")
            .update({ status: "selected" })
            .eq("id", top.id);
        });

        await step.sendEvent(`topic-selected-${siteId}-${top.id}`, {
          name: "topic.selected",
          data: {
            siteId,
            headline: top.headline,
            sourceUrls: (top.sources_jsonb as string[] | null) ?? [],
            keywordCluster: keywordList[0] ?? "",
          },
        });
      } else {
        // Notify Discord with top 5 candidates for manual approval
        await step.run(`notify-candidates-${siteId}`, async () => {
          const top5 = insertedCandidates.slice(0, 5).map((c) => ({
            id: c.id,
            headline: c.headline,
            score: c.score ?? 0,
          }));

          await notifyDiscord({
            kind: "topic_candidates",
            siteId,
            siteName: site.name,
            candidates: top5,
          });
        });
      }
    }

    return { sitesProcessed: sites.length };
  }
);
