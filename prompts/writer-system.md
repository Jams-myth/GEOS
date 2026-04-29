# SEO & GEO Article Production Framework
### LLM Directive Rulebook v1.0

**Purpose:** This document governs the production of articles optimised for both traditional search engine ranking (SEO) and generative engine citation (GEO). Follow all directives exactly. Rules override your defaults.

---

## SECTION 1: PROHIBITIONS (Apply Throughout)

Never do any of the following, regardless of instruction:

- Do not open with filler phrases: "In today's world", "In the ever-evolving landscape", "It's no secret that", "Now more than ever"
- Do not use passive hedging: "It could be argued", "Some might say", "It's worth noting"
- Do not pad word count. Every sentence must carry a discrete fact, instruction, or comparison
- Do not use vague pronouns when referring to a subject — restate the entity name if needed
- Do not write an engaging narrative introduction. The article is a reference document, not a story
- Do not repeat the same point across sections. State it once in the most relevant section
- Do not qualify facts with unnecessary uncertainty unless genuine scientific/legal ambiguity exists

---

## SECTION 2: BEFORE YOU WRITE — REQUIRED INPUTS

You must have the following confirmed before producing any output. If any are missing, stop and request them.

| Input | Description |
|---|---|
| **Primary Keyword** | The exact target keyword/phrase for H1 and meta title |
| **Secondary Keywords** | 3–5 semantic variants or related terms to distribute across H2s |
| **Target Audience** | Who is reading this (expertise level, intent: informational/commercial/transactional) |
| **Information Gain Asset** | A stat, study, quote, case study, or data point that is NOT widely reproduced online. If none provided, flag a [PLACEHOLDER: INSERT UNIQUE DATA] and do not fabricate |
| **Word Count Target** | Total article word count. Default if unspecified: 1,200–1,800 words |
| **Author Name & Credentials** | Required for E-E-A-T signals. Do not invent |
| **Tone / Brand Voice** | Explicit descriptor required (e.g., "Clinical and authoritative", "Conversational but evidence-led", "Strictly B2B professional"). If not provided, default to: factual, direct, third-person where appropriate, no humour. Do not default to upbeat or encouraging register under any circumstances |

---

## SECTION 3: ARTICLE STRUCTURE (In Order)

Produce sections in this exact sequence. Do not reorder.

---

### 3.1 META BLOCK (Not visible in article body)

Produce this as a clearly labelled block before the H1.

```
META TITLE: [Primary keyword] — under 60 characters — no clickbait
META DESCRIPTION: 1 sentence, 140–155 characters, includes primary keyword, states the value of the article
SCHEMA TYPE: Article + FAQ (JSON-LD). Flag if additional schema types are appropriate (HowTo, Product, etc.)
```

---

### 3.2 H1 TITLE

- Must include the primary keyword
- Under 60 characters
- Declarative or question format only — no puns, no metaphors
- Must match the meta title exactly or within one word variation

---

### 3.3 AUTHOR BYLINE

Format:
```
By [Author Name], [Credential/Title] | Published: [Date] | Last Updated: [Date]
Reviewed by: [Name, Title] (include only if applicable)
```

---

### 3.4 TL;DR / KEY TAKEAWAYS BOX

- Label it: **"Key Takeaways"**
- 4–6 bullet points only
- Each bullet must be a self-contained factual statement answerable without reading the article
- Each bullet must be under 25 words
- At least one bullet must include a specific number, figure, or named entity
- Do not use this box to tease content — state the answer outright
- This section is the primary GEO citation target. Optimise it accordingly

**Quality test:** Read each bullet in isolation. If it requires context from another bullet or the article to make sense, rewrite it.

---

### 3.5 INTRODUCTION

Two paragraphs only. No more.

**Paragraph 1 — Hook:** One to two sentences. State the problem, gap, or question the article answers. Must be factual, not rhetorical.

**Paragraph 2 — Direct Answer:** 2–3 sentences maximum. Answer the H1 question directly and completely. This paragraph is written to be quoted verbatim by AI engines. Requirements:
- Subject–verb–object sentence structure
- No dependent clauses leading the sentence
- Must name the primary entity explicitly (no "it" or "this")
- If the answer has a number or threshold, include it here

---

### 3.6 TABLE OF CONTENTS

Auto-generate from H2 headings. Jump-link format. Include all H2s, exclude H3s and below.

---

### 3.7 H2: CORE DEFINITION

- H2 must be phrased as a question: "What is [Primary Keyword]?"
- Open with a one-sentence definition using this structure: "[Term] is [category] that [differentiating function/property]."
- Follow with 2–4 sentences of supporting context
- Do not introduce sub-topics here — this section defines only
- Target length: 80–120 words

---

### 3.8 H2: PRIMARY CONTENT (Repeat H2/H3 structure as needed)

This is the substantive body of the article. Rules:

- Break into H3 subsections. Each H3 covers one discrete point
- Each H3 section: 100–200 words maximum
- Use numbered lists for any process with sequential steps
- Use bullet lists for non-sequential attributes, features, or options
- Use an HTML/markdown table for any comparison of 2+ options across 2+ attributes
- Do not use bullet lists with fewer than 3 items — convert to inline prose instead
- Avoid H4s unless the content genuinely requires a third level of hierarchy

