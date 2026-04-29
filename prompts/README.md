# prompts/

This directory contains the system prompts that drive every LLM call in the pipeline. These files are the **source of truth** for their respective tasks.

## Files

### `writer-system.md`

The **SEO & GEO Article Production Framework v1.0** — the complete rulebook for article production.

- **Used by:** Claude Sonnet during Stage 2 (article generation) and Stage 4 (revision loops)
- **Loaded as:** the `system` parameter on every Claude API call via `generateWithClaude` in `lib/llm/claude.ts`
- **Governs:** article structure (Sections 3.1–3.13), prohibitions (Section 1), required inputs (Section 2), formatting (Section 4), GEO/SEO checklists (Sections 5–6), and word count targets (Section 7)

### `editor-rubric.md`

The editorial review system prompt for Gemini 2.5 Pro.

- **Used by:** Gemini during Stage 3 (editorial review after each generation or revision)
- **Loaded as:** the `system` parameter on every Gemini review call via `reviewWithGemini` in `lib/llm/gemini.ts`
- **Governs:** scoring across 8 dimensions (0–10), pipeline-layer hard checks (footnotes, block quotes, placeholder detection, meta block validity), and the pass/fail verdict with structured `revision_notes`

### `improvement-planner.md`

The Stage 9 patch generation system prompt for Claude.

- **Used by:** Claude during Stage 9 (auto-improvement patch proposal, triggered by `assessment.flagged` events)
- **Loaded as:** the `system` parameter on the patch-generation Claude API call in `inngest/functions/apply-improvement.ts`
- **Governs:** structured JSON patch proposals (not article writing) — patch types, priority labels, and the output schema that the approval dashboard and `apply-improvement` function consume
- **Does not reference** `writer-system.md` — this is a different task with a different output shape

---

## How prompts are loaded

All three files are loaded at runtime by `lib/llm/prompt-loader.ts`, which:

1. Reads the file from disk using `node:fs/promises`
2. Caches the content in memory keyed by filename + mtime
3. Automatically re-reads if the file's mtime has changed (relevant during local dev with `inngest-cli`)

The cache means cold-start latency is incurred once per process, not per LLM call.

---

## How to update a prompt

1. Edit the relevant `.md` file in this directory
2. Commit the change with a descriptive message (e.g., `feat(prompts): tighten eeat scoring rubric in editor-rubric.md`)
3. The change takes effect on the next pipeline run — no code changes needed

**Never** inline prompt content into TypeScript files. **Never** duplicate framework content across files. The markdown files here are the single source of truth for their respective tasks.
