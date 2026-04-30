import { notFound } from "next/navigation";
import { getDb } from "../../../../lib/db/client";
import { applyPatchToMarkdown } from "../../../../lib/patch/apply";
import type { ProposedChanges } from "../../../../lib/improvement/types";
import ImprovementActions from "./ImprovementActions";

async function getImprovementDetail(id: string) {
  const db = getDb();

  const { data: improvement, error } = await db
    .from("improvements")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !improvement) return null;

  const { data: article } = await db
    .from("articles")
    .select("id, title, primary_keyword, body_md, url, version")
    .eq("id", improvement.article_id ?? "")
    .single();

  return { improvement, article };
}

const STATUS_STYLES: Record<string, string> = {
  pending_approval: "bg-yellow-100 text-yellow-700",
  applied: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
  expired: "bg-gray-100 text-gray-500",
  rolled_back: "bg-orange-100 text-orange-700",
};

export default async function ImprovementDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await getImprovementDetail(id);

  if (!data) notFound();

  const { improvement, article } = data;

  // Build proposed body by applying the patch to current body
  const currentBody = article?.body_md ?? "";
  const proposedChanges = improvement.proposed_changes_jsonb as unknown as ProposedChanges;
  const proposedBody = applyPatchToMarkdown(currentBody, proposedChanges);

  const changes = proposedChanges?.changes ?? [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {article?.title ?? improvement.article_id}
          </h1>
          <p className="text-gray-500 text-sm mt-1">{article?.primary_keyword}</p>
        </div>
        <span
          className={`inline-block text-xs px-3 py-1 rounded-full font-medium ${
            STATUS_STYLES[improvement.status] ?? "bg-gray-100 text-gray-600"
          }`}
        >
          {improvement.status.replace("_", " ")}
        </span>
      </div>

      {/* Metadata */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="text-xs text-gray-500 mb-1">Expected Impact</div>
          <div className="text-sm text-gray-800 font-medium">
            {improvement.expected_impact ?? "—"}
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="text-xs text-gray-500 mb-1">Est. Position Gain</div>
          <div className="text-2xl font-bold text-indigo-600">
            +{improvement.estimated_position_gain ?? 0}
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="text-xs text-gray-500 mb-1">Changes</div>
          <div className="text-2xl font-bold text-gray-800">{changes.length}</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="text-xs text-gray-500 mb-1">Article Version</div>
          <div className="text-2xl font-bold text-gray-800">
            v{improvement.article_version_at_proposal}
          </div>
        </div>
      </div>

      {/* Changes summary */}
      {changes.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-sm font-semibold text-gray-800 mb-4">Proposed Changes</h2>
          <div className="space-y-3">
            {changes.map((change, i) => (
              <div key={i} className="flex items-start gap-3 text-sm">
                <span
                  className={`mt-0.5 flex-shrink-0 text-xs px-2 py-0.5 rounded-full font-medium ${
                    change.priority === "critical"
                      ? "bg-red-100 text-red-700"
                      : change.priority === "recommended"
                      ? "bg-yellow-100 text-yellow-700"
                      : "bg-gray-100 text-gray-600"
                  }`}
                >
                  {change.priority}
                </span>
                <div>
                  <span className="font-medium text-gray-700 text-xs">
                    {change.type} → {change.target}
                  </span>
                  <p className="text-gray-500 text-xs mt-0.5">{change.rationale}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Diff viewer + action buttons — client component */}
      <ImprovementActions
        improvementId={improvement.id}
        articleId={improvement.article_id ?? ""}
        status={improvement.status}
        currentBody={currentBody}
        proposedBody={proposedBody}
        proposedChangesJson={JSON.stringify(proposedChanges, null, 2)}
      />

      {/* Rejection reason (if rejected) */}
      {improvement.rejection_reason && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-5 py-4 text-sm text-red-800">
          <strong>Rejection reason:</strong> {improvement.rejection_reason}
        </div>
      )}
    </div>
  );
}
