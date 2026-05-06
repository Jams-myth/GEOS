import { NextRequest, NextResponse } from "next/server";
import { getDb } from "../../../../../lib/db/client";
import { submitToSpeedyIndex, checkSpeedyIndexStatus } from "../../../../../lib/indexing/speedyindex";

type IndexingJob = {
  adapter: string;
  jobId: string;
  status: string;
  submittedAt?: string;
  checkedAt?: string;
};

function parseJobs(raw: unknown): IndexingJob[] {
  return Array.isArray(raw) ? (raw as IndexingJob[]) : [];
}

function hoursSince(iso: string | undefined): number {
  if (!iso) return 999;
  return (Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60);
}

/**
 * POST /api/articles/[id]/reindex
 *
 * Manual trigger for SpeedyIndex submission or status poll.
 *
 * Logic mirrors the cron:
 *  - Already indexed        → returns current status, no-op
 *  - No job / failed        → submits fresh
 *  - Pending < 48 h         → polls SpeedyIndex for current status
 *  - Pending ≥ 48 h         → polls SpeedyIndex for current status
 *
 * Body: none required.
 * Returns: { ok, action, jobId, status, message }
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = getDb();

  const { data: article, error } = await db
    .from("articles")
    .select("id, url, indexing_jobs_jsonb")
    .eq("id", id)
    .single();

  if (error || !article) {
    return NextResponse.json({ ok: false, error: "Article not found" }, { status: 404 });
  }

  if (!article.url) {
    return NextResponse.json({ ok: false, error: "Article has no live URL — push it to the site first" }, { status: 400 });
  }

  const jobs = parseJobs(article.indexing_jobs_jsonb);
  const latest = jobs[jobs.length - 1] as IndexingJob | undefined;

  // ── Already confirmed indexed ────────────────────────────────────────────
  if (latest?.status === "indexed") {
    return NextResponse.json({
      ok: true,
      action: "noop",
      jobId: latest.jobId,
      status: "indexed",
      message: "Already confirmed indexed by Google via SpeedyIndex.",
    });
  }

  // ── No prior job, or last attempt failed — submit fresh ──────────────────
  if (!latest || latest.status === "failed" || latest.status === "error") {
    try {
      const { jobId, status } = await submitToSpeedyIndex(article.url);
      const newJob: IndexingJob = {
        adapter: "speedyindex",
        jobId,
        status,
        submittedAt: new Date().toISOString(),
      };
      await db
        .from("articles")
        .update({ indexing_jobs_jsonb: [...jobs, newJob] })
        .eq("id", id);

      return NextResponse.json({
        ok: true,
        action: "submitted",
        jobId,
        status,
        message: "URL submitted to SpeedyIndex successfully.",
      });
    } catch (err) {
      return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
    }
  }

  // ── Pending job — poll SpeedyIndex for current status ────────────────────
  const pendingStatuses = ["submitted", "processing", "ok"];
  if (pendingStatuses.includes(latest.status)) {
    try {
      const { status: newStatus } = await checkSpeedyIndexStatus(latest.jobId);
      const updatedJob: IndexingJob = {
        ...latest,
        status: newStatus,
        checkedAt: new Date().toISOString(),
      };
      const updatedJobs = jobs.map((j, i) => (i === jobs.length - 1 ? updatedJob : j));
      await db
        .from("articles")
        .update({ indexing_jobs_jsonb: updatedJobs })
        .eq("id", id);

      const age = Math.round(hoursSince(latest.submittedAt));
      const message =
        newStatus === "indexed"
          ? "Confirmed indexed by Google via SpeedyIndex."
          : newStatus === "failed"
          ? "SpeedyIndex reported a failure — will re-submit on next cron run."
          : `Still ${newStatus} (submitted ${age}h ago). SpeedyIndex typically takes up to 48h.`;

      return NextResponse.json({
        ok: true,
        action: "polled",
        jobId: latest.jobId,
        status: newStatus,
        message,
      });
    } catch (err) {
      return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: false, error: "Unexpected indexing state" }, { status: 500 });
}
