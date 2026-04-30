import { logApiBatch } from "../db/batch-logger";
import { withRetry } from "../util/retry";

export interface SerpResult {
  position: number | null;
  snippet: string | null;
  found: boolean;
}

export type SerpBatchResult = Record<string, SerpResult>; // key: `${url}::${keyword}`

interface DataForSeoTask {
  id: string;
  keyword: string;
  url: string;
}

interface DataForSeoTaskResponse {
  tasks?: Array<{
    id?: string;
    status_code?: number;
    result?: Array<{
      items?: Array<{
        type?: string;
        url?: string;
        description?: string;
        rank_absolute?: number;
      }>;
    }>;
  }>;
}

function getCredentials() {
  const login = process.env.DATAFORSEO_LOGIN;
  const password = process.env.DATAFORSEO_PASSWORD;
  if (!login || !password) throw new Error("DATAFORSEO_LOGIN or DATAFORSEO_PASSWORD is not set");
  return Buffer.from(`${login}:${password}`).toString("base64");
}

function serpKey(url: string, keyword: string): string {
  return `${url}::${keyword}`;
}

// withRetry retries=2 — fetchSerpBatch has its own internal polling loop, so fewer outer retries
export async function fetchSerpBatch(
  pairs: Array<{ url: string; keyword: string }>
): Promise<SerpBatchResult> {
  if (pairs.length === 0) return {};

  return withRetry(async () => {
    const credentials = getCredentials();
    const baseUrl = "https://api.dataforseo.com";

    // Submit batch tasks (up to 100 per batch per PRD)
    const chunks: Array<typeof pairs> = [];
    for (let i = 0; i < pairs.length; i += 100) {
      chunks.push(pairs.slice(i, i + 100));
    }

    const result: SerpBatchResult = {};
    for (const pair of pairs) {
      result[serpKey(pair.url, pair.keyword)] = { position: null, snippet: null, found: false };
    }

    const startTime = Date.now();

    for (const chunk of chunks) {
      const taskPayload = chunk.map((p) => ({
        keyword: p.keyword,
        location_code: 2826, // United Kingdom
        language_code: "en",
        device: "desktop",
        os: "windows",
        depth: 100,
        target: new URL(p.url).hostname,
      }));

      const postResponse = await fetch(`${baseUrl}/v3/serp/google/organic/task_post`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Basic ${credentials}`,
        },
        body: JSON.stringify(taskPayload),
      });

      if (!postResponse.ok) {
        throw new Error(`DataForSEO task_post failed: ${postResponse.status}`);
      }

      const postData = (await postResponse.json()) as DataForSeoTaskResponse;
      const taskIds: DataForSeoTask[] = (postData.tasks ?? [])
        .filter((t) => t.id)
        .map((t, i) => ({ id: t.id!, keyword: chunk[i].keyword, url: chunk[i].url }));

      // Poll with exponential backoff
      const pendingTasks = new Map<string, DataForSeoTask>(taskIds.map((t) => [t.id, t]));
      let delay = 5000;
      let attempts = 0;

      while (pendingTasks.size > 0 && attempts < 8) {
        await sleep(delay);
        delay = Math.min(delay * 1.5, 30000);
        attempts++;

        for (const [taskId, task] of pendingTasks) {
          const getResponse = await fetch(
            `${baseUrl}/v3/serp/google/organic/task_get/regular/${taskId}`,
            {
              headers: { Authorization: `Basic ${credentials}` },
            }
          );
          if (!getResponse.ok) continue;

          const getData = (await getResponse.json()) as DataForSeoTaskResponse;
          const taskResult = getData.tasks?.[0];
          if (!taskResult || taskResult.status_code === 40602) continue; // Still processing

          const items = taskResult.result?.[0]?.items ?? [];
          const targetDomain = new URL(task.url).hostname;
          const match = items.find(
            (item) =>
              item.type === "organic" &&
              item.url &&
              new URL(item.url).hostname === targetDomain
          );

          result[serpKey(task.url, task.keyword)] = {
            position: match?.rank_absolute ?? null,
            snippet: match?.description ?? null,
            found: !!match,
          };

          pendingTasks.delete(taskId);
        }
      }
    }

    const responseTimeMs = Date.now() - startTime;
    // DataForSEO pricing: approx $0.0006 per task at standard tier
    await logApiBatch("dataforseo", pairs.length, responseTimeMs, pairs.length * 0.0006);

    return result;
  }, { retries: 2 });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
