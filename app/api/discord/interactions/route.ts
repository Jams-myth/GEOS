// Must run on Node runtime — tweetnacl (used by discord-interactions) requires Node crypto,
// not the Web Crypto subset available in the Edge runtime.
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import {
  verifyKey,
  InteractionType,
  InteractionResponseType,
} from "discord-interactions";
import { inngest } from "../../../../inngest/client";
import { getDb } from "../../../../lib/db/client";

// ─── Types ────────────────────────────────────────────────────────────────────

interface DiscordUser {
  id: string;
  username?: string;
}

interface DiscordInteraction {
  type: number;
  id: string;
  token: string;
  data?: {
    custom_id?: string;
    component_type?: number;
    components?: Array<{
      type: number;
      components?: Array<{ custom_id?: string; value?: string }>;
    }>;
  };
  member?: { user?: DiscordUser };
  user?: DiscordUser;
}

function getUserId(interaction: DiscordInteraction): string {
  return interaction.member?.user?.id ?? interaction.user?.id ?? "unknown";
}

// ─── Verification helper ──────────────────────────────────────────────────────

async function verifyRequest(
  rawBody: string,
  signature: string | null,
  timestamp: string | null,
  publicKey: string
): Promise<boolean> {
  if (!signature || !timestamp) return false;
  return verifyKey(rawBody, signature, timestamp, publicKey);
}

// ─── Response helpers ─────────────────────────────────────────────────────────

function pong(): NextResponse {
  return NextResponse.json({ type: InteractionResponseType.PONG });
}

function updateMessage(content: string): NextResponse {
  return NextResponse.json({
    type: InteractionResponseType.UPDATE_MESSAGE,
    data: { content, components: [] },
  });
}

function channelMessage(content: string): NextResponse {
  return NextResponse.json({
    type: 4, // CHANNEL_MESSAGE_WITH_SOURCE
    data: { content, flags: 64 }, // 64 = EPHEMERAL
  });
}

function openModal(customId: string, title: string, components: unknown[]): NextResponse {
  return NextResponse.json({
    type: InteractionResponseType.MODAL,
    data: { custom_id: customId, title, components },
  });
}

// ─── Component handlers ───────────────────────────────────────────────────────

async function handleButtonPress(
  interaction: DiscordInteraction
): Promise<NextResponse> {
  const customId = interaction.data?.custom_id ?? "";
  const colonIdx = customId.indexOf(":");
  if (colonIdx === -1) return channelMessage("Unknown button.");

  const action = customId.slice(0, colonIdx) as string;
  const improvementId = customId.slice(colonIdx + 1);
  const decidedBy = getUserId(interaction);

  // ── Topic candidate selection (from topic-discovery discord message) ──────
  if (action === "select_topic") {
    const topicId = improvementId; // reusing the id slot for topicId
    await inngest.send({
      name: "topic.selected",
      data: {
        siteId: "",
        headline: topicId,
        sourceUrls: [],
        keywordCluster: "",
      },
    });
    return updateMessage(`Topic selected. Article generation queued.`);
  }

  // ── Improvement approval buttons ──────────────────────────────────────────
  if (!improvementId) return channelMessage("Malformed button ID.");

  // Validate improvement still pending
  const db = getDb();
  const { data: improvement, error } = await db
    .from("improvements")
    .select("id, status")
    .eq("id", improvementId)
    .single();

  if (error || !improvement) {
    return channelMessage(`Improvement ${improvementId} not found.`);
  }
  if (improvement.status !== "pending_approval") {
    return channelMessage(`This proposal has already been ${improvement.status}.`);
  }

  if (action === "approve") {
    await inngest.send({
      name: "improvement.decided",
      data: {
        improvementId,
        action: "approve",
        decidedBy,
        channel: "discord",
      },
    });
    return updateMessage(`✅ Approved by <@${decidedBy}>. Applying improvement…`);
  }

  if (action === "approve_with_edits") {
    // Open a modal so the reviewer can paste the modified patch JSON
    return openModal(
      `edit_patch:${improvementId}`,
      "Approve with Edits",
      [
        {
          type: 1,
          components: [
            {
              type: 4, // TEXT_INPUT
              custom_id: "patch_json",
              label: "Edited patch JSON (leave blank to approve as-is)",
              style: 2, // PARAGRAPH
              required: false,
              placeholder: '{"changes": [...]}',
              max_length: 4000,
            },
          ],
        },
        {
          type: 1,
          components: [
            {
              type: 4,
              custom_id: "edit_notes",
              label: "Edit notes (optional)",
              style: 2,
              required: false,
              max_length: 500,
            },
          ],
        },
      ]
    );
  }

  if (action === "reject") {
    // Open a modal to collect the rejection reason
    return openModal(
      `reject_reason:${improvementId}`,
      "Reject Improvement",
      [
        {
          type: 1,
          components: [
            {
              type: 4,
              custom_id: "reason",
              label: "Rejection reason",
              style: 2,
              required: true,
              placeholder: "Explain why this improvement should not be applied…",
              max_length: 500,
            },
          ],
        },
      ]
    );
  }

  return channelMessage("Unknown action.");
}

