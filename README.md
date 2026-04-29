# SEO/GEO Content Pipeline

An end-to-end autonomous content pipeline that ingests trending topics, generates SEO/GEO-optimised articles, publishes them to a Next.js/Vercel site backed by Supabase, indexes them across search engines, and self-improves based on weekly performance data — with mandatory human approval gates on all changes to live content. Built for Joseph (Evernu, Robur & Fides). Pipeline orchestration via Inngest; article generation via Claude Sonnet; editorial review via Gemini 2.5 Pro.

**Status: Task 0 complete — framework established.**

---

## Shared secrets

Before first deploy, the following value must be set to the **same string** in both the pipeline environment and the live site environment:

| Pipeline env var | Live site env var |
|---|---|
| `VERCEL_REVALIDATE_SECRET` | `REVALIDATE_SECRET` |

Generate with: `openssl rand -hex 32`

The Supabase URL and anon key must also match — both environments point to the same Supabase project.

See PRD Section 9 for the full shared secrets table and Section 16 for all required environment variables.
