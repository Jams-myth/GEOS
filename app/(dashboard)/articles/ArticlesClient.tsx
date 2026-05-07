"use client";

import { useState } from "react";
import Link from "next/link";

interface GenerationScores {
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

interface Article {
  id: string;
  title: string;
  primary_keyword: string | null;
  status: string | null;
  published_at: string | null;
  created_at: string | null;
  url: string | null;
  scores: GenerationScores | null;
  position: number | null;
  citedCount: number | null;
}

type Filter = "all" | "live" | "review" | "errors";

const FILTERS: { key: Filter; label: string; statusMatch: string[] }[] = [
  { key: "all",     label: "All",     statusMatch: [] },
  { key: "live",    label: "Live",    statusMatch: ["published"] },
  { key: "review",  label: "Review",  statusMatch: ["draft"] },
  { key: "errors",  label: "Errors",  statusMatch: ["manual_review_required", "skipped"] },
];

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  draft:                    { label: "Review",      className: "bg-amber-100 text-amber-700" },
  published:                { label: "Live",        className: "bg-green-100 text-green-700" },
  skipped:                  { label: "Skipped",     className: "bg-gray-100 text-gray-500" },
  manual_review_required:   { label: "Error",       className: "bg-red-100 text-red-600" },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? { label: status, className: "bg-gray-100 text-gray-600" };
  return (
    <span className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium ${cfg.className}`}>
      {cfg.label}
    </span>
  );
}

function ScoreBadge({ scores }: { scores: GenerationScores | null }) {
  const total = scores?.total;
  if (total == null) return <span className="text-gray-400">—</span>;
  const colour =
    total >= 85 ? "text-green-700 bg-green-50" :
    total >= 70 ? "text-amber-700 bg-amber-50" :
                  "text-red-700 bg-red-50";
  const title = scores ? [
    `Accuracy: ${scores.accuracy_fact_checking ?? "—"}/20`,
    `Density: ${scores.information_density ?? "—"}/15`,
    `Structure: ${scores.structural_machine_readability ?? "—"}/10`,
    `E-E-A-T: ${scores.authoritative_eeat ?? "—"}/15`,
    `Entities: ${scores.entity_optimisation ?? "—"}/10`,
    `Directness: ${scores.directness_intent ?? "—"}/10`,
    `Safety: ${scores.consensus_safety ?? "—"}/10`,
    `Freshness: ${scores.source_freshness ?? "—"}/10`,
  ].join(" · ") : "";
  return (
    <span className={`inline-block text-xs font-bold px-2 py-0.5 rounded-full tabular-nums ${colour}`} title={title}>
      {total}/100
    </span>
  );
}

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export default function ArticlesClient({
  articles,
}: {
  articles: Article[];
}) {
  const [activeFilter, setActiveFilter] = useState<Filter>("all");

  const filtered = activeFilter === "all"
    ? articles
    : articles.filter((a) => {
        const f = FILTERS.find((f) => f.key === activeFilter)!;
        return f.statusMatch.includes(a.status ?? "");
      });

  const counts: Record<Filter, number> = {
    all:    articles.length,
    live:   articles.filter((a) => a.status === "published").length,
    review: articles.filter((a) => a.status === "draft").length,
    errors: articles.filter((a) => a.status === "manual_review_required" || a.status === "skipped").length,
  };

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-2xl font-bold text-gray-900">Articles</h1>
        <span className="text-sm text-gray-400">{articles.length} total</span>
      </div>

      {/* Toggle */}
      <div className="flex gap-1 p-1 bg-gray-100 rounded-xl w-fit mb-6">
        {FILTERS.map((f) => {
          const active = activeFilter === f.key;
          const countColour =
            f.key === "live"   ? (active ? "text-green-200"  : "text-green-600")  :
            f.key === "review" ? (active ? "text-amber-200"  : "text-amber-600")  :
            f.key === "errors" ? (active ? "text-red-200"    : "text-red-500")    :
                                 (active ? "text-indigo-200" : "text-gray-400");
          return (
            <button
              key={f.key}
              onClick={() => setActiveFilter(f.key)}
              className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
                active
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {f.label}
              <span className={`text-xs font-bold tabular-nums ${countColour}`}>
                {counts[f.key]}
              </span>
            </button>
          );
        })}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50 text-gray-600">
              <th className="text-left font-medium px-5 py-3">Title</th>
              <th className="text-left font-medium px-5 py-3 w-44">Primary Keyword</th>
              <th className="text-right font-medium px-5 py-3 w-24">Score</th>
              <th className="text-right font-medium px-5 py-3 w-28">Position</th>
              <th className="text-right font-medium px-5 py-3 w-28">AI Citations</th>
              <th className="text-left font-medium px-5 py-3 w-36">Status</th>
              <th className="text-left font-medium px-5 py-3 w-28">Generated</th>
              <th className="text-left font-medium px-5 py-3 w-28">Date Live</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {filtered.length === 0 && (
              <tr>
                <td colSpan={8} className="px-5 py-10 text-center text-gray-400">
                  No articles in this category.
                </td>
              </tr>
            )}
            {filtered.map((article) => (
              <tr key={article.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-5 py-3">
                  <Link
                    href={`/articles/${article.id}`}
                    className="font-medium text-indigo-600 hover:underline leading-tight"
                  >
                    {article.title}
                  </Link>
                </td>
                <td className="px-5 py-3 text-gray-600">{article.primary_keyword ?? "—"}</td>
                <td className="px-5 py-3 text-right">
                  <ScoreBadge scores={article.scores} />
                </td>
                <td className="px-5 py-3 text-right text-gray-700 tabular-nums">
                  {article.position != null ? article.position.toFixed(1) : "—"}
                </td>
                <td className="px-5 py-3 text-right">
                  {article.citedCount != null ? (
                    <span className={`font-medium ${article.citedCount > 0 ? "text-green-600" : "text-gray-400"}`}>
                      {article.citedCount}/3
                    </span>
                  ) : (
                    <span className="text-gray-400">—</span>
                  )}
                </td>
                <td className="px-5 py-3">
                  <StatusBadge status={article.status ?? "draft"} />
                </td>
                <td className="px-5 py-3 text-gray-500 text-xs">{fmtDate(article.created_at)}</td>
                <td className="px-5 py-3 text-gray-500 text-xs">{fmtDate(article.published_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
