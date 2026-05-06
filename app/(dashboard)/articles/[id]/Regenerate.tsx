"use client";

import { useState } from "react";

export default function Regenerate({ articleId }: { articleId: string }) {
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleRegenerate() {
    if (!confirm("This will discard the current article and queue a full rewrite from scratch. Continue?")) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/articles/${articleId}/regenerate`, { method: "POST" });
      const data = await res.json() as { ok: boolean; message?: string; error?: string };
      if (!data.ok) throw new Error(data.error ?? "Unknown error");
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-800">
        ✓ Regeneration queued. The article is being rewritten from scratch — you&apos;ll get a Discord notification when the new draft is ready.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-500">
        Discards all current content and runs a full regeneration pipeline from scratch — fresh scrapes, new Claude draft, Gemini score. Use when re-polish can&apos;t fix the issues (e.g. fabricated citations, wrong data).
      </p>
      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
          Error: {error}
        </div>
      )}
      <button
        onClick={handleRegenerate}
        disabled={loading}
        className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
      >
        {loading && (
          <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
        )}
        {loading ? "Queueing…" : "Regenerate from scratch →"}
      </button>
    </div>
  );
}
