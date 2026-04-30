import { inngest } from "../client";
import { getDb } from "../../lib/db/client";
import { fetchGscBatch } from "../../lib/analytics/gsc";
import { fetchGa4Batch } from "../../lib/analytics/ga4";
import { fetchSerpBatch } from "../../lib/serp/dataforseo";
import { checkAiCitations } from "../../lib/citation/index";
import { aggregateRecommendations } from "../../lib/assessment/aggregator";
import { Resend } from "resend";
import type { Json } from "../../lib/db/types";
import type { GscArticleMetrics } from "../../lib/analytics/gsc";
import type { Ga4ArticleMetrics } from "../../lib/analytics/ga4";
import type { SerpResult } from "../../lib/serp/dataforseo";
import type { ArticleCitationResult } from "../../lib/citation/index";
import type { Recommendation } from "../../lib/assessment/aggregator";

interface SiteConfig {
  gsc_site_url?: string;
  ga4_property_id?: string;
}

interface NotificationConfig {
  email?: string;
}

interface WeeklyReportArticle {
  articleId: string;
  title: string;
  url: string;
  keyword: string;
  gsc: GscArticleMetrics;
  ga4: Ga4ArticleMetrics;
  serp: SerpResult;
  citations: ArticleCitationResult;
  recommendations: Recommendation[];
  previousGsc: GscArticleMetrics | null;
  previousSerp: SerpResult | null;
}

function getWeekOf(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  // Round to Monday
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  return d.toISOString().split("T")[0];
}

