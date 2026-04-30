import crypto from "node:crypto";
import { getDb } from "../db/client";
import { Resend } from "resend";
import type { Improvement } from "../db/types";

const DISCORD_API = "https://discord.com/api/v10";
const FORTY_EIGHT_HOURS_MS = 48 * 60 * 60 * 1000;

// ─── Token helpers ────────────────────────────────────────────────────────────

function toBase64Url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

function fromBase64Url(str: string): Buffer {
  const padded = str.replace(/-/g, "+").replace(/_/g, "/");
  const padding = (4 - (padded.length % 4)) % 4;
  return Buffer.from(padded + "=".repeat(padding), "base64");
}

/**
 * Generate a single base64url token that encodes the payload and its HMAC.
 * Token = base64url(JSON({ improvementId, action, expiresAt, sig }))
 * sig  = HMAC-SHA256(APPROVAL_TOKEN_HMAC_SECRET, `${improvementId}:${action}:${expiresAt}`)
 */
export function generateApprovalToken(
  improvementId: string,
  action: "approve" | "reject",
  expiresAt: number
): string {
  const secret = process.env.APPROVAL_TOKEN_HMAC_SECRET;
  if (!secret) throw new Error("APPROVAL_TOKEN_HMAC_SECRET is not set");

  const sig = crypto
    .createHmac("sha256", secret)
    .update(`${improvementId}:${action}:${expiresAt}`)
    .digest("hex");

  const payload = JSON.stringify({ improvementId, action, expiresAt, sig });
  return toBase64Url(Buffer.from(payload, "utf8"));
}

/**
 * Verify a token and return its claims, or null if invalid / expired.
 */
export function verifyApprovalToken(token: string): {
  improvementId: string;
  action: "approve" | "reject";
  expiresAt: number;
} | null {
  try {
    const secret = process.env.APPROVAL_TOKEN_HMAC_SECRET;
    if (!secret) return null;

    const payload = JSON.parse(fromBase64Url(token).toString("utf8"));
    const { improvementId, action, expiresAt, sig } = payload as Record<string, unknown>;

    if (
      typeof improvementId !== "string" ||
      typeof action !== "string" ||
      typeof expiresAt !== "number" ||
      typeof sig !== "string"
    ) {
      return null;
    }

    if (action !== "approve" && action !== "reject") return null;
    if (Date.now() > expiresAt) return null;

    const expectedSig = crypto
      .createHmac("sha256", secret)
      .update(`${improvementId}:${action}:${expiresAt}`)
      .digest("hex");

    const expectedBuf = Buffer.from(expectedSig, "hex");
    const actualBuf = Buffer.from(sig, "hex");
    if (expectedBuf.length !== actualBuf.length) return null;
    if (!crypto.timingSafeEqual(expectedBuf, actualBuf)) return null;

    return { improvementId, action, expiresAt };
  } catch {
    return null;
  }
}

// ─── Discord approval message ─────────────────────────────────────────────────

async function sendDiscordApproval(improvement: Improvement): Promise<void> {
  const botToken = process.env.DISCORD_BOT_TOKEN;
  const channelId = process.env.DISCORD_CHANNEL_ID;
  if (!botToken || !channelId) return;

  const db = getDb();
  const { data: article } = await db
    .from("articles")
    .select("title, url, primary_keyword")
    .eq("id", improvement.article_id!)
    .single();

  // proposed_changes_jsonb is written by this pipeline with the ProposedChanges shape
  const changes = (improvement.proposed_changes_jsonb as Record<string, unknown> & { changes?: Array<{ rationale?: string }> })?.changes ?? [];
  const topRationale = changes[0]?.rationale ?? "See proposal for details";

  const dashboardBase = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const diffUrl = `${dashboardBase}/improvements/${improvement.id}`;

  const body = JSON.stringify({
    embeds: [
      {
        title: `Improvement Proposal — ${article?.title ?? improvement.article_id}`,
        description: improvement.expected_impact ?? "No impact summary provided",
        color: 0x5865f2,
        url: diffUrl,
        fields: [
          { name: "Top Issue", value: topRationale.slice(0, 200), inline: false },
          {
            name: "Est. Position Gain",
            value: `+${improvement.estimated_position_gain ?? 0}`,
            inline: true,
          },
          { name: "Changes Proposed", value: String(changes.length), inline: true },
          { name: "Keyword", value: article?.primary_keyword ?? "—", inline: true },
        ],
      },
    ],
    components: [
      {
        type: 1,
        components: [
          {
            type: 2,
            style: 3, // SUCCESS (green)
            label: "Approve",
            custom_id: `approve:${improvement.id}`,
          },
          {
            type: 2,
            style: 1, // PRIMARY (blue)
            label: "Approve with Edits",
            custom_id: `approve_with_edits:${improvement.id}`,
          },
          {
            type: 2,
            style: 4, // DANGER (red)
            label: "Reject",
            custom_id: `reject:${improvement.id}`,
          },
        ],
      },
    ],
  });

  const res = await fetch(`${DISCORD_API}/channels/${channelId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bot ${botToken}`,
      "Content-Type": "application/json",
    },
    body,
  });

  if (!res.ok) {
    console.error("Discord approval message failed:", res.status, await res.text());
  }
}

