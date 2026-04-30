"use client";

import { useState } from "react";
import ReactDiffViewer from "react-diff-viewer-continued";
import CodeEditor from "@uiw/react-textarea-code-editor";

interface Props {
  improvementId: string;
  articleId: string;
  status: string;
  currentBody: string;
  proposedBody: string;
  proposedChangesJson: string;
}

type ActionType = "approve" | "approve_with_edits" | "reject";

export default function ImprovementActions({
  improvementId,
  articleId,
  status,
  currentBody,
  proposedBody,
  proposedChangesJson,
}: Props) {
  const [editMode, setEditMode] = useState(false);
  const [editedJson, setEditedJson] = useState(proposedChangesJson);
  const [rejectReason, setRejectReason] = useState("");
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [submitting, setSubmitting] = useState<ActionType | null>(null);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  async function decide(action: ActionType, opts: { editedPatch?: unknown; rejectionReason?: string } = {}) {
    setSubmitting(action);
    try {
      const res = await fetch("/api/improvements/decide", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          improvementId,
          action,
          decidedBy: "dashboard",
          channel: "dashboard",
          ...opts,
        }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (res.ok) {
        setResult({ ok: true, message: `Decision recorded: ${action}. The pipeline will process this shortly.` });
      } else {
        setResult({ ok: false, message: data.error ?? "Failed to record decision" });
      }
    } catch {
      setResult({ ok: false, message: "Network error — please try again" });
    } finally {
      setSubmitting(null);
    }
  }

  function handleApprove() {
    void decide("approve");
  }

  function handleApproveWithEdits() {
    let parsed: unknown;
    try {
      parsed = JSON.parse(editedJson);
    } catch {
      setResult({ ok: false, message: "Invalid JSON in patch editor — fix before approving" });
      return;
    }
    void decide("approve_with_edits", { editedPatch: parsed });
  }

  function handleReject() {
    if (!rejectReason.trim()) {
      setResult({ ok: false, message: "Please enter a rejection reason" });
      return;
    }
    void decide("reject", { rejectionReason: rejectReason });
  }

  if (result) {
    return (
      <div
        className={`rounded-lg px-5 py-4 text-sm font-medium ${
          result.ok ? "bg-green-50 text-green-800 border border-green-200" : "bg-red-50 text-red-800 border border-red-200"
        }`}
      >
        {result.message}
      </div>
    );
  }

  const isPending = status === "pending_approval";

  return (
    <div className="space-y-6">
      {/* Diff viewer */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-800">Diff — Current vs Proposed</h2>
          {isPending && (
            <button
              onClick={() => setEditMode(!editMode)}
              className="text-xs text-indigo-600 hover:underline"
            >
              {editMode ? "← Back to diff" : "Edit patch JSON →"}
            </button>
          )}
        </div>

        {editMode ? (
          <div className="p-4">
            <p className="text-xs text-gray-500 mb-2">
              Edit the patch JSON below. The pipeline will apply this edited version if you approve with edits.
            </p>
            <CodeEditor
              value={editedJson}
              language="json"
              onChange={(e) => setEditedJson(e.target.value)}
              style={{ fontSize: 13, fontFamily: "monospace", minHeight: 320 }}
              className="rounded border border-gray-200"
            />
          </div>
        ) : (
          <div className="overflow-auto max-h-[60vh] text-xs">
            <ReactDiffViewer
              oldValue={currentBody}
              newValue={proposedBody}
              splitView={false}
              useDarkTheme={false}
              hideLineNumbers={false}
            />
          </div>
        )}
      </div>

      {/* Action buttons */}
      {isPending && (
        <div className="flex flex-wrap gap-3">
          {!editMode ? (
            <>
              <button
                onClick={handleApprove}
                disabled={submitting !== null}
                className="px-5 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
              >
                {submitting === "approve" ? "Approving…" : "Approve"}
              </button>

              <button
                onClick={() => setEditMode(true)}
                disabled={submitting !== null}
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
              >
                Approve with Edits
              </button>

              <button
                onClick={() => setShowRejectForm(!showRejectForm)}
                disabled={submitting !== null}
                className="px-5 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
              >
                Reject
              </button>
            </>
          ) : (
            <button
              onClick={handleApproveWithEdits}
              disabled={submitting !== null}
              className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
            >
              {submitting === "approve_with_edits" ? "Approving…" : "Approve with Edited Patch"}
            </button>
          )}
        </div>
      )}

      {/* Reject form */}
      {showRejectForm && isPending && (
        <div className="bg-white rounded-xl border border-red-200 p-5">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Rejection reason <span className="text-red-500">*</span>
          </label>
          <textarea
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            rows={3}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
            placeholder="Explain why this improvement should not be applied…"
          />
          <div className="flex gap-3 mt-3">
            <button
              onClick={handleReject}
              disabled={submitting !== null}
              className="px-5 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
            >
              {submitting === "reject" ? "Rejecting…" : "Confirm Reject"}
            </button>
            <button
              onClick={() => setShowRejectForm(false)}
              className="px-5 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium rounded-lg transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
