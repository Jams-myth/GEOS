"use client";

import { useState } from "react";

interface Scores {
  total?: number;
  accuracy_fact_checking?: number;
  information_density?: number;
  structural_machine_readability?: number;
  authoritative_eeat?: number;
  entity_optimisation?: number;
  directness_intent?: number;
  consensus_safety?: number;
  source_freshness?: number;
}

interface RePolishResult {
  ok: boolean;
  scores?: Scores;
  pass?: boolean;
  revisionNotes?: string[];
  newVersion?: number;
  revalidated?: boolean;
  error?: string;
}

export default function RePolish({ articleId }: { articleId: string }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<RePolishResult | null>(null);

  async function handleRePolish() {
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch(`/api/articles/${articleId}/re-polish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = (await res.json()) as RePolishResult;
      setResult(data);
    } catch (err) {
      setResult({ ok: false, error: err instanceof Error ? err.message : "Request failed" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <p className="flex-1 text-sm text-gray-500">
          Fixes footnote format → HTML superscripts, adds inline citation links, and adds 6-month pricing totals. Then re-scores against the v2 rubric.
        </p>
        <button
          onClick={handleRePolish}
          disabled={loading}
          className="shrink-0 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-1"
        >
          {loading ? (
            <span className="flex items-center gap-2">
              <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              Polishing… (3–5 min)
            </span>
          ) : (
            "Re-Polish & Re-Score →"
          )}
        </button>
      </div>

      {result && (
        <div
          className={`rounded-lg border px-4 py-3 text-sm ${
            result.ok
              ? result.pass
                ? "border-green-200 bg-green-50 text-green-800"
                : "border-amber-200 bg-amber-50 text-amber-800"
              : "border-red-200 bg-red-50 text-red-800"
          }`}
        >
          {result.ok ? (
            <div className="space-y-2">
              <div className="font-medium flex items-center gap-3">
                {result.pass ? "✓ Pass" : "⚠ Below threshold"} — Score: {result.scores?.total ?? "—"}/100
                <span className="text-xs font-normal opacity-70">v{result.newVersion}</span>
                {result.revalidated && (
                  <span className="text-xs font-normal opacity-70">· Live cache refreshed</span>
                )}
              </div>

              {result.scores && (
                <div className="grid grid-cols-4 gap-x-4 gap-y-0.5 text-xs opacity-80 font-mono tabular-nums">
                  <span>Accuracy {result.scores.accuracy_fact_checking ?? "—"}/20</span>
                  <span>Density {result.scores.information_density ?? "—"}/15</span>
                  <span>Structure {result.scores.structural_machine_readability ?? "—"}/10</span>
                  <span>E-E-A-T {result.scores.authoritative_eeat ?? "—"}/15</span>
                  <span>Entities {result.scores.entity_optimisation ?? "—"}/10</span>
                  <span>Directness {result.scores.directness_intent ?? "—"}/10</span>
                  <span>Safety {result.scores.consensus_safety ?? "—"}/10</span>
                  <span>Freshness {result.scores.source_freshness ?? "—"}/10</span>
                </div>
              )}

              {result.revisionNotes && result.revisionNotes.length > 0 && (
                <div className="pt-1 border-t border-current border-opacity-10">
                  <div className="text-xs font-medium mb-1 opacity-70">Remaining notes from Gemini:</div>
                  <ul className="text-xs space-y-0.5 opacity-70 list-disc list-inside">
                    {result.revisionNotes.map((note, i) => (
                      <li key={i}>{note}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : (
            <div className="font-medium">✗ {result.error ?? "Re-polish failed"}</div>
          )}
        </div>
      )}
    </div>
  );
}
