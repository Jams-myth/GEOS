"use client";

import { useState } from "react";

type IndexingJob = {
  adapter: string;
  jobId: string;
  status: string;
  submittedAt?: string;
  checkedAt?: string;
};

type ReindexResult = {
  ok: boolean;
  action?: "submitted" | "polled" | "noop";
  jobId?: string;
  status?: string;
  message?: string;
  error?: string;
};

function StatusBadge({ status }: { status: string }) {
  const cfg: Record<string, string> = {
    indexed:    "bg-green-100 text-green-700",
    submitted:  "bg-blue-100 text-blue-700",
    processing: "bg-blue-100 text-blue-700",
    failed:     "bg-red-100 text-red-700",
    error:      "bg-red-100 text-red-700",
    ok:         "bg-blue-100 text-blue-700",
  };
  const cls = cfg[status] ?? "bg-gray-100 text-gray-600";
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cls}`}>
      {status}
    </span>
  );
}

function formatDate(iso: string | undefined) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

export default function IndexingStatus({
  articleId,
  initialJobs,
  hasUrl,
}: {
  articleId: string;
  initialJobs: IndexingJob[];
  hasUrl: boolean;
}) {
  const [jobs, setJobs] = useState<IndexingJob[]>(initialJobs);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ReindexResult | null>(null);

  const latest = jobs[jobs.length - 1] as IndexingJob | undefined;

  async function handleReindex() {
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch(`/api/articles/${articleId}/reindex`, { method: "POST" });
      const data: ReindexResult = await res.json();
      setResult(data);

      // Refresh the jobs list from returned status
      if (data.ok && data.jobId && data.status && data.action !== "noop") {
        if (data.action === "submitted") {
          setJobs((prev) => [
            ...prev,
            {
              adapter: "speedyindex",
              jobId: data.jobId!,
              status: data.status!,
              submittedAt: new Date().toISOString(),
            },
          ]);
        } else if (data.action === "polled") {
          setJobs((prev) =>
            prev.map((j, i) =>
              i === prev.length - 1
                ? { ...j, status: data.status!, checkedAt: new Date().toISOString() }
                : j
            )
          );
        }
      }
    } catch (err) {
      setResult({ ok: false, error: String(err) });
    } finally {
      setLoading(false);
    }
  }

  const buttonLabel = () => {
    if (loading) return "Checking…";
    if (!latest || latest.status === "failed" || latest.status === "error") return "Submit to SpeedyIndex";
    if (latest.status === "indexed") return "Check Status";
    return "Poll Status";
  };

  return (
    <div className="space-y-3">
      {/* Job list */}
      {jobs.length === 0 ? (
        <p className="text-sm text-gray-400">Not yet submitted.</p>
      ) : (
        <div className="space-y-2">
          {jobs.map((job, i) => (
            <div key={i} className="flex flex-wrap items-center gap-3 text-sm">
              <span className="inline-flex items-center gap-1.5 font-medium text-gray-700">
                <span className={`h-2 w-2 rounded-full ${job.status === "indexed" ? "bg-green-500" : job.status === "failed" || job.status === "error" ? "bg-red-400" : "bg-blue-400"}`} />
                SpeedyIndex
              </span>
              <span className="text-gray-400 font-mono text-xs truncate max-w-[160px]" title={job.jobId}>
                {job.jobId.length > 20 ? `${job.jobId.slice(0, 20)}…` : job.jobId}
              </span>
              <StatusBadge status={job.status} />
              <span className="text-xs text-gray-400 ml-auto">
                {job.checkedAt
                  ? `Checked ${formatDate(job.checkedAt)}`
                  : job.submittedAt
                  ? `Submitted ${formatDate(job.submittedAt)}`
                  : null}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Action feedback */}
      {result && (
        <div className={`rounded-lg px-3 py-2 text-sm ${result.ok ? "bg-green-50 text-green-800 border border-green-200" : "bg-red-50 text-red-800 border border-red-200"}`}>
          {result.ok ? result.message : `Error: ${result.error}`}
        </div>
      )}

      {/* Button */}
      {hasUrl && (
        <button
          onClick={handleReindex}
          disabled={loading || latest?.status === "indexed"}
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
        >
          {loading && (
            <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
          )}
          {buttonLabel()}
        </button>
      )}

      {!hasUrl && (
        <p className="text-xs text-amber-600">Push this article to the site before submitting to SpeedyIndex.</p>
      )}

      {latest?.status === "indexed" && (
        <p className="text-xs text-green-600 font-medium">✓ Confirmed indexed by Google via SpeedyIndex</p>
      )}
    </div>
  );
}