// ─── Email magic-link ─────────────────────────────────────────────────────────

async function sendEmailApproval(improvement: Improvement): Promise<void> {
  const notificationEmail = process.env.NOTIFICATION_EMAIL;
  const resendKey = process.env.RESEND_API_KEY;
  if (!notificationEmail || !resendKey) return;

  const expiresAt = Date.now() + FORTY_EIGHT_HOURS_MS;
  const approveToken = generateApprovalToken(improvement.id, "approve", expiresAt);
  const rejectToken = generateApprovalToken(improvement.id, "reject", expiresAt);

  const dashboardBase = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const approveUrl = `${dashboardBase}/approve/${approveToken}?action=approve`;
  const rejectUrl = `${dashboardBase}/approve/${rejectToken}?action=reject`;
  const diffUrl = `${dashboardBase}/improvements/${improvement.id}`;

  const changes = (improvement.proposed_changes_jsonb as Record<string, unknown> & { changes?: Array<{ rationale?: string }> })?.changes ?? [];
  const topRationale = changes[0]?.rationale ?? "See full diff for details";

  const resend = new Resend(resendKey);
  await resend.emails.send({
    from: "pipeline@noreply.evernu.co.uk",
    to: notificationEmail,
    subject: `[Action Required] Improvement Proposal — ${improvement.expected_impact?.slice(0, 60) ?? improvement.id}`,
    html: `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><style>
body{font-family:Arial,sans-serif;font-size:14px;color:#333;max-width:600px;margin:0 auto;padding:20px}
h1{color:#111}
.issue{background:#f9f9f9;border-left:3px solid #5865f2;padding:12px;margin:16px 0;border-radius:0 4px 4px 0}
.btn{display:inline-block;padding:12px 24px;margin:8px 4px;border-radius:6px;text-decoration:none;font-weight:bold;color:#fff}
.approve{background:#28a745}.reject{background:#dc3545}.diff{background:#5865f2}
.warning{color:#888;font-size:12px;margin-top:24px;border-top:1px solid #eee;padding-top:12px}
</style></head>
<body>
<h1>Improvement Proposal Ready for Review</h1>
<p><strong>Expected impact:</strong> ${improvement.expected_impact ?? "—"}</p>
<p><strong>Estimated position gain:</strong> +${improvement.estimated_position_gain ?? 0}</p>
<div class="issue"><strong>Top issue:</strong> ${topRationale}</div>
<p>${changes.length} change(s) proposed.</p>
<p><a href="${diffUrl}" class="btn diff">View Full Diff</a></p>
<p>
  <a href="${approveUrl}" class="btn approve">Approve</a>
  <a href="${rejectUrl}" class="btn reject">Reject</a>
</p>
<p class="warning">
  These links expire in 48 hours and are single-use.<br>
  To approve with edits, use the <a href="${diffUrl}">dashboard</a>.
</p>
</body>
</html>`,
  });

  // Record the approve token in improvements for traceability
  await getDb()
    .from("improvements")
    .update({
      approval_token: approveToken,
      approval_expires_at: new Date(expiresAt).toISOString(),
    })
    .eq("id", improvement.id);
}

// ─── Main export ──────────────────────────────────────────────────────────────

/** Send Discord approval message + email magic-link in parallel. */
export async function sendApprovalRequest(improvement: Improvement): Promise<void> {
  await Promise.all([sendDiscordApproval(improvement), sendEmailApproval(improvement)]);
}
