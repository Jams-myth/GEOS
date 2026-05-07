"use client";

import { useState, useMemo } from "react";
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

type Filter   = "all" | "live" | "review" | "errors";
type Timeframe = "all" | "24h" | "week" | "month" | "6months";
type SortKey  = "title" | "score" | "position" | "citations" | "created_at" | "published_at";
type SortDir  = "asc" | "desc";

const STATUS_FILTERS: { key: Filter; label: string; match: string[] }[] = [
  { key: "all",    label: "All",    match: [] },
  { key: "live",   label: "Live",   match: ["published"] },
  { key: "review", label: "Review", match: ["draft"] },
  { key: "errors", label: "Errors", match: ["manual_review_required", "skipped"] },
];

const TIMEFRAMES: { key: Timeframe; label: string }[] = [
  { key: "all",     label: "All time" },
  { key: "24h",     label: "24 hours" },
  { key: "week",    label: "This week" },
  { key: "month",   label: "This month" },
  { key: "6months", label: "Last 6 months" },
];

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  draft:                  { label: "Review",  className: "bg-amber-100 text-amber-700" },
  published:              { label: "Live",    className: "bg-green-100 text-green-700" },
  skipped:                { label: "Skipped", className: "bg-gray-100 text-gray-500"  },
  manual_review_required: { label: "Error",   className: "bg-red-100 text-red-600"    },
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

/**
 * Supabase returns timestamps like "2026-05-07 06:29:07.25997+00"
 * (space instead of T, +00 without :00). Some browsers return Invalid Date
 * for that format, making comparisons silently return false.
 * This normalises to a proper ISO string before parsing.
 */
function parseDate(s: string | null): Date | null {
  if (!s) return null;
  const normalised = s
    .replace(" ", "T")                    // space → T
    .replace(/([+-]\d{2})$/, "$1:00");    // +00 → +00:00
  const d = new Date(normalised);
  return isNaN(d.getTime()) ? null : d;
}

