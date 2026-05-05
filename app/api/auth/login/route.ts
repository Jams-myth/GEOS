export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

/** Compute the cookie value from the configured password. */
function computeSessionValue(password: string): string {
  const secret = process.env.APPROVAL_TOKEN_HMAC_SECRET ?? "";
  return crypto.createHmac("sha256", secret).update(password).digest("hex");
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const expected = process.env.DASHBOARD_PASSWORD;
  if (!expected) {
    return NextResponse.json({ error: "Dashboard auth not configured" }, { status: 500 });
  }

  let body: { password?: string };
  try {
    body = (await request.json()) as { password?: string };
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const provided = body.password ?? "";

  // Constant-time comparison to prevent timing attacks
  const expectedBuf = Buffer.from(expected, "utf8");
  const providedBuf = Buffer.from(provided, "utf8");
  const match =
    expectedBuf.length === providedBuf.length &&
    crypto.timingSafeEqual(expectedBuf, providedBuf);

  if (!match) {
    return NextResponse.json({ error: "Incorrect password" }, { status: 401 });
  }

  const sessionValue = computeSessionValue(expected);
  const response = NextResponse.json({ ok: true });
  response.cookies.set("dashboard-session", sessionValue, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 days
  });

  return response;
}
