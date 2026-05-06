import { getDb } from "../../../lib/db/client";
import Link from "next/link";

interface SerpData {
  position?: number | null;
}

interface CitationData {
  perplexity?: { cited?: boolean };
  openai?: { cited?: boolean };
  gemini?: { cited?: boolean };
}

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

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  draft:     { label: "Review",      className: "bg-amber-100 text-amber-700" },
  published: { label: "Live",        className: "bg-green-100 text-green-700" },
  skipped:   { label: "Skipped",     className: "bg-gray-100 text-gray-500" },
  manual_review_required: { label: "Needs Review", className: "bg-red-100 text-red-600" },
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
    <span
      className={`inline-block text-xs font-bold px-2 py-0.5 rounded-full tabular-nums ${colour}`}
      title={title}
    >
      {total}/100
    </span>
  );
}

async function getArticles() {
  const db = getDb();

  const { data: articles } = await db
    .from("articles")
    .select("id, title, primary_keyword, status, published_at, created_at, url, generation_scores_jsonb")
    .order("created_at", { ascending: false });

  if (!articles || articles.length === 0) return [];

  const { data: latestAssessments } = await db
    .from("assessments")
    .select("article_id, serp_positions_jsonb, ai_citations_jsonb, week_of")
    .in("article_id", articles.map((a) => a.id))
    .order("week_of", { ascending: false });

  const latestMap = new Map<string, { serp: SerpData; citations: CitationData }>();
  for (const a of latestAssessments ?? []) {
    if (!a.article_id || latestMap.has(a.article_id)) continue;
    latestMap.set(a.article_id, {
      serp: (a.serp_positions_jsonb as SerpData) ?? {},
      citations: (a.ai_citations_jsonb as CitationData) ?? {},
    });
  }

  return articles
    .map((article) => {
      const assessment = latestMap.get(article.id);
      const citedCount = assessment
        ? [assessment.citations.perplexity, assessment.citations.openai, assessment.citations.gemini].filter(
            (c) => c?.cited
          ).length
        : null;

      return {
        ...article,
        position: assessment?.serp?.position ?? null,
        citedCount,
        scores: (article.generation_scores_jsonb as GenerationScores | null),
      };
    })
    .filter((article) => article.scores?.total != null);
}

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export default async function ArticlesPage() {
  const articles = await getArticles();

  const liveCount = articles.filter((a) => a.status === "published").length;
  const draftCount = articles.filter((a) => a.status === "draft").length;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Articles</h1>
        <div className="flex gap-4 text-sm text-gray-500">
          <span>{articles.length} total</span>
          <span className="text-green-600 font-medium">{liveCount} live</span>
          <span className="text-amber-600 font-medium">{draftCount} to review</span>
        </div>
      </div>

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
            {articles.length === 0 && (
              <tr>
                <td colSpan={8} className="px-5 py-10 text-center text-gray-400">
                  No articles yet.
                </td>
              </tr>
            )}
            {articles.map((article) => (
              <tr key={article.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-5 py-3">
                  <Link href={`/articles/${article.id}`} className="font-medium text-indigo-600 hover:underline leading-tight">
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
