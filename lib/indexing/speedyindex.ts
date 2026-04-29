export async function submitToSpeedyIndex(url: string): Promise<{ jobId: string; status: string }> {
  const apiKey = process.env.SPEEDYINDEX_API_KEY;
  if (!apiKey) throw new Error("SPEEDYINDEX_API_KEY is not set");

  const response = await fetch("https://api.speedyindex.com/v2/task/google/indexer/create", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: apiKey,
    },
    body: JSON.stringify({ urls: [url] }),
  });

  if (!response.ok) {
    throw new Error(`SpeedyIndex error ${response.status}: ${await response.text()}`);
  }

  const data = await response.json() as { task_id?: string; status?: string };

  return {
    jobId: data.task_id ?? url,
    status: data.status ?? "submitted",
  };
}
