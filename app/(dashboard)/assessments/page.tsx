import { getDb } from "../../../lib/db/client";
import AssessmentCharts from "./AssessmentCharts";

interface GscData {
  clicks?: number;
  impressions?: number;
  ctr?: number;
  position?: number;
}

interface SerpData {
  position?: number | null;
}

interface Recommendation {
  priority?: string;
  issue?: string;
  action?: string;
}

interface AssessmentRow {
  id: string;
  article_id: string | null;
  week_of: string;
  gsc_data_jsonb: GscData | null;
  serp_positions_jsonb: SerpData | null;
  recommendations_jsonb: Recommendation[] | null;
}

async function getAssessments() {
  const db = getDb();

  const { data: assessments } = await db
    .from("assessments")
    .select(
      "id, article_id, week_of, gsc_data_jsonb, serp_positions_jsonb, recommendations_jsonb"
    )
    .order("week_of", { ascending: false })
    .limit(200);

  const { data: articles } = await db
    .from("articles")
    .select("id, title, primary_keyword");

  const articleMap = new Map((articles ?? []).map((a) => [a.id, a]));

  // Build chart-friendly per-article weekly series (last 8 weeks)
  const byArticle = new Map<
    string,
    { title: string; weeks: { week: string; position: number | null; clicks: number }[] }
  >();

  for (const assessment of (assessments as unknown as AssessmentRow[]) ?? []) {
    const articleId = assessment.article_id ?? "";
    const article = articleMap.get(articleId);
    if (!article) continue;

    if (!byArticle.has(articleId)) {
      byArticle.set(articleId, { title: article.title, weeks: [] });
    }

    const gsc = assessment.gsc_data_jsonb ?? {};
    const serp = assessment.serp_positions_jsonb ?? {};

    byArticle.get(articleId)!.weeks.push({
      week: assessment.week_of,
      position: serp.position ?? null,
      clicks: gsc.clicks ?? 0,
    });
  }

  // Sort weeks ascending for charts
  for (const series of byArticle.values()) {
    series.weeks.sort((a, b) => a.week.localeCompare(b.week));
    series.weeks = series.weeks.slice(-8);
  }

  return {
    chartData: Array.from(byArticle.entries()).map(([id, data]) => ({ id, ...data })),
    assessments: (assessments as unknown as AssessmentRow[]) ?? [],
  };
}

export default async function AssessmentsPage() {
  const { chartData, assessments } = await getAssessments();

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Assessments</h1>
        <span className="text-sm text-gray-500">{assessments.length} entries</span>
      </div>

      {/* Delta charts — client component */}
      <AssessmentCharts data={chartData} />

      {/* Recent assessments table */}
      <div className="mt-8 bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-800 text-sm">Recent Assessments</h2>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50 text-gray-600">
              <th className="text-left font-medium px-5 py-3">Week</th>
              <th className="text-left font-medium px-5 py-3">Article</th>
              <th className="text-right font-medium px-5 py-3 w-28">SERP Position</th>
              <th className="text-right font-medium px-5 py-3 w-24">Clicks</th>
              <th className="text-right font-medium px-5 py-3 w-28">Critical Issues</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {assessments.slice(0, 50).map((a) => {
              const gsc = (a.gsc_data_jsonb as GscData | null) ?? {};
              const serp = (a.serp_positions_jsonb as SerpData | null) ?? {};
              const recs = (a.recommendations_jsonb as Recommendation[] | null) ?? [];
              const criticalCount = recs.filter((r) => r.priority === "critical").length;
              return (
                <tr key={a.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-3 text-gray-500 tabular-nums">{a.week_of}</td>
                  <td className="px-5 py-3 text-gray-700">{a.article_id ?? "—"}</td>
                  <td className="px-5 py-3 text-right tabular-nums">
                    {serp.position != null ? Number(serp.position).toFixed(1) : "—"}
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums">{gsc.clicks ?? "—"}</td>
                  <td className="px-5 py-3 text-right">
                    {criticalCount > 0 ? (
                      <span className="text-red-600 font-medium">{criticalCount}</span>
                    ) : (
                      <span className="text-gray-400">0</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
