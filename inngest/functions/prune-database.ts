import { inngest } from "../client";
import { getDb } from "../../lib/db/client";

// ─── Retention policy ─────────────────────────────────────────────────────────
//
//  PRUNED (with time limits):
//    source_scrapes        — all rows older than 30 days
//    topic_candidates      — status IN (rejected, superseded, expired) older than 30 days
//    api_batch_logs        — all rows older than 90 days
//    consumed_approval_tokens — all rows older than 7 days
//    improvements          — status IN (expired, rejected) older than 90 days
//    token_usage_logs      — all rows older than 365 days
//
//  NEVER PRUNED:
//    articles              — permanent record
//    assessments           — permanent record (weekly history)
//    revisions             — permanent record (rollback snapshots)
//    improvements          — status IN (pending_approval, approved, applied, rolled_back)
//    topic_candidates      — status IN (pending, selected, published)
//
// ─────────────────────────────────────────────────────────────────────────────

interface PruneCounts {
  source_scrapes: number;
  topic_candidates: number;
  api_batch_logs: number;
  consumed_approval_tokens: number;
  improvements: number;
  token_usage_logs: number;
}

function daysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

export const pruneDatabase = inngest.createFunction(
  {
    id: "prune-database",
    concurrency: { limit: 1 },
    triggers: [{ cron: "0 3 * * 0" }], // Weekly at 3 AM Sunday
    retries: 1,
  },
  async ({ step }) => {
    const counts: PruneCounts = {
      source_scrapes: 0,
      topic_candidates: 0,
      api_batch_logs: 0,
      consumed_approval_tokens: 0,
      improvements: 0,
      token_usage_logs: 0,
    };

    // ── source_scrapes — all rows older than 30 days ──────────────────────────
    counts.source_scrapes = await step.run("prune-source-scrapes", async () => {
      const db = getDb();
      const cutoff = daysAgo(30);
      const { data, error } = await db
        .from("source_scrapes")
        .delete()
        .lt("scraped_at", cutoff)
        .select("id");
      if (error) throw new Error(`prune source_scrapes: ${error.message}`);
      return (data ?? []).length;
    });

    // ── topic_candidates — rejected/superseded/expired older than 30 days ────
    counts.topic_candidates = await step.run("prune-topic-candidates", async () => {
      const db = getDb();
      const cutoff = daysAgo(30);
      const { data, error } = await db
        .from("topic_candidates")
        .delete()
        .in("status", ["rejected", "superseded", "expired"])
        .lt("discovered_at", cutoff)
        .select("id");
      if (error) throw new Error(`prune topic_candidates: ${error.message}`);
      return (data ?? []).length;
    });

    // ── api_batch_logs — all rows older than 90 days ──────────────────────────
    counts.api_batch_logs = await step.run("prune-api-batch-logs", async () => {
      const db = getDb();
      const cutoff = daysAgo(90);
      const { data, error } = await db
        .from("api_batch_logs")
        .delete()
        .lt("request_at", cutoff)
        .select("id");
      if (error) throw new Error(`prune api_batch_logs: ${error.message}`);
      return (data ?? []).length;
    });

    // ── consumed_approval_tokens — all rows older than 7 days ────────────────
    counts.consumed_approval_tokens = await step.run(
      "prune-consumed-tokens",
      async () => {
        const db = getDb();
        const cutoff = daysAgo(7);
        const { data, error } = await db
          .from("consumed_approval_tokens")
          .delete()
          .lt("used_at", cutoff)
          .select("token");
        if (error) throw new Error(`prune consumed_approval_tokens: ${error.message}`);
        return (data ?? []).length;
      }
    );

    // ── improvements — expired/rejected older than 90 days ───────────────────
    // NEVER deletes: pending_approval, approved, applied, rolled_back
    counts.improvements = await step.run("prune-improvements", async () => {
      const db = getDb();
      const cutoff = daysAgo(90);
      const { data, error } = await db
        .from("improvements")
        .delete()
        .in("status", ["expired", "rejected"])
        .lt("created_at", cutoff)
        .select("id");
      if (error) throw new Error(`prune improvements: ${error.message}`);
      return (data ?? []).length;
    });

    // ── token_usage_logs — all rows older than 365 days ──────────────────────
    counts.token_usage_logs = await step.run("prune-token-usage-logs", async () => {
      const db = getDb();
      const cutoff = daysAgo(365);
      const { data, error } = await db
        .from("token_usage_logs")
        .delete()
        .lt("created_at", cutoff)
        .select("id");
      if (error) throw new Error(`prune token_usage_logs: ${error.message}`);
      return (data ?? []).length;
    });

    // ── Log this prune run to api_batch_logs for observability ────────────────
    await step.run("log-prune-run", async () => {
      const db = getDb();
      const total = Object.values(counts).reduce((a, b) => a + b, 0);
      await db.from("api_batch_logs").insert({
        service: "prune-database",
        batch_size: total,
        request_at: new Date().toISOString(),
        response_time_ms: 0,
        cost_estimate: 0,
      });
    });

    return { tableCounts: counts };
  }
);
