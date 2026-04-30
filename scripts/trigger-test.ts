#!/usr/bin/env tsx
/**
 * Trigger a topic.selected event against the local Inngest dev server.
 *
 * Usage:
 *   pnpm tsx scripts/trigger-test.ts \
 *     --headline "Mounjaro UK: Complete Guide" \
 *     --urls "https://www.nhs.uk/medicines/tirzepatide/,https://www.bbc.co.uk/news/health" \
 *     --site-id "<your-site-uuid>" \
 *     --keyword "mounjaro uk"
 *
 * The script POSTs to http://localhost:8288/e/<INNGEST_EVENT_KEY> and prints
 * the event ID returned by the dev server.
 *
 * Requirements:
 *   - `pnpm dev` running in one terminal
 *   - `npx inngest-cli@latest dev` running in another terminal
 *   - INNGEST_EVENT_KEY set in .env.local (or passed as env var)
 */

import { parseArgs } from "node:util";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Load .env.local if present (simple key=value parser, no dotenv dependency)
function loadEnvLocal(): void {
  const envPath = resolve(process.cwd(), ".env.local");
  try {
    const content = readFileSync(envPath, "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const value = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, "");
      if (!(key in process.env)) {
        process.env[key] = value;
      }
    }
  } catch {
    // .env.local is optional
  }
}

loadEnvLocal();

const { values } = parseArgs({
  options: {
    headline: { type: "string" },
    urls: { type: "string" },
    "site-id": { type: "string" },
    keyword: { type: "string" },
  },
  strict: true,
});

const headline = values["headline"];
const urlsRaw = values["urls"];
const siteId = values["site-id"];
const keyword = values["keyword"];

if (!headline) {
  console.error("Error: --headline is required");
  process.exit(1);
}
if (!siteId) {
  console.error("Error: --site-id is required");
  process.exit(1);
}

const sourceUrls = urlsRaw ? urlsRaw.split(",").map((u) => u.trim()).filter(Boolean) : [];

// Derive keyword from headline if not provided
const keywordCluster =
  keyword ??
  headline
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .trim();

const eventKey = process.env.INNGEST_EVENT_KEY ?? "local";
const devServerUrl = `http://localhost:8288/e/${eventKey}`;

const payload = {
  name: "topic.selected",
  data: {
    siteId,
    headline,
    sourceUrls,
    keywordCluster,
  },
};

console.log(`\nSending topic.selected event to Inngest dev server...`);
console.log(`  Headline: ${headline}`);
console.log(`  Site ID:  ${siteId}`);
console.log(`  Keyword:  ${keywordCluster}`);
console.log(`  Sources:  ${sourceUrls.length > 0 ? sourceUrls.join(", ") : "(none)"}`);
console.log(`  URL:      ${devServerUrl}\n`);

const response = await fetch(devServerUrl, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(payload),
});

if (!response.ok) {
  const body = await response.text().catch(() => "(unreadable)");
  console.error(`Failed: HTTP ${response.status} ${response.statusText}`);
  console.error(body);
  process.exit(1);
}

const result = (await response.json()) as { ids?: string[] };
const eventId = result.ids?.[0] ?? "(unknown)";

console.log(`Event sent successfully.`);
console.log(`  Event ID: ${eventId}`);
console.log(`\nView the step trace at http://localhost:8288\n`);