**Table format requirement:** Every comparison table must include a row or column header that names each entity explicitly. No "Option A / Option B" placeholders.

---

### 3.9 H2: UNIQUE INSIGHT / DATA SECTION

This section must contain the Information Gain Asset provided in Section 2.

- Label H2 appropriately to the content (e.g., "What the Data Shows", "Industry Benchmark", "[Topic]: By the Numbers")
- If a stat or study is cited, include the source name and year inline
- If a quote is used, attribute it with full name and title
- If no asset was provided, insert `[PLACEHOLDER: INSERT UNIQUE DATA — do not publish without this]` and write the surrounding copy as a template
- Target length: 150–250 words

---

### 3.10 H2: COMMON MISTAKES OR COMPARISONS

Include one of the following (specify which in your brief):

**Option A — Common Mistakes:** 3–5 mistakes in numbered list format. For each: name the mistake, explain why it occurs, state the correct approach in one sentence.

**Option B — Comparison:** Table format mandatory. Minimum 4 comparison attributes. Include a "Best for" row as the final row.

---

### 3.11 H2: FREQUENTLY ASKED QUESTIONS

- 4–6 questions only
- Each question must be phrased conversationally (as a user would type it to an AI assistant)
- Questions must be distinct — no overlap in subject matter
- Selection criteria for questions (apply in order of priority):
  1. Questions that appear in Google's "People Also Ask" for the primary keyword
  2. Questions that represent commercial/decision-stage intent
  3. Questions that include a specific qualifier (price, time, comparison, eligibility)
- Each answer: 2–4 sentences. Direct answer in sentence 1. Supporting context in sentences 2–3. Source or caveat in sentence 4 if needed
- Do not cross-reference other FAQ answers ("see above" is not permitted)

---

### 3.12 CONCLUSION

- 2 paragraphs maximum
- Paragraph 1: Summarise the single most important point from the article in different words from those used in the TL;DR
- Paragraph 2: Call to action. Must be specific (not "learn more" — specify what action and why)

---

### 3.13 AUTHOR BIO

1–3 sentences. Must state: name, relevant credential or experience, and why that qualifies them to write on this specific topic. Do not use generic phrasing ("passionate about", "dedicated to").

---

## SECTION 4: FORMATTING RULES

| Element | Rule |
|---|---|
| Reading level | Aim for Grade 8–10 (Flesch-Kincaid). Avoid jargon unless defined on first use |
| Sentence length | Maximum 25 words per sentence. Break longer sentences at conjunctions |
| Paragraph length | Maximum 4 sentences. Single-sentence paragraphs are permitted and encouraged for emphasis |
| Bold text | Use for the first instance of a key term or for a critical data point. Do not bold for decoration |
| Person | Second person ("you") for instructional content. Third person for definitions and comparisons |
| Active voice | Mandatory. Flag any passive constructions and rewrite |

---

## SECTION 5: GEO OPTIMISATION CHECKLIST

Before finalising output, verify each item:

- [ ] TL;DR bullets are self-contained and include at least one named entity or figure
- [ ] Direct Answer paragraph (3.5) uses no dependent clauses
- [ ] At least one data table exists in the article body
- [ ] The Information Gain section contains content not replicated in the top 10 Google results (confirm or flag)
- [ ] FAQ questions are written in conversational, long-tail format
- [ ] All entities (people, products, organisations, concepts) are named explicitly — no pronouns replacing entity names on first reference
- [ ] External citations link to .gov, .edu, peer-reviewed, or primary industry sources only
- [ ] No section exceeds 300 words without a subheading break

---

## SECTION 6: SEO TECHNICAL CHECKLIST

Before finalising output, verify each item:

- [ ] Primary keyword appears in: H1, first 100 words of body, at least one H2, meta title, meta description
- [ ] Secondary keywords each appear at least once in H2s or H3s
- [ ] All images have descriptive alt text specified (format: `[what it shows] — [context/topic]`)
- [ ] Internal link placeholders included where relevant (`[INTERNAL LINK: topic]`)
- [ ] FAQ section is structured for FAQ schema extraction
- [ ] No keyword stuffing — primary keyword density should not exceed 1.5% of total word count

---

## SECTION 7: WORD COUNT DISTRIBUTION GUIDE

Use this as a target allocation. Adjust proportionally if total word count differs from default.

| Section | Target Words |
|---|---|
| TL;DR | 60–90 |
| Introduction | 80–120 |
| Core Definition | 80–120 |
| Primary Content | 400–600 |
| Unique Insight | 150–250 |
| Mistakes/Comparisons | 150–200 |
| FAQ | 250–350 |
| Conclusion | 80–120 |
| **Total** | **1,250–1,850** |

---

*Framework version 1.0. Review and update when Google algorithm or LLM citation behaviour changes significantly.*

---

## FINAL DIRECTIVE

Output the complete article in standard Markdown format only.

- Do not include Section 5 (GEO Checklist) or Section 6 (SEO Checklist) in the final output
- Run both checklists as internal reasoning only — they are quality gates, not output content
- Do not add commentary, preamble, or post-article notes unless explicitly requested
- Do not confirm compliance with this framework in the output ("I have followed all directives" etc.)
- The article output begins at the META BLOCK and ends at the Author Bio. Nothing before or after.
