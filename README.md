# SEO/GEO Content Pipeline

An end-to-end autonomous content pipeline that ingests trending topics, generates SEO/GEO-optimised articles, publishes them to a Next.js/Vercel site backed by Supabase, indexes them across search engines, and self-improves based on weekly performance data — with mandatory human approval gates on all changes to live content. Built for Joseph (Evernu, Robur & Fides). Pipeline orchestration via Inngest; article generation via Claude Sonnet 4.5; editorial review via Gemini 2.5 Pro.

**Status: Task 5 complete — hardening live.**

---

## Dashboard

The pipeline dashboard runs at the same Next.js URL, protected by a shared password (`DASHBOARD_PASSWORD` env var).

| Route | Description |
|---|---|
| `/articles` | All published articles with latest SERP position and AI citation counts |
| `/assessments` | Weekly assessment history with delta charts (position + clicks) |
| `/improvements` | All improvement proposals filterable by status |
| `/improvements/:id` | Diff viewer, change summary, and Approve / Approve with Edits / Reject buttons |
| `/costs` | LLM cost dashboard — spend by model, by day, and by article |

---

## Hardening Features (Task 5)

- **Automatic database pruning** — `prune-database` Inngest cron (Sundays 03:00) purges stale rows per retention policy (see `inngest/functions/prune-database.ts`)
- **Retry with exponential backoff** — all external API calls wrapped with `withRetry` (3 retries, 500ms base, 30s max, ±20% jitter) via `lib/util/retry.ts`
- **Per-call token cost tracking** — Claude and Gemini usage logged to `token_usage_logs` after every call; visible at `/costs`
- **Additional topic sources** — X (Twitter) v2 search and GDELT 2.0 article list wired into topic-discovery; configure via `structure_template_jsonb.topic_sources`
- **Monthly cost cap** — set `sites.monthly_cost_cap_usd` to skip article generation if the month's LLM spend exceeds the cap
- **Semantic duplicate detection** — pgvector cosine similarity check (threshold 0.9) on `text-embedding-3-small` embeddings before publishing; skips near-duplicates

### New env vars (Task 5)

| Var | Required | Purpose |
|---|---|---|
| `X_BEARER_TOKEN` | No | X API v2 bearer token for tweet search |

### New migrations

| File | What it does |
|---|---|
| `0009_token_usage_logs.sql` | Creates `token_usage_logs` table |
| `0010_site_cost_cap.sql` | Adds `monthly_cost_cap_usd` to `sites` |
| `0011_article_embeddings.sql` | Enables pgvector, adds `body_embedding` to `articles`, creates `match_articles` RPC |

---

## Discord Setup

1. Create an application at [Discord Developer Portal](https://discord.com/developers/applications)
2. Under **Bot**, copy the bot token → set `DISCORD_BOT_TOKEN`
3. Under **General Information**, copy the Public Key → set `DISCORD_PUBLIC_KEY`
4. Under **OAuth2 → Scopes**, add `bot` with `Send Messages` + `Read Message History`
5. Invite the bot to your server and note the approval channel ID → set `DISCORD_CHANNEL_ID`
6. Under **Interactions Endpoint URL**, set: `https://<your-domain>/api/discord/interactions`
7. Discord will send a PING to verify the endpoint — the route handles this automatically (responds with `{ type: 1 }`)

Approval buttons will appear in the configured channel whenever a new improvement proposal is generated.

For local testing: `ngrok http 3000` → point the interactions URL at the ngrok tunnel.

---

## Local Development

```bash
pnpm install
cp .env.example .env.local
# Fill in API keys

# Generate Supabase types (requires live Supabase project with migrations applied)
pnpm db:types

# Verify framework file is in place
ls prompts/writer-system.md   # MUST exist before running functions

# Run Next.js dev server
pnpm dev
```

In a second terminal:
```bash
npx inngest-cli@latest dev
```

Inngest dev UI at `http://localhost:8288`.

For Discord testing locally: `ngrok http 3000` and point Discord's interactions URL at the tunnel.

---

## Shared Secrets

Two values must match exactly across pipeline and live site environments:

| Pipeline env var | Live site env var | Must match? |
|---|---|---|
| `VERCEL_REVALIDATE_SECRET` | `REVALIDATE_SECRET` | **Yes — same value** |
| `SUPABASE_URL` | `NEXT_PUBLIC_SUPABASE_URL` | **Yes — same project** |
| `SUPABASE_ANON_KEY` | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | **Yes — same key** |

Generate the revalidate secret: `openssl rand -hex 32`

See `LIVE_SITE_PATCH.md` for the complete live site setup checklist.

---

## Database Setup

1. Create a Supabase project at supabase.com
2. Link the project: `pnpm supabase link --project-ref <your-project-ref>`
3. Apply migrations: `pnpm db:migrate`
4. Generate TypeScript types: `pnpm db:types`

See `db/migrations/README.md` for details.

---

## Testing the pipeline

Start the dev server and Inngest dev UI:
```bash
pnpm dev
# In a second terminal:
npx inngest-cli@latest dev
```

Trigger an article generation manually (without waiting for the topic discovery cron):
```bash
pnpm tsx scripts/trigger-test.ts \
  --headline "Mounjaro UK: Complete Guide" \
  --urls "https://www.nhs.uk/medicines/tirzepatide/,https://www.bbc.co.uk/news/health" \
  --site-id "<your-site-uuid>" \
  --keyword "mounjaro uk"
```

View the step trace at http://localhost:8288.

---

## Running Tests

```bash
pnpm test
```

Runs the meta-block parser unit tests using Node's built-in test runner.

```bash
npx tsx --test lib/patch/apply.test.ts
```

Runs the patch-apply unit tests (13 tests — all patch operations).
