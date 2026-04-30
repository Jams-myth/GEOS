import { google } from "googleapis";
import { logApiBatch } from "../db/batch-logger";

export interface GscArticleMetrics {
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
  topQueries: Array<{ query: string; clicks: number; impressions: number; position: number }>;
}

export type GscBatchResult = Record<string, GscArticleMetrics>;

function getAuth() {
  const serviceAccountJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!serviceAccountJson) throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON is not set");

  const credentials = JSON.parse(
    Buffer.from(serviceAccountJson, "base64").toString("utf-8")
  ) as object;

  return new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/webmasters.readonly"],
  });
}

export async function fetchGscBatch(
  siteUrl: string,
  articleUrls: string[]
): Promise<GscBatchResult> {
  if (articleUrls.length === 0) return {};

  const auth = getAuth();
  const webmasters = google.searchconsole({ version: "v1", auth });

  const endDate = new Date();
  const startDate = new Date(endDate);
  startDate.setDate(startDate.getDate() - 7);

  const startTime = Date.now();

  // Single batch call — all URLs as page filter
  const response = await webmasters.searchanalytics.query({
    siteUrl,
    requestBody: {
      startDate: startDate.toISOString().split("T")[0],
      endDate: endDate.toISOString().split("T")[0],
      dimensions: ["page", "query"],
      dimensionFilterGroups: [
        {
          filters: [
            {
              dimension: "page",
              operator: "includingRegex",
              expression: articleUrls.map((u) => escapeRegex(u)).join("|"),
            },
          ],
        },
      ],
      dataState: "all",
      rowLimit: 25000,
    },
  });

  const responseTimeMs = Date.now() - startTime;
  await logApiBatch("gsc", articleUrls.length, responseTimeMs, 0);

  const rows = response.data.rows ?? [];
  const result: GscBatchResult = {};

  // Initialise all URLs with zero metrics
  for (const url of articleUrls) {
    result[url] = { clicks: 0, impressions: 0, ctr: 0, position: 0, topQueries: [] };
  }

  // Aggregate rows by page
  for (const row of rows) {
    const keys = row.keys ?? [];
    const pageUrl = keys[0];
    const query = keys[1] ?? "";
    if (!pageUrl || !result[pageUrl]) continue;

    const metrics = result[pageUrl];
    metrics.clicks += row.clicks ?? 0;
    metrics.impressions += row.impressions ?? 0;
    if (query) {
      metrics.topQueries.push({
        query,
        clicks: row.clicks ?? 0,
        impressions: row.impressions ?? 0,
        position: row.position ?? 0,
      });
    }
  }

  // Calculate CTR and avg position per URL
  for (const url of articleUrls) {
    const m = result[url];
    if (m.impressions > 0) {
      m.ctr = m.clicks / m.impressions;
      // Average position weighted by impressions
      const rowsForUrl = rows.filter((r) => r.keys?.[0] === url);
      const totalImpressions = rowsForUrl.reduce((s, r) => s + (r.impressions ?? 0), 0);
      if (totalImpressions > 0) {
        m.position =
          rowsForUrl.reduce((s, r) => s + (r.position ?? 0) * (r.impressions ?? 0), 0) /
          totalImpressions;
      }
    }
    // Sort top queries by clicks desc, keep top 10
    m.topQueries.sort((a, b) => b.clicks - a.clicks);
    m.topQueries = m.topQueries.slice(0, 10);
  }

  return result;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