async function handleModalSubmit(
  interaction: DiscordInteraction
): Promise<NextResponse> {
  const customId = interaction.data?.custom_id ?? "";
  const decidedBy = getUserId(interaction);

  // Flatten all modal components into a map
  const fieldMap: Record<string, string> = {};
  for (const row of interaction.data?.components ?? []) {
    for (const field of row.components ?? []) {
      if (field.custom_id && field.value != null) {
        fieldMap[field.custom_id] = field.value;
      }
    }
  }

  // ── Reject with reason ────────────────────────────────────────────────────
  if (customId.startsWith("reject_reason:")) {
    const improvementId = customId.slice("reject_reason:".length);
    const reason = fieldMap.reason ?? "No reason provided";

    const db = getDb();
    const { data: improvement } = await db
      .from("improvements")
      .select("status")
      .eq("id", improvementId)
      .single();

    if (improvement?.status !== "pending_approval") {
      return channelMessage(`Proposal already ${improvement?.status ?? "processed"}.`);
    }

    await inngest.send({
      name: "improvement.decided",
      data: {
        improvementId,
        action: "reject",
        decidedBy,
        channel: "discord",
        rejectionReason: reason,
      },
    });
    return updateMessage(`❌ Rejected by <@${decidedBy}>. Reason: ${reason}`);
  }

  // ── Approve with edits ────────────────────────────────────────────────────
  if (customId.startsWith("edit_patch:")) {
    const improvementId = customId.slice("edit_patch:".length);
    const patchJson = fieldMap.patch_json?.trim();

    let editedPatch: Record<string, unknown> | undefined;
    if (patchJson) {
      try {
        editedPatch = JSON.parse(patchJson) as Record<string, unknown>;
      } catch {
        return channelMessage("Invalid patch JSON. Please check your input and try again.");
      }
    }

    const db = getDb();
    const { data: improvement } = await db
      .from("improvements")
      .select("status")
      .eq("id", improvementId)
      .single();

    if (improvement?.status !== "pending_approval") {
      return channelMessage(`Proposal already ${improvement?.status ?? "processed"}.`);
    }

    await inngest.send({
      name: "improvement.decided",
      data: {
        improvementId,
        action: editedPatch ? "approve_with_edits" : "approve",
        decidedBy,
        channel: "discord",
        ...(editedPatch ? { editedPatch } : {}),
      },
    });

    const label = editedPatch ? "Approved with edits" : "Approved";
    return updateMessage(`✅ ${label} by <@${decidedBy}>. Applying improvement…`);
  }

  return channelMessage("Unknown modal.");
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(request: NextRequest): Promise<NextResponse> {
  const publicKey = process.env.DISCORD_PUBLIC_KEY;
  if (!publicKey) {
    return NextResponse.json({ error: "DISCORD_PUBLIC_KEY not configured" }, { status: 500 });
  }

  // Read body as raw text — verifyKey needs the exact bytes Discord signed
  const rawBody = await request.text();
  const signature = request.headers.get("x-signature-ed25519");
  const timestamp = request.headers.get("x-signature-timestamp");

  // Verify every request — Discord will reject our endpoint if PING fails verification
  if (!(await verifyRequest(rawBody, signature, timestamp, publicKey))) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const interaction = JSON.parse(rawBody) as DiscordInteraction;

  // ── PING — Discord's liveness check ──────────────────────────────────────
  if (interaction.type === InteractionType.PING) {
    return pong();
  }

  // ── Message component (button press) ─────────────────────────────────────
  if (interaction.type === InteractionType.MESSAGE_COMPONENT) {
    return handleButtonPress(interaction);
  }

  // ── Modal submit ──────────────────────────────────────────────────────────
  if (interaction.type === InteractionType.MODAL_SUBMIT) {
    return handleModalSubmit(interaction);
  }

  return NextResponse.json({ error: "Unsupported interaction type" }, { status: 400 });
}
