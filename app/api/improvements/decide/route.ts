export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { inngest } from "../../../../inngest/client";
import { getDb } from "../../../../lib/db/client";

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: {
    improvementId?: string;
    action?: string;
    decidedBy?: string;
    channel?: string;
    editedPatch?: unknown;
    rejectionReason?: string;
  };

  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { improvementId, action } = body;

  if (!improvementId || !action) {
    return NextResponse.json({ error: "improvementId and action are required" }, { status: 400 });
  }

  if (!["approve", "approve_with_edits", "reject"].includes(action)) {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  // Validate improvement exists and is pending
  const db = getDb();
  const { data: improvement, error } = await db
    .from("improvements")
    .select("id, status")
    .eq("id", improvementId)
    .single();

  if (error || !improvement) {
    return NextResponse.json({ error: "Improvement not found" }, { status: 404 });
  }

  if (improvement.status !== "pending_approval") {
    return NextResponse.json(
      { error: `Improvement is already ${improvement.status}` },
      { status: 409 }
    );
  }

  await inngest.send({
    name: "improvement.decided",
    data: {
      improvementId,
      action: action as "approve" | "approve_with_edits" | "reject",
      decidedBy: body.decidedBy ?? "dashboard",
      channel: (body.channel ?? "dashboard") as "discord" | "email" | "dashboard",
      ...(body.editedPatch ? { editedPatch: body.editedPatch as Record<string, unknown> } : {}),
      ...(body.rejectionReason ? { rejectionReason: body.rejectionReason } : {}),
    },
  });

  return NextResponse.json({ ok: true });
}
