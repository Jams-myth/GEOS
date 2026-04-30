export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { verifyApprovalToken } from "../../../../lib/notify/approval";
import { getDb } from "../../../../lib/db/client";
import { inngest } from "../../../../inngest/client";

function htmlPage(title: string, message: string, isError = false): NextResponse {
  const color = isError ? "#dc3545" : "#28a745";
  const icon = isError ? "✗" : "✓";
  return new NextResponse(
    `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title}</title>
  <style>
    body { font-family: Arial, sans-serif; display: flex; justify-content: center; align-items: center;
           min-height: 100vh; margin: 0; background: #f5f5f5; }
    .card { background: #fff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,.1);
            padding: 48px; max-width: 480px; text-align: center; }
    .icon { font-size: 64px; margin-bottom: 16px; color: ${color}; }
    h1 { color: #111; margin: 0 0 12px; font-size: 24px; }
    p { color: #555; line-height: 1.6; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">${icon}</div>
    <h1>${title}</h1>
    <p>${message}</p>
  </div>
</body>
</html>`,
    {
      status: isError ? 400 : 200,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    }
  );
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
): Promise<NextResponse> {
  const { token } = await params;

  // ── Verify HMAC signature and expiry ──────────────────────────────────────
  const claims = verifyApprovalToken(token);
  if (!claims) {
    return htmlPage(
      "Link Expired or Invalid",
      "This approval link is invalid or has expired. Links are valid for 48 hours. Please use the dashboard to review the improvement.",
      true
    );
  }

  const { improvementId, action } = claims;
  const db = getDb();

  // ── Single-use: check consumed_approval_tokens ────────────────────────────
  const { data: consumed } = await db
    .from("consumed_approval_tokens")
    .select("token")
    .eq("token", token)
    .single();

  if (consumed) {
    return htmlPage(
      "Link Already Used",
      "This approval link has already been used. Check the dashboard to see the current status of this improvement.",
      true
    );
  }

  // ── Validate improvement is still pending ─────────────────────────────────
  const { data: improvement, error } = await db
    .from("improvements")
    .select("id, status")
    .eq("id", improvementId)
    .single();

  if (error || !improvement) {
    return htmlPage("Not Found", "This improvement proposal could not be found.", true);
  }

  if (improvement.status !== "pending_approval") {
    return htmlPage(
      "Already Processed",
      `This proposal has already been ${improvement.status}. No further action required.`,
      false
    );
  }

  // ── Mark token as consumed (single-use enforcement) ───────────────────────
  await db.from("consumed_approval_tokens").insert({ token });

  // ── Emit the decision event ───────────────────────────────────────────────
  await inngest.send({
    name: "improvement.decided",
    data: {
      improvementId,
      action: action === "approve" ? "approve" : "reject",
      decidedBy: "email",
      channel: "email",
    },
  });

  const actionLabel = action === "approve" ? "Approved" : "Rejected";
  const actionMessage =
    action === "approve"
      ? "The improvement has been approved and will be applied to the live article shortly."
      : "The improvement has been rejected and will not be applied.";

  return htmlPage(actionLabel, actionMessage);
}
