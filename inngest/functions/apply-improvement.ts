import { inngest } from "../client";
import { getDb } from "../../lib/db/client";
import { generateImprovementProposal } from "../../lib/improvement/proposer";
import { reviewPatchWithGemini } from "../../lib/improvement/reviewer";
import { sendApprovalRequest } from "../../lib/notify/approval";
import { applyPatchToMarkdown, extractMetaUpdates } from "../../lib/patch/apply";
import { revalidateLiveSite } from "../../lib/cms/nextjs-vercel";
import { notifyDiscord } from "../../lib/notify/discord";
import type { ProposedChanges } from "../../lib/improvement/types";
import type { Json } from "../../lib/db/types";

export const applyImprovement = inngest.createFunction(
  {
    id: "apply-improvement",
    triggers: [{ event: "assessment.flagged" }],
    retries: 2,
    concurrency: { limit: 3 },
  },
  async ({ event, step }) => {
    const { articleId, assessmentId } = event.data;

    // ── Step 1: Generate improvement proposal via improvement-planner.md ─────
    const proposal = await step.run(
      `generate-proposal-${articleId}`,
      async (): Promise<ProposedChanges> => {
        return generateImprovementProposal(articleId, assessmentId);
      }
    );

    // ── Step 2: Gemini sanity-check before sending to human ──────────────────
    const geminiReview = await step.run(
      `gemini-review-${articleId}`,
      async () => reviewPatchWithGemini(proposal)
    );

    if (!geminiReview.approved) {
      // Gemini hard-rejected the patch — log and stop; don't bother the reviewer
      await step.run(`log-gemini-rejection-${articleId}`, async () => {
        await notifyDiscord({
          kind: "manual_review",
          articleId,
          headline: `Improvement proposal failed Gemini review`,
          draftExcerpt: geminiReview.issues.join("; "),
          revisionNotes: geminiReview.issues,
        });
      });
      return {
        status: "gemini_rejected",
        articleId,
        issues: geminiReview.issues,
      };
    }

    // ── Step 3: Persist improvement proposal in DB ───────────────────────────
    const improvementId = await step.run(
      `persist-improvement-${articleId}`,
      async (): Promise<string> => {
        const db = getDb();
        const { data, error } = await db
          .from("improvements")
          .insert({
            article_id: articleId,
            assessment_id: assessmentId,
            // Cast is safe: ProposedChanges satisfies the Json constraint
            proposed_changes_jsonb: proposal as unknown as Json,
            gemini_review_jsonb: geminiReview as unknown as Json,
            expected_impact: proposal.expected_impact,
            estimated_position_gain: proposal.estimated_position_gain,
            article_version_at_proposal: proposal.article_version_at_proposal,
            status: "pending_approval",
          })
          .select("id")
          .single();

        if (error || !data) throw new Error(`Failed to persist improvement: ${error?.message}`);
        return data.id;
      }
    );

    // Emit improvement.proposed so other consumers can react (notifications, dashboards)
    await step.sendEvent(`emit-improvement-proposed-${improvementId}`, {
      name: "improvement.proposed",
      data: { improvementId, articleId },
    });

    // ── Step 4: Send Discord + email approval request ─────────────────────────
    await step.run(`send-approval-request-${improvementId}`, async () => {
      const db = getDb();
      const { data: improvement, error } = await db
        .from("improvements")
        .select("*")
        .eq("id", improvementId)
        .single();

      if (error || !improvement) throw new Error(`Improvement ${improvementId} not found`);
      await sendApprovalRequest(improvement);
    });

    // ── Step 5: Wait up to 7 days for a human decision ───────────────────────
    const decision = await step.waitForEvent(`wait-for-decision-${improvementId}`, {
      event: "improvement.decided",
      timeout: "7d",
      if: `async.data.improvementId == '${improvementId}'`,
    });

    // ═══════════════════════════════════════════════════════════════════════
    // === EXPIRED === (no decision received within 7 days)
    // ═══════════════════════════════════════════════════════════════════════
    if (!decision) {
      await step.run(`mark-expired-${improvementId}`, async () => {
        const db = getDb();
        await db
          .from("improvements")
          .update({ status: "expired" })
          .eq("id", improvementId);
      });
      return { status: "expired", improvementId };
    }

    // ═══════════════════════════════════════════════════════════════════════
    // === REJECTED ===
    // ═══════════════════════════════════════════════════════════════════════
    if (decision.data.action === "reject") {
      await step.run(`mark-rejected-${improvementId}`, async () => {
        const db = getDb();
        await db
          .from("improvements")
          .update({
            status: "rejected",
            approved_by: decision.data.decidedBy,
            approved_at: new Date().toISOString(),
            approval_channel: decision.data.channel,
            rejection_reason: decision.data.rejectionReason ?? "Rejected by reviewer",
          })
          .eq("id", improvementId);
      });
      return { status: "rejected", improvementId };
    }

    // ═══════════════════════════════════════════════════════════════════════
    // === APPLY PATH === (approve or approve_with_edits)
    // All steps below are ONLY reached when a positive decision is received.
    // ═══════════════════════════════════════════════════════════════════════

    // ── Race protection: re-fetch articles.version before touching the article ─
    const currentVersion = await step.run(
      `check-version-${improvementId}`,
      async (): Promise<number | null> => {
        const db = getDb();
        const { data } = await db
          .from("articles")
          .select("version")
          .eq("id", articleId)
          .single();
        return data?.version ?? null;
      }
    );

    if (currentVersion !== proposal.article_version_at_proposal) {
      // Article has been modified since the proposal was generated — stale proposal
      await step.run(`mark-stale-${improvementId}`, async () => {
        const db = getDb();
        await db
          .from("improvements")
          .update({
            status: "rejected",
            rejection_reason: "Article changed since proposal — re-propose",
          })
          .eq("id", improvementId);
      });
      return { status: "stale", improvementId };
    }

    // ── Load current article body and apply patch ─────────────────────────────
    const { newBodyMd, siteId } = await step.run(
      `apply-patch-${improvementId}`,
      async (): Promise<{ newBodyMd: string; siteId: string }> => {
        const db = getDb();
        const { data: article, error } = await db
          .from("articles")
          .select("body_md, site_id")
          .eq("id", articleId)
          .single();

        if (error || !article) throw new Error(`Failed to load article for patching: ${error?.message}`);

        // If approve_with_edits, the reviewer may have supplied a modified patch
        const activePatch: ProposedChanges =
          decision.data.action === "approve_with_edits" && decision.data.editedPatch
            ? (decision.data.editedPatch as unknown as ProposedChanges)
            : proposal;

        const newBody = applyPatchToMarkdown(article.body_md ?? "", activePatch);
        return { newBodyMd: newBody, siteId: article.site_id ?? "" };
      }
    );

    // ── Persist revision snapshot for rollback ────────────────────────────────
    const rollbackRevisionId = await step.run(
      `persist-revision-${improvementId}`,
      async (): Promise<string> => {
        const db = getDb();
        // Snapshot the article at current version before writing the new body
        const { data: currentArticle } = await db
          .from("articles")
          .select("body_md, version")
          .eq("id", articleId)
          .single();

        const { data: revision, error } = await db
          .from("revisions")
          .insert({
            article_id: articleId,
            version: currentArticle?.version ?? 1,
            body_md: currentArticle?.body_md ?? "",
            source_type: "improvement",
            editor_notes: `Pre-improvement snapshot. Improvement ID: ${improvementId}`,
          })
          .select("id")
          .single();

        if (error || !revision) throw new Error(`Failed to persist revision: ${error?.message}`);
        return revision.id;
      }
    );

    // ── Write new body_md + increment version + apply any meta updates ────────
    const newVersion = await step.run(
      `update-article-${improvementId}`,
      async (): Promise<number> => {
        const db = getDb();

        // Determine active patch for meta updates
        const activePatch: ProposedChanges =
          decision.data.action === "approve_with_edits" && decision.data.editedPatch
            ? (decision.data.editedPatch as unknown as ProposedChanges)
            : proposal;

        const metaUpdates = extractMetaUpdates(activePatch);
        const nextVersion = (proposal.article_version_at_proposal ?? 1) + 1;

        await db
          .from("articles")
          .update({
            body_md: newBodyMd,
            version: nextVersion,
            updated_at: new Date().toISOString(),
            ...(metaUpdates?.meta_title ? { meta_title: metaUpdates.meta_title } : {}),
            ...(metaUpdates?.meta_description
              ? { meta_description: metaUpdates.meta_description }
              : {}),
            ...(metaUpdates?.schema_type ? { schema_type: metaUpdates.schema_type } : {}),
          })
          .eq("id", articleId);

        return nextVersion;
      }
    );

    // ── revalidate-vercel — ONLY in the apply branch ──────────────────────────
    // This step must NOT appear in the expired, rejected, stale, or error paths above.
    await step.run(`revalidate-vercel-${improvementId}`, async () => {
      const db = getDb();
      const { data: article } = await db
        .from("articles")
        .select("url")
        .eq("id", articleId)
        .single();

      if (article?.url) {
        const path = new URL(article.url).pathname;
        await revalidateLiveSite(siteId, [path]);
      }
    });

    // ── Mark improvement as applied ───────────────────────────────────────────
    await step.run(`mark-applied-${improvementId}`, async () => {
      const db = getDb();
      await db
        .from("improvements")
        .update({
          status: "applied",
          approved_by: decision.data.decidedBy,
          approved_at: new Date().toISOString(),
          approval_channel: decision.data.channel,
          applied_at: new Date().toISOString(),
          rollback_revision_id: rollbackRevisionId,
        })
        .eq("id", improvementId);
    });

    return {
      status: "applied",
      improvementId,
      articleId,
      newVersion,
      rollbackRevisionId,
    };
  }
);
