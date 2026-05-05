import { NextRequest, NextResponse } from "next/server";

// Routes that require the dashboard session cookie
const PROTECTED_PREFIXES = ["/articles", "/assessments", "/improvements"];

async function computeSessionValue(password: string): Promise<string> {
  const secret = process.env.APPROVAL_TOKEN_HMAC_SECRET ?? "";
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(password));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;

  if (!PROTECTED_PREFIXES.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  const dashboardPassword = process.env.DASHBOARD_PASSWORD;
  if (!dashboardPassword) {
    // Misconfigured — block access rather than allowing everything
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const session = request.cookies.get("dashboard-session")?.value;
  if (!session) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const expected = await computeSessionValue(dashboardPassword);
  if (session !== expected) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/articles/:path*", "/assessments/:path*", "/improvements/:path*"],
};
