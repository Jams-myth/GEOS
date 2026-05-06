import { withRetry } from "../util/retry";

export async function submitToSpeedyIndex(url: string): Promise<{ jobId: string; status: string }> {
  return withRetry(async () => {
    const apiKey = process.env.SPEEDYINDEX_API_KEY;
    if (!apiKey) throw new Error("SPEEDYINDEX_API_KEY is not set");

    const ENDPOINT = "https://api.speedyindex.com/v2/task/google/indexer/create";

    // Try standard mode first
    let response = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: apiKey },
      body: JSON.stringify({ urls: [url] }),
    });

    // 503 means standard indexing is temporarily unavailable — retry with pay_per_indexed mode
    if (response.status === 503) {
      response = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: apiKey },
        body: JSON.stringify({ urls: [url], pay_per_indexed: true }),
      });
    }

    if (!response.ok) {
      throw new Error(`SpeedyIndex error ${response.status}: ${await response.text()}`);
    }

    const data = await response.json() as { task_id?: string; status?: string };

    return {
      jobId: data.task_id ?? url,
      status: data.status ?? "submitted",
    };
  });
}
