import { getDb } from "../../../lib/db/client";
import Link from "next/link";

type ImprovementStatus = "pending_approval" | "approved" | "applied" | "rejected" | "expired" | "rolled_back";

const STATUS_STYLES: Record<string, string> = {
  pending_approval: "bg-yellow-100 text-yellow-700",
  approved: "bg-blue-100 text-blue-700",
  applied: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
  expired: "bg-gray-100 text-gray-500",
  rolled_back: "bg-orange-100 text-orange-700",
};

async function getImprovements(statusFilter?: string) {
  const db = getDb();

  let query = db
    .from("improvements")
    .select(
      "id, article_id, status, expected_impact, estimated_position_gain, created_at, approved_at, applied_at, approval_channel"
    )
    .order("created_at", { ascending: false })
    .limit(100);

  if (statusFilter && statusFilter !== "all") {
    query = query.eq("status", statusFilter);
  }

  const { data: improvements } = await query;

  const { data: articles } = await db
    .from("articles")
    .select("id, title, primary_keyword");

  const articleMap = new Map((articles ?? []).map((a) => [a.id, a]));

  return (improvements ?? []).map((imp) => ({
    ...imp,
    article: imp.article_id ? (articleMap.get(imp.article_id) ?? null) : null,
  }));
}

export default async function ImprovementsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const params = await searchParams;
  const statusFilter = params.status ?? "all";
  const improvements = await getImprovements(statusFilter);

  const statuses = ["all", "pending_approval", "applied", "rejected", "expired"];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Improvements</h1>
        <span className="text-sm text-gray-500">{improvements.length} entries</span>
      </div>

      {/* Status filter tabs */}
      <div className="flex gap-2 mb-6">
        {statuses.map((s) => (
          <Link
            key={s}
            href={`/improvements?status=${s}`}
            className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
              statusFilter === s
                ? "bg-indigo-600 text-white border-indigo-600"
                : "bg-white text-gray-600 border-gray-200 hover:border-indigo-300"
            }`}
          >
            {s === "all" ? "All" : s.replace("_", " ")}
          </Link>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50 text-gray-600">
              <th className="text-left font-medium px-5 py-3">Article</th>
              <th className="text-left font-medium px-5 py-3">Expected Impact</th>
              <th className="text-right font-medium px-5 py-3 w-28">Pos. Gain</th>
              <th className="text-left font-medium px-5 py-3 w-32">Status</th>
              <th className="text-left font-medium px-5 py-3 w-28">Channel</th>
              <th className="text-left font-medium px-5 py-3 w-32">Created</th>
              <th className="text-left font-medium px-5 py-3 w-16"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {improvements.length === 0 && (
              <tr>
                <td colSpan={7} className="px-5 py-10 text-center text-gray-400">
                  No improvements found.
                </td>
              </tr>
            )}
            {improvements.map((imp) => (
              <tr key={imp.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-5 py-3">
                  {imp.article ? (
                    <div>
                      <div className="font-medium text-gray-900 text-xs">{imp.article.title}</div>
                      <div className="text-gray-400 text-xs">{imp.article.primary_keyword}</div>
                    </div>
                  ) : (
                    <span className="text-gray-400 text-xs">{imp.article_id}</span>
                  )}
                </td>
                <td className="px-5 py-3 text-gray-600 text-xs max-w-xs">
                  {imp.expected_impact?.slice(0, 100) ?? "—"}
                </td>
                <td className="px-5 py-3 text-right text-gray-700 tabular-nums">
                  {imp.estimated_position_gain != null ? `+${imp.estimated_position_gain}` : "—"}
                </td>
                <td className="px-5 py-3">
                  <span
                    className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium ${
                      STATUS_STYLES[imp.status] ?? "bg-gray-100 text-gray-600"
                    }`}
                  >
                    {imp.status.replace("_", " ")}
                  </span>
                </td>
                <td className="px-5 py-3 text-gray-500 text-xs capitalize">
                  {imp.approval_channel ?? "—"}
                </td>
                <td className="px-5 py-3 text-gray-400 text-xs">
                  {imp.created_at
                    ? new Date(imp.created_at).toLocaleDateString("en-GB", {
                        day: "numeric",
                        month: "short",
                      })
                    : "—"}
                </td>
                <td className="px-5 py-3">
                  <Link
                    href={`/improvements/${imp.id}`}
                    className="text-indigo-600 hover:underline text-xs"
                  >
                    View
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
