import { google } from "googleapis";
import { logApiBatch } from "../db/batch-logger";

export interface Ga4ArticleMetrics {
  sessions: number;
  users: number;
  engagementRate: number;
  avgEngagementTimeSeconds: number;
}

export type Ga4BatchResult = Record<string, Ga4ArticleMetrics>;

function getAuth() {
  const serviceAccountJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!serviceAccountJson) throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON is not set");

  const credentials = JSON.parse(
    Buffer.from(serviceAccountJson, "base64").toString("utf-8")
  ) as object;

  return new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/analytics.readonly"],
  });
}

export async function fetchGa4Batch(
  propertyId: string,
  pagePaths: string[]
): Promise<Ga4BatchResult> {
  if (pagePaths.length === 0) return {};

  const auth = getAuth();
  const analyticsData = google.analyticsdata({ version: "v1beta", auth });

  const endDate = new Date();
  const startDate = new Date(endDate);
  startDate.setDate(startDate.getDate() - 7);

  const startTime = Date.now();

  // Single runReport call — IN_LIST filter for all page paths
  const response = await analyticsData.properties.runReport({
    property: `properties/${propertyId}`,
    requestBody: {
      dateRanges: [
        {
          startDate: startDate.toISOString().split("T")[0],
          endDate: endDate.toISOString().split("T")[0],
        },
      ],
      dimensions: [{ name: "pagePath" }],
      metrics: [
        { name: "sessions" },
        { name: "totalUsers" },
        { name: "engagementRate" },
        { name: "averageSessionDuration" },
      ],
      dimensionFilter: {
        filter: {
          fieldName: "pagePath",
          inListFilter: {
            values: pagePaths,
          },
        },
      },
    },
  });

  const responseTimeMs = Date.now() - startTime;
  await logApiBatch("ga4", pagePaths.length, responseTimeMs, 0);

  const rows = response.data.rows ?? [];
  const result: Ga4BatchResult = {};

  for (const path of pagePaths) {
    result[path] = { sessions: 0, users: 0, engagementRate: 0, avgEngagementTimeSeconds: 0 };
  }

  for (const row of rows) {
    const path = row.dimensionValues?.[0]?.value ?? "";
    if (!result[path]) continue;
    const vals = row.metricValues ?? [];
    result[path] = {
      sessions: parseInt(vals[0]?.value ?? "0", 10),
      users: parseInt(vals[1]?.value ?? "0", 10),
      engagementRate: parseFloat(vals[2]?.value ?? "0"),
      avgEngagementTimeSeconds: parseFloat(vals[3]?.value ?? "0"),
    };
  }

  return result;
}
