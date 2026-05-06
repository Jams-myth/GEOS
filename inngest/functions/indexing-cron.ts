import { inngest } from "../client";
import { getDb } from "../../lib/db/client";
import { submitToSpeedyIndex, checkSpeedyIndexStatus } from "../../lib/indexing/speedyindex";

// ─── Types ────────────────────────────────────────────────────────────────────

type IndexingJob = {
  adapter: string;
  jobId: string;
  status: string;
  submittedAt?: string;
  checkedAt?: string;
};

type ArticleRow = {
  id: string;
  url: string | null;
  indexing_jobs_jsonb: unknown;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseJobs(raw: unknown): IndexingJob[] {
  return Array.isArray(raw) ? (raw as IndexingJob[]) : [];
}

function hoursSince(iso: string | undefined): number {
  if (!iso) return 999;
  return (Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60);
}

// ─── Inngest cron ─────────────────────────────────────────────────────────────
//
//  Runs daily at 08:00 UTC. For each published article it:
//
//    1. SKIPS          — latest job is "indexed" (nothing more to do)
//    2. RE-SUBMITS     — no job, or latest job has status "failed" / "error"
//    3. POLLS          — latest job is "submitted"/"processing" AND was
//                        submitted > 48 h ago; updates status in DB
//    4. WAITS          — submitted < 48 h ago, not yet indexed; leaves alone
//
// ─────────────────────────────────────────────────────────────────────────────

export const indexingCron = inngest.createFunction(
  {
    id: "indexing-cron",
    name: "Daily SpeedyIndex Status Check & Retry",
    concurrency: { limit: 1 },
    retries: 1,
  },
  { cron: "0 8 * * *" }, // 08:00 UTC daily
  async ({ step }) => {
    // ── 1. Fetch all published articles with a URL ──────────────────────────
    const articles: ArticleRow[] = await step.run("fetch-published-articles", async () => {
      const db = getDb();
      const { data, error } = await db
        .from("articles")
        .select("id, url, indexing_jobs_jsonb")
        .eq("status", "published")
        .not("url", "is", null);

      if (error) throw new Error(`Failed to fetch articles: ${error.message}`);
      return (data ?? []) as ArticleRow[];
    });

    console.log(`indexing-cron: processing ${articles.length} published articles`);

    const counts = { skipped: 0, submitted: 0, polled: 0, indexed: 0, failed: 0, errors: 0 };

    // ── 2. Process each article individually so one failure doesn't block rest
    for (const article of articles) {
      if (!article.url) continue;

      await step.run(`process-${article.id}`, async () => {
        const db = getDb();
        const jobs = parseJobs(article.indexing_jobs_jsonb);
        const latest = jobs[jobs.length - 1] as IndexingJob | undefined;

        // ── Already indexed — nothing to do ──────────────────────────────
        if (latest?.status === "indexed") {
          counts.skipped++;
          return;
        }

        // ── No job, or last attempt failed — submit fresh ─────────────────
        if (!latest || latest.status === "failed" || latest.status === "error") {
          try {
            const { jobId, status } = await submitToSpeedyIndex(article.url!);
            const newJob: IndexingJob = {
              adapter: "speedyindex",
              jobId,
              status,
              submittedAt: new Date().toISOString(),
            };
            await db
              .from("articles")
              .update({ indexing_jobs_jsonb: [...jobs, newJob] })
              .eq("id", article.id);
            counts.submitted++;
            console.log(`indexing-cron: submitted ${article.url} → job ${jobId}`);
          } catch (err) {
            counts.errors++;
            console.error(`indexing-cron: submit failed for ${article.url}: ${String(err)}`);
          }
          return;
        }

        // ── Submitted/processing but recent — leave it alone ─────────────
        const pendingStatuses = ["submitted", "processing", "ok"];
        if (pendingStatuses.includes(latest.status) && hoursSince(latest.submittedAt) < 48) {
          counts.skipped++;
          return;
        }

        // ── Submitted > 48 h ago — poll for updated status ────────────────
        if (pendingStatuses.includes(latest.status)) {
          try {
            const { status: newStatus } = await checkSpeedyIndexStatus(latest.jobId);
            const updatedJob: IndexingJob = {
              ...latest,
              status: newStatus,
              checkedAt: new Date().toISOString(),
            };
            const updatedJobs = jobs.map((j, i) =>
              i === jobs.length - 1 ? updatedJob : j
            );
            await db
              .from("articles")
              .update({ indexing_jobs_jsonb: updatedJobs })
              .eq("id", article.id);

            if (newStatus === "indexed") {
              counts.indexed++;
              console.log(`indexing-cron: confirmed indexed ${article.url}`);
            } else if (newStatus === "failed") {
              counts.failed++;
              console.warn(`indexing-cron: SpeedyIndex reported failed for ${article.url}`);
            } else {
              counts.polled++;
              console.log(`indexing-cron: polled ${article.url} → still ${newStatus}`);
            }
          } catch (err) {
            counts.errors++;
            console.error(`indexing-cron: poll failed for ${article.url}: ${String(err)}`);
          }
        }
      });
    }

    console.log("indexing-cron: done", counts);
    return { articles: articles.length, ...counts };
  }
);