function buildReportHtml(
  siteName: string,
  weekOf: string,
  articles: WeeklyReportArticle[]
): string {
  const rows = articles
    .map((a) => {
      const posChange =
        a.previousSerp?.position != null && a.serp.position != null
          ? (a.previousSerp.position - a.serp.position).toFixed(1)
          : "—";
      const citedBy = [a.citations.perplexity, a.citations.openai, a.citations.gemini].filter(
        (c) => c.cited
      ).length;
      return `
        <tr>
          <td><a href="${a.url}">${a.title}</a></td>
          <td>${a.serp.position ?? "—"}</td>
          <td>${posChange}</td>
          <td>${(a.gsc.ctr * 100).toFixed(1)}%</td>
          <td>${a.gsc.clicks}</td>
          <td>${citedBy}/3</td>
          <td>${a.recommendations.filter((r) => r.priority === "critical").length} critical</td>
        </tr>`;
    })
    .join("");

  const actionQueue = articles
    .flatMap((a) => a.recommendations.filter((r) => r.priority !== "optional"))
    .sort((a, b) => (a.priority === "critical" ? -1 : 1) - (b.priority === "critical" ? -1 : 1))
    .slice(0, 10)
    .map((r) => `<li><strong>[${r.priority.toUpperCase()}]</strong> ${r.issue} — ${r.action}</li>`)
    .join("");

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><style>
body { font-family: Arial, sans-serif; font-size: 14px; color: #333; }
table { border-collapse: collapse; width: 100%; }
th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
th { background: #f5f5f5; }
h1 { color: #111; }
h2 { color: #444; margin-top: 24px; }
</style></head>
<body>
<h1>Weekly SEO Report — ${siteName}</h1>
<p>Week of ${weekOf}</p>
<h2>Article Performance</h2>
<table>
  <tr><th>Article</th><th>Position</th><th>Δ Position</th><th>CTR</th><th>Clicks</th><th>AI Citations</th><th>Actions</th></tr>
  ${rows}
</table>
<h2>Action Queue (Top 10)</h2>
<ul>${actionQueue}</ul>
</body>
</html>`;
}

export const weeklyAssessment = inngest.createFunction(
  {
    id: "weekly-assessment",
    concurrency: { limit: 1 },
    triggers: [{ cron: "0 8 * * 1" }],
  },
  async ({ step }) => {
    const weekOf = getWeekOf();

    // Load all sites and their published articles ≥ 7 days old
    const { sites, articles } = await step.run("load-articles", async () => {
      const db = getDb();
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const { data: siteData, error: siteError } = await db
        .from("sites")
        .select("id, name, domain, supabase_config_jsonb, notification_config_jsonb");
      if (siteError) throw new Error(`Failed to load sites: ${siteError.message}`);

      const { data: articleData, error: articleError } = await db
        .from("articles")
        .select("id, site_id, title, url, primary_keyword, published_at, version")
        .eq("status", "published")
        .lt("published_at", sevenDaysAgo.toISOString());
      if (articleError) throw new Error(`Failed to load articles: ${articleError.message}`);

      return { sites: siteData ?? [], articles: articleData ?? [] };
    });

    const results: WeeklyReportArticle[] = [];

    for (const site of sites) {
      const siteArticles = articles.filter((a) => a.site_id === site.id);
      if (siteArticles.length === 0) continue;

      const siteConfig = (site.supabase_config_jsonb as SiteConfig | null) ?? {};
      const notificationConfig = (site.notification_config_jsonb as NotificationConfig | null) ?? {};
      const siteId = site.id;

      const articleUrls = siteArticles.map((a) => a.url);
      const articlePaths = siteArticles.map((a) => new URL(a.url).pathname);

      // Cache check — skip batch APIs if we already have data for this week
      const existingAssessments = await step.run(
        `check-cache-${siteId}`,
        async () => {
          const db = getDb();
          const { data } = await db
            .from("assessments")
            .select("id, article_id, gsc_data_jsonb, ga4_data_jsonb, serp_positions_jsonb, ai_citations_jsonb, recommendations_jsonb")
            .in("article_id", siteArticles.map((a) => a.id))
            .eq("week_of", weekOf);
          return data ?? [];
        }
      );

      const cachedIds = new Set(existingAssessments.map((a) => a.article_id));
      const uncachedArticles = siteArticles.filter((a) => !cachedIds.has(a.id));

      let gscData: Record<string, GscArticleMetrics> = {};
      let ga4Data: Record<string, Ga4ArticleMetrics> = {};
      let serpData: Record<string, SerpResult> = {};
      let citationData: ArticleCitationResult[] = [];

      if (uncachedArticles.length > 0) {
        const uncachedUrls = uncachedArticles.map((a) => a.url);
        const uncachedPaths = uncachedArticles.map((a) => new URL(a.url).pathname);

        // Step: GSC batch (single call, all URLs)
        if (siteConfig.gsc_site_url) {
          gscData = await step.run(`gsc-batch-${siteId}`, async () => {
            return fetchGscBatch(siteConfig.gsc_site_url!, uncachedUrls);
          });
        }

        // Step: GA4 batch (single call, all page paths)
        if (siteConfig.ga4_property_id) {
          ga4Data = await step.run(`ga4-batch-${siteId}`, async () => {
            return fetchGa4Batch(siteConfig.ga4_property_id!, uncachedPaths);
          });
        }

        // Step: DataForSEO batch
        const serpPairs = uncachedArticles.map((a) => ({
          url: a.url,
          keyword: a.primary_keyword ?? "",
        }));

        const serpRaw = await step.run(`dataforseo-batch-${siteId}`, async () => {
          return fetchSerpBatch(serpPairs);
        });

        // Unpack SERP results into per-URL map
        for (const pair of serpPairs) {
          const key = `${pair.url}::${pair.keyword}`;
          serpData[pair.url] = serpRaw[key] ?? { position: null, snippet: null, found: false };
        }

        // Step: AI citation checks (capped at concurrency 5 via p-limit inside checkAiCitations)
        citationData = await step.run(`ai-citations-${siteId}`, async () => {
          return checkAiCitations(
            uncachedArticles.map((a) => ({
              url: a.url,
              keyword: a.primary_keyword ?? "",
            }))
          );
        });
      }

      // Load previous week's assessments for delta comparison
      const previousWeekDate = new Date(weekOf);
      previousWeekDate.setDate(previousWeekDate.getDate() - 7);
      const prevWeekStr = previousWeekDate.toISOString().split("T")[0];

      const previousAssessments = await step.run(`load-previous-week-${siteId}`, async () => {
        const db = getDb();
        const { data } = await db
          .from("assessments")
          .select("article_id, gsc_data_jsonb, serp_positions_jsonb")
          .in("article_id", siteArticles.map((a) => a.id))
          .eq("week_of", prevWeekStr);
        return data ?? [];
      });

      const prevMap = new Map(previousAssessments.map((a) => [a.article_id, a]));

      // Per-article: aggregate recommendations
      const articleAssessments: Array<{
        article: typeof siteArticles[0];
        gsc: GscArticleMetrics;
        ga4: Ga4ArticleMetrics;
        serp: SerpResult;
        citations: ArticleCitationResult;
        recommendations: Recommendation[];
        assessmentId?: string;
      }> = [];

      for (const article of siteArticles) {
        // Use cached data if available
        const cached = existingAssessments.find((e) => e.article_id === article.id);

        // These casts are safe: the JSONB columns are written by this pipeline with these exact shapes
        const gsc: GscArticleMetrics = cached
          ? (cached.gsc_data_jsonb as unknown as GscArticleMetrics)
          : (gscData[article.url] ?? { clicks: 0, impressions: 0, ctr: 0, position: 0, topQueries: [] });

        const ga4: Ga4ArticleMetrics = cached
          ? (cached.ga4_data_jsonb as unknown as Ga4ArticleMetrics)
          : (ga4Data[new URL(article.url).pathname] ?? { sessions: 0, users: 0, engagementRate: 0, avgEngagementTimeSeconds: 0 });

        const serp: SerpResult = cached
          ? (cached.serp_positions_jsonb as unknown as SerpResult)
          : (serpData[article.url] ?? { position: null, snippet: null, found: false });

        const citationEntry = citationData.find((c) => c.url === article.url);
        const citations: ArticleCitationResult = cached
          ? (cached.ai_citations_jsonb as unknown as ArticleCitationResult)
          : (citationEntry ?? {
              url: article.url,
              keyword: article.primary_keyword ?? "",
              perplexity: { cited: false, position: null },
              openai: { cited: false, position: null },
              gemini: { cited: false, position: null },
            });

        const prev = prevMap.get(article.id);
        // These casts are safe: gsc_data_jsonb and serp_positions_jsonb are written by this pipeline
        const previousGsc = prev ? (prev.gsc_data_jsonb as unknown as GscArticleMetrics) : null;
        const previousSerp = prev ? (prev.serp_positions_jsonb as unknown as SerpResult) : null;

        let recommendations: Recommendation[] = [];
        if (!cached) {
          recommendations = await step.run(`aggregate-${article.id}`, async () => {
            return aggregateRecommendations({
              article: {
                id: article.id,
                title: article.title,
                primaryKeyword: article.primary_keyword ?? "",
                url: article.url,
                publishedAt: article.published_at ?? "",
                version: article.version ?? 1,
              },
              gsc,
              ga4,
              serp,
              citations,
              previousWeek: previousGsc && previousSerp ? { gsc: previousGsc, serp: previousSerp } : null,
            });
          });
        } else {
          // Cast is safe: recommendations_jsonb is written by this pipeline with the Recommendation[] shape
          recommendations = (cached.recommendations_jsonb as unknown as Recommendation[]) ?? [];
        }

        articleAssessments.push({
          article,
          gsc,
          ga4,
          serp,
          citations,
          recommendations,
          assessmentId: cached?.id,
        });
      }

      // Persist all assessments (upsert — one row per article per week)
      const assessmentIds = await step.run(`persist-assessments-${siteId}`, async () => {
        const db = getDb();
        const rows = articleAssessments
          .filter((aa) => !aa.assessmentId) // Only upsert new ones
          .map((aa) => ({
            article_id: aa.article.id,
            week_of: weekOf,
            // Casts are safe: these typed objects satisfy the Json constraint at runtime
            gsc_data_jsonb: aa.gsc as unknown as Json,
            ga4_data_jsonb: aa.ga4 as unknown as Json,
            serp_positions_jsonb: aa.serp as unknown as Json,
            ai_citations_jsonb: aa.citations as unknown as Json,
            recommendations_jsonb: aa.recommendations as unknown as Json,
          }));

        if (rows.length === 0) return {};

        const { data, error } = await db
          .from("assessments")
          .upsert(rows, { onConflict: "article_id,week_of" })
          .select("id, article_id");

        if (error) throw new Error(`Failed to persist assessments: ${error.message}`);

        const map: Record<string, string> = {};
        for (const row of data ?? []) {
          if (row.article_id) {
            map[row.article_id] = row.id;
          }
        }
        return map;
      });

      // Build report articles array
      const reportArticles: WeeklyReportArticle[] = articleAssessments.map((aa) => ({
        articleId: aa.article.id,
        title: aa.article.title,
        url: aa.article.url,
        keyword: aa.article.primary_keyword ?? "",
        gsc: aa.gsc,
        ga4: aa.ga4,
        serp: aa.serp,
        citations: aa.citations,
        recommendations: aa.recommendations,
        // Casts are safe: these JSONB columns are written by this pipeline
        previousGsc: prevMap.get(aa.article.id)
          ? (prevMap.get(aa.article.id)!.gsc_data_jsonb as unknown as GscArticleMetrics)
          : null,
        previousSerp: prevMap.get(aa.article.id)
          ? (prevMap.get(aa.article.id)!.serp_positions_jsonb as unknown as SerpResult)
          : null,
      }));

      results.push(...reportArticles);

      // Send weekly report email
      if (notificationConfig.email) {
        await step.run(`send-report-email-${siteId}`, async () => {
          const resendKey = process.env.RESEND_API_KEY;
          if (!resendKey) throw new Error("RESEND_API_KEY is not set");

          const resend = new Resend(resendKey);
          const html = buildReportHtml(site.name, weekOf, reportArticles);

          await resend.emails.send({
            from: "pipeline@noreply.evernu.co.uk",
            to: notificationConfig.email!,
            subject: `Weekly SEO Report — ${site.name} — ${weekOf}`,
            html,
          });
        });
      }

      // Emit assessment.flagged events for articles with critical/recommended actions
      const flaggedArticles = articleAssessments.filter((aa) =>
        aa.recommendations.some((r) => r.priority === "critical" || r.priority === "recommended")
      );

      for (const flagged of flaggedArticles) {
        const assessmentId = flagged.assessmentId ?? assessmentIds[flagged.article.id];
        if (!assessmentId) continue;

        const topIssue =
          flagged.recommendations.find((r) => r.priority === "critical") ??
          flagged.recommendations.find((r) => r.priority === "recommended");

        await step.sendEvent(`emit-assessment-flagged-${flagged.article.id}-${weekOf}`, {
          name: "assessment.flagged",
          data: {
            articleId: flagged.article.id,
            assessmentId,
            issueType: topIssue?.metric ?? "performance",
          },
        });
      }
    }

    return {
      weekOf,
      articlesAssessed: results.length,
      flaggedCount: results.filter((a) =>
        a.recommendations.some((r) => r.priority === "critical")
      ).length,
    };
  }
);