function fmtDate(iso: string | null) {
  const d = parseDate(iso);
  if (!d) return "—";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function cutoff(tf: Timeframe): Date | null {
  if (tf === "all") return null;
  const now = new Date();
  if (tf === "24h")     { now.setTime(now.getTime() - 24 * 60 * 60 * 1000);   return now; }
  if (tf === "week")    { now.setTime(now.getTime() - 7  * 24 * 60 * 60 * 1000); return now; }
  if (tf === "month")   { now.setTime(now.getTime() - 30 * 24 * 60 * 60 * 1000); return now; }
  if (tf === "6months") { now.setTime(now.getTime() - 180 * 24 * 60 * 60 * 1000); return now; }
  return null;
}

function SortIcon({ col, sortKey, dir }: { col: SortKey; sortKey: SortKey; dir: SortDir }) {
  if (col !== sortKey) return <span className="ml-1 text-gray-300 select-none">↕</span>;
  return <span className="ml-1 text-indigo-500 select-none">{dir === "asc" ? "↑" : "↓"}</span>;
}

export default function ArticlesClient({ articles }: { articles: Article[] }) {
  const [filter,    setFilter]    = useState<Filter>("all");
  const [timeframe, setTimeframe] = useState<Timeframe>("all");
  const [sortKey,   setSortKey]   = useState<SortKey>("created_at");
  const [sortDir,   setSortDir]   = useState<SortDir>("desc");

  function handleSort(col: SortKey) {
    if (col === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(col);
      setSortDir("desc");
    }
  }

  const filtered = useMemo(() => {
    const cut = cutoff(timeframe);

    return [...articles]
      .filter((a) => {
        // Status filter
        const sf = STATUS_FILTERS.find((f) => f.key === filter)!;
        if (sf.match.length > 0 && !sf.match.includes(a.status ?? "")) return false;
        // Timeframe filter — applied to created_at
        if (cut) {
          const d = parseDate(a.created_at);
          if (!d || d < cut) return false;
        }
        return true;
      })
      .sort((a, b) => {
        let av: number | string | null = null;
        let bv: number | string | null = null;

        if (sortKey === "title")        { av = a.title ?? "";       bv = b.title ?? ""; }
        if (sortKey === "score")        { av = a.scores?.total ?? -1; bv = b.scores?.total ?? -1; }
        if (sortKey === "position")     { av = a.position ?? 9999;  bv = b.position ?? 9999; }
        if (sortKey === "citations")    { av = a.citedCount ?? -1;  bv = b.citedCount ?? -1; }
        if (sortKey === "created_at")   { av = parseDate(a.created_at)?.getTime()   ?? 0; bv = parseDate(b.created_at)?.getTime()   ?? 0; }
        if (sortKey === "published_at") { av = parseDate(a.published_at)?.getTime() ?? 0; bv = parseDate(b.published_at)?.getTime() ?? 0; }

        if (av === null || bv === null) return 0;
        const cmp = av < bv ? -1 : av > bv ? 1 : 0;
        return sortDir === "asc" ? cmp : -cmp;
      });
  }, [articles, filter, timeframe, sortKey, sortDir]);

  const counts: Record<Filter, number> = useMemo(() => {
    const cut = cutoff(timeframe);
    const inWindow = cut
      ? articles.filter((a) => { const d = parseDate(a.created_at); return d !== null && d >= cut; })
      : articles;
    return {
      all:    inWindow.length,
      live:   inWindow.filter((a) => a.status === "published").length,
      review: inWindow.filter((a) => a.status === "draft").length,
      errors: inWindow.filter((a) => a.status === "manual_review_required" || a.status === "skipped").length,
    };
  }, [articles, timeframe]);

  function th(col: SortKey, label: string, cls = "") {
    return (
      <th
        className={`text-left font-medium px-5 py-3 cursor-pointer select-none hover:text-indigo-600 transition-colors ${cls}`}
        onClick={() => handleSort(col)}
      >
        <span className="inline-flex items-center">
          {label}
          <SortIcon col={col} sortKey={sortKey} dir={sortDir} />
        </span>
      </th>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-2xl font-bold text-gray-900">Articles</h1>
        <span className="text-sm text-gray-400">{articles.length} total</span>
      </div>

      {/* Controls row */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        {/* Status toggle */}
        <div className="flex gap-1 p-1 bg-gray-100 rounded-xl">
          {STATUS_FILTERS.map((f) => {
            const active = filter === f.key;
            const countColour =
              f.key === "live"   ? (active ? "text-green-200"  : "text-green-600")  :
              f.key === "review" ? (active ? "text-amber-200"  : "text-amber-600")  :
              f.key === "errors" ? (active ? "text-red-200"    : "text-red-500")    :
                                   (active ? "text-indigo-200" : "text-gray-400");
            return (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
                  active ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
                }`}
              >
                {f.label}
                <span className={`text-xs font-bold tabular-nums ${countColour}`}>{counts[f.key]}</span>
              </button>
            );
          })}
        </div>

        {/* Divider */}
        <div className="h-6 w-px bg-gray-200" />

        {/* Timeframe selector */}
        <div className="flex gap-1 p-1 bg-gray-100 rounded-xl">
          {TIMEFRAMES.map((t) => (
            <button
              key={t.key}
              onClick={() => setTimeframe(t.key)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                timeframe === t.key
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50 text-gray-600">
              {th("title",        "Title")}
              <th className="text-left font-medium px-5 py-3 w-44">Primary Keyword</th>
              {th("score",        "Score",        "w-24 text-right")}
              {th("position",     "Position",     "w-28 text-right")}
              {th("citations",    "AI Citations", "w-28 text-right")}
              <th className="text-left font-medium px-5 py-3 w-36">Status</th>
              {th("created_at",   "Generated",    "w-28")}
              {th("published_at", "Date Live",    "w-28")}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {filtered.length === 0 && (
              <tr>
                <td colSpan={8} className="px-5 py-10 text-center text-gray-400">
                  No articles match this filter.
                </td>
              </tr>
            )}
            {filtered.map((article) => (
              <tr key={article.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-5 py-3">
                  <Link href={`/articles/${article.id}`} className="font-medium text-indigo-600 hover:underline leading-tight">
                    {article.title}
                  </Link>
                </td>
                <td className="px-5 py-3 text-gray-600">{article.primary_keyword ?? "—"}</td>
                <td className="px-5 py-3 text-right"><ScoreBadge scores={article.scores} /></td>
                <td className="px-5 py-3 text-right text-gray-700 tabular-nums">
                  {article.position != null ? article.position.toFixed(1) : "—"}
                </td>
                <td className="px-5 py-3 text-right">
                  {article.citedCount != null ? (
                    <span className={`font-medium ${article.citedCount > 0 ? "text-green-600" : "text-gray-400"}`}>
                      {article.citedCount}/3
                    </span>
                  ) : <span className="text-gray-400">—</span>}
                </td>
                <td className="px-5 py-3"><StatusBadge status={article.status ?? "draft"} /></td>
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
