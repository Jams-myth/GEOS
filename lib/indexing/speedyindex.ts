import { withRetry } from "../util/retry";

const API_BASE = "https://api.speedyindex.com/v2";

function getApiKey(): string {
  const key = process.env.SPEEDYINDEX_API_KEY;
  if (!key) throw new Error("SPEEDYINDEX_API_KEY is not set");
  return key;
}

export async function submitToSpeedyIndex(url: string): Promise<{ jobId: string; status: string }> {
  return withRetry(async () => {
    const apiKey = getApiKey();
    const ENDPOINT = `${API_BASE}/task/google/indexer/create`;

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
      // Normalise both "ok" and any missing status to "submitted"
      status: (data.status && data.status !== "ok") ? data.status : "submitted",
    };
  });
}

/**
 * Poll SpeedyIndex for the current state of a previously submitted task.
 * Returns one of: "submitted" | "processing" | "indexed" | "failed" | "unknown"
 */
export async function checkSpeedyIndexStatus(jobId: string): Promise<{ status: string }> {
  return withRetry(async () => {
    const apiKey = getApiKey();

    const response = await fetch(`${API_BASE}/task/google/indexer/${jobId}`, {
      method: "GET",
      headers: { Authorization: apiKey },
    });

    if (!response.ok) {
      throw new Error(`SpeedyIndex status check error ${response.status}: ${await response.text()}`);
    }

    const data = await response.json() as {
      status?: string;
      state?: string;
      indexed?: boolean;
    };

    // Normalise whatever SpeedyIndex returns into our four states
    const raw = (data.status ?? data.state ?? "").toLowerCase();
    let status: string;
    if (data.indexed === true || raw === "indexed" || raw === "completed") {
      status = "indexed";
    } else if (raw === "failed" || raw === "error") {
      status = "failed";
    } else if (raw === "processing" || raw === "in_progress") {
      status = "processing";
    } else {
      status = "submitted"; // still queued / unknown — treat as pending
    }

    return { status };
  });
}
