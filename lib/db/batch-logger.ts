import { getDb } from "./client";

export async function logApiBatch(
  service: string,
  batchSize: number,
  responseTimeMs: number,
  costEstimate: number
): Promise<void> {
  const db = getDb();
  await db.from("api_batch_logs").insert({
    service,
    batch_size: batchSize,
    request_at: new Date().toISOString(),
    response_time_ms: responseTimeMs,
    cost_estimate: costEstimate,
  });
}
