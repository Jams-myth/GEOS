import { Resend } from "resend";
import { withRetry } from "../util/retry";

const FROM_ADDRESS = "pipeline@noreply.evernu.co.uk";

function getResend(): Resend {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error(
      "RESEND_API_KEY is not set. Add it to your .env.local before sending emails."
    );
  }
  return new Resend(apiKey);
}

export async function sendArticlePublishedEmail(params: {
  to: string;
  articleTitle: string;
  articleUrl: string;
  scores: Record<string, number>;
  siteId: string;
}): Promise<void> {
  const scoreRows = Object.entries(params.scores)
    .map(
      ([k, v]) =>
        `<tr><td style="padding:4px 8px;border:1px solid #e0e0e0;">${k.replace(/_/g, " ")}</td><td style="padding:4px 8px;border:1px solid #e0e0e0;text-align:center;">${v}/10</td></tr>`
    )
    .join("");

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>Article Published</title></head>
<body style="font-family:sans-serif;color:#1a1a1a;max-width:600px;margin:0 auto;padding:24px;">
  <h1 style="color:#16a34a;">Article Published</h1>
  <p style="font-size:16px;"><strong>${params.articleTitle}</strong></p>
  <p><a href="${params.articleUrl}" style="color:#2563eb;">${params.articleUrl}</a></p>
  <h2 style="font-size:14px;margin-top:24px;">Generation Scores</h2>
  <table style="border-collapse:collapse;width:100%;font-size:13px;">
    <thead>
      <tr>
        <th style="padding:4px 8px;border:1px solid #e0e0e0;text-align:left;">Dimension</th>
        <th style="padding:4px 8px;border:1px solid #e0e0e0;text-align:center;">Score</th>
      </tr>
    </thead>
    <tbody>${scoreRows}</tbody>
  </table>
  <p style="margin-top:24px;font-size:12px;color:#6b7280;">Site ID: ${params.siteId}</p>
</body>
</html>`;

  return withRetry(async () => {
    const resend = getResend();
    const { error } = await resend.emails.send({
      from: FROM_ADDRESS,
      to: params.to,
      subject: `Published: ${params.articleTitle}`,
      html,
    });

    if (error) {
      throw new Error(`Failed to send article published email: ${error.message}`);
    }
  });
}

export async function sendManualReviewEmail(params: {
  to: string;
  headline: string;
  articleId: string;
  revisionNotes: string[];
  reason: string;
}): Promise<void> {
  const noteItems = params.revisionNotes
    .map((n, i) => `<li style="margin-bottom:8px;">${i + 1}. ${n}</li>`)
    .join("");

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>Manual Review Required</title></head>
<body style="font-family:sans-serif;color:#1a1a1a;max-width:600px;margin:0 auto;padding:24px;">
  <h1 style="color:#dc2626;">Manual Review Required</h1>
  <p style="font-size:16px;"><strong>${params.headline}</strong></p>
  <p><strong>Reason:</strong> ${params.reason}</p>
  <h2 style="font-size:14px;margin-top:24px;">Revision Notes</h2>
  <ul style="font-size:13px;padding-left:16px;">
    ${noteItems || "<li>No specific revision notes provided.</li>"}
  </ul>
  <p style="margin-top:24px;font-size:12px;color:#6b7280;">Article ID: ${params.articleId}</p>
</body>
</html>`;

  return withRetry(async () => {
    const resend = getResend();
    const { error } = await resend.emails.send({
      from: FROM_ADDRESS,
      to: params.to,
      subject: `Manual Review Required: ${params.headline}`,
      html,
    });

    if (error) {
      throw new Error(`Failed to send manual review email: ${error.message}`);
    }
  });
}
