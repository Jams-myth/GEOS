import { NextResponse } from "next/server";
import { inngest } from "../../../../inngest/client";

/**
 * POST /api/admin/trigger-discovery
 * Manually fires a topic discovery run immediately.
 */
export async function POST() {
  await inngest.send({
    name: "content/topic.discovery.requested",
    data: {},
  });

  return NextResponse.json({ ok: true, message: "Topic discovery triggered." });
}
