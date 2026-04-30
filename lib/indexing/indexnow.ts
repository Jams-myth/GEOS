import { withRetry } from "../util/retry";

export async function submitToIndexNow(url: string): Promise<{ jobId: string; status: string }> {
  return withRetry(async () => {
    const key = process.env.INDEXNOW_KEY;
    if (!key) throw new Error("INDEXNOW_KEY is not set");

    const parsedUrl = new URL(url);
    const host = parsedUrl.hostname;
    const keyLocation = `${parsedUrl.protocol}//${host}/${key}.txt`;

    const response = await fetch("https://api.indexnow.org/indexnow", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        host,
        key,
        keyLocation,
        urlList: [url],
      }),
    });

    // IndexNow returns 200 or 202 on success
    if (response.status !== 200 && response.status !== 202) {
      throw new Error(`IndexNow error ${response.status}: ${await response.text()}`);
    }

    return {
      jobId: `indexnow-${Date.now()}`,
      status: "submitted",
    };
  });
}
