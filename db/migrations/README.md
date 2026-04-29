# Database Migrations

SQL migration files applied in numeric order.

## Applying migrations

Ensure you have the Supabase CLI installed and authenticated:
```bash
pnpm supabase login
pnpm supabase link --project-ref <your-project-ref>
pnpm db:migrate
```

The `db:migrate` script runs `supabase db push` which applies all pending migrations.

**Prerequisites:** Create the Supabase project manually first, then apply migrations before running `pnpm db:types`.

## Files

| File | Contents |
|---|---|
| `0001_sites_and_keywords.sql` | sites, keyword_clusters, topic_candidates |
| `0002_articles.sql` | articles (including v1.5 meta columns) |
| `0003_revisions_assessments_improvements.sql` | revisions, assessments, improvements |
| `0004_source_scrapes.sql` | source_scrapes cache table |
| `0005_api_batch_logs.sql` | api_batch_logs |
| `0006_storage_bucket.sql` | article-media storage bucket and policies |
| `0007_rls_policies.sql` | Row Level Security policies |
