"use client";

import { useState, useCallback } from "react";
import Link from "next/link";

interface Keyword {
  id: string;
  keyword: string;
  status: "pending" | "in_progress" | "done";
  article_id: string | null;
  created_at: string;
  completed_at: string | null;
}

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-700",
  in_progress: "bg-blue-100 text-blue-700",
  done: "bg-green-100 text-green-700",
};

const STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  in_progress: "Generating…",
  done: "Done",
};

export default function KeywordsClient({
  siteId,
  initialKeywords,
}: {
  siteId: string;
  initialKeywords: Keyword[];
}) {
  const [keywords, setKeywords] = useState<Keyword[]>(initialKeywords);
  const [input, setInput] = useState("");
  const [adding, setAdding] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const addKeyword = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed) return;
    setAdding(true);
    setError(null);

    try {
      const res = await fetch("/api/keywords", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteId, keyword: trimmed }),
      });
      const data = (await res.json()) as { keyword?: Keyword; error?: string };
      if (!res.ok || !data.keyword) {
        setError(data.error ?? "Failed to add keyword");
        return;
      }
      setKeywords((prev) => [data.keyword!, ...prev]);
      setInput("");
    } catch {
      setError("Request failed");
    } finally {
      setAdding(false);
    }
  }, [input, siteId]);

  const deleteKeyword = useCallback(async (id: string) => {
    setDeletingId(id);
    try {
      await fetch(`/api/keywords?id=${id}`, { method: "DELETE" });
      setKeywords((prev) => prev.filter((k) => k.id !== id));
    } finally {
      setDeletingId(null);
    }
  }, []);

  const pending = keywords.filter((k) => k.status === "pending");
  const inProgress = keywords.filter((k) => k.status === "in_progress");
  const done = keywords.filter((k) => k.status === "done");

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Target Keywords</h1>
          <p className="mt-1 text-sm text-gray-500">
            Add the phrases you want to rank for. Topic discovery will generate an article for each one.
          </p>
        </div>
        <div className="text-sm text-gray-400">
          {pending.length} pending · {inProgress.length} generating · {done.length} done
        </div>
      </div>

      {/* Add keyword */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
        <div className="text-xs text-gray-400 uppercase tracking-wide mb-3">Add a keyword or phrase</div>
        <div className="flex gap-3">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addKeyword()}
            placeholder='e.g. "Compare Mounjaro Prices UK 2026"'
            className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 shadow-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
            disabled={adding}
          />
          <button
            onClick={addKeyword}
            disabled={adding || !input.trim()}
            className="shrink-0 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {adding ? "Adding…" : "+ Add"}
          </button>
        </div>
        {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
        <p className="mt-2 text-xs text-gray-400">
          Tip: be specific. "Cheapest Mounjaro UK clinic 2026" will rank better than "Mounjaro".
        </p>
      </div>

      {/* Keyword list */}
      {keywords.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-200 bg-white p-10 text-center text-sm text-gray-400">
          No keywords yet. Add one above to get started.
        </div>
      ) : (
        <div className="space-y-2">
          {[...inProgress, ...pending, ...done].map((kw) => (
            <div
              key={kw.id}
              className="flex items-center gap-4 rounded-xl border border-gray-200 bg-white px-5 py-3.5"
            >
              {/* Keyword text */}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-gray-900 truncate">{kw.keyword}</div>
                <div className="text-xs text-gray-400 mt-0.5">
                  Added {new Date(kw.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                  {kw.completed_at && (
                    <> · Completed {new Date(kw.completed_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</>
                  )}
                </div>
              </div>

              {/* Status badge */}
              <span className={`shrink-0 inline-block text-xs px-2.5 py-1 rounded-full font-medium ${STATUS_STYLES[kw.status]}`}>
                {STATUS_LABELS[kw.status]}
              </span>

              {/* Article link (when done) */}
              {kw.status === "done" && kw.article_id && (
                <Link
                  href={`/articles/${kw.article_id}`}
                  className="shrink-0 text-xs font-medium text-indigo-600 hover:underline"
                >
                  View article →
                </Link>
              )}

              {/* Delete (pending only) */}
              {kw.status === "pending" && (
                <button
                  onClick={() => deleteKeyword(kw.id)}
                  disabled={deletingId === kw.id}
                  className="shrink-0 text-xs text-gray-400 hover:text-red-500 transition-colors disabled:opacity-50"
                  title="Remove"
                >
                  {deletingId === kw.id ? "…" : "✕"}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
