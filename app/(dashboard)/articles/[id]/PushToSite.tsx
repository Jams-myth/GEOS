"use client";

import { useState } from "react";

interface Site {
  id: string;
  name: string;
  domain: string;
  connected: boolean;
}

interface IndexingResult {
  submitted: boolean;
  jobId?: string | null;
  status?: string | null;
  error?: string | null;
}

interface PushResult {
  ok: boolean;
  articleUrl?: string;
  siteName?: string;
  revalidated?: boolean;
  revalidateNote?: string | null;
  indexing?: IndexingResult;
  error?: string;
}

export default function PushToSite({
  articleId,
  currentSiteId,
  sites,
}: {
  articleId: string;
  currentSiteId: string | null;
  sites: Site[];
}) {
  const [selectedSiteId, setSelectedSiteId] = useState(currentSiteId ?? sites[0]?.id ?? "");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<PushResult | null>(null);

  async function handlePush() {
    if (!selectedSiteId) return;
    setLoading(true);
    setResult(null);

    try {
      const res = await fetch(`/api/articles/${articleId}/push`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteId: selectedSiteId }),
      });
      const data = (await res.json()) as PushResult;
      setResult(data);
    } catch (err) {
      setResult({ ok: false, error: err instanceof Error ? err.message : "Request failed" });
    } finally {
      setLoading(false);
    }
  }

  const selectedSite = sites.find((s) => s.id === selectedSiteId);

  if (sites.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-500">
        No sites configured. Add a site in the Sites section to push articles.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        {/* Site dropdown */}
        <div className="relative flex-1">
          <select
            value={selectedSiteId}
            onChange={(e) => {
              setSelectedSiteId(e.target.value);
              setResult(null);
            }}
            disabled={loading}
            className="w-full appearance-none rounded-lg border border-gray-200 bg-white py-2 pl-3 pr-8 text-sm text-gray-800 shadow-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400 disabled:opacity-50"
          >
            {sites.map((site) => (
              <option key={site.id} value={site.id}>
                {site.name} — {site.domain}
                {!site.connected ? " (not configured)" : ""}
              </option>
            ))}
          </select>
          <div className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center">
            <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>

        {/* Connection indicator */}
        {selectedSite && (
          <div className="flex items-center gap-1.5 shrink-0">
            <span
              className={`h-2 w-2 rounded-full ${selectedSite.connected ? "bg-green-500" : "bg-gray-300"}`}
            />
            <span className="text-xs text-gray-500">
              {selectedSite.connected ? "Connected" : "Not configured"}
            </span>
          </div>
        )}

        {/* Push button */}
        <button
          onClick={handlePush}
          disabled={loading || !selectedSiteId}
          className="shrink-0 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1"
        >
          {loading ? (
            <span className="flex items-center gap-2">
              <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              Pushing…
            </span>
          ) : (
            "Push to site →"
          )}
        </button>
      </div>

      {/* Result feedback */}
      {result && (
        <div
          className={`rounded-lg border px-4 py-3 text-sm ${
            result.ok
              ? "border-green-200 bg-green-50 text-green-800"
              : "border-red-200 bg-red-50 text-red-800"
          }`}
        >
          {result.ok ? (
            <div className="space-y-1.5">
              <div className="font-medium">✓ Published to {result.siteName}</div>

              <div className="text-xs text-green-700">
                <a href={result.articleUrl} target="_blank" rel="noopener noreferrer" className="underline hover:text-green-900">
                  {result.articleUrl}
                </a>
              </div>

              {result.revalidated && (
                <div className="text-xs text-green-600 opacity-75">✓ Cache refreshed — live now</div>
              )}
              {result.revalidateNote && !result.revalidated && (
                <div className="text-xs text-green-600 opacity-75">{result.revalidateNote}</div>
              )}

              {result.indexing && (
                <div className={`text-xs mt-1 ${result.indexing.submitted ? "text-green-600" : "text-amber-600"}`}>
                  {result.indexing.submitted
                    ? `✓ Submitted to SpeedyIndex — job ${result.indexing.jobId ?? "—"} (${result.indexing.status ?? "queued"})`
                    : `⚠ SpeedyIndex: ${result.indexing.error ?? "not submitted"}`}
                </div>
              )}
            </div>
          ) : (
            <div className="font-medium">✗ {result.error ?? "Push failed"}</div>
          )}
        </div>
      )}
    </div>
  );
}
