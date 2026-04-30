# SEO/GEO Content Pipeline

An end-to-end autonomous content pipeline that ingests trending topics, generates SEO/GEO-optimised articles, publishes them to a Next.js/Vercel site backed by Supabase, indexes them across search engines, and self-improves based on weekly performance data — with mandatory human approval gates on all changes to live content. Built for Joseph (Evernu, Robur & Fides). Pipeline orchestration via Inngest; article generation via Claude Sonnet 4.5; editorial review via Gemini 2.5 Pro.

**Status: Task 3 complete — weekly assessment built.**

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
