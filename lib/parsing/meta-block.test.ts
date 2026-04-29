import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseMetaBlock, containsPlaceholder, extractTldrBullets } from "./meta-block";

const VALID_META = `META TITLE: Mounjaro UK: Complete Guide
META DESCRIPTION: Mounjaro UK is a GLP-1 receptor agonist approved for weight loss in adults. This guide covers dosage, cost, and eligibility criteria for UK patients.
SCHEMA TYPE: Article + FAQ`;

const VALID_TLDR = `## Key Takeaways

- Mounjaro contains tirzepatide and is available on NHS prescription in the UK for type 2 diabetes.
- The standard starting dose is 2.5mg weekly, titrating up to a maximum of 15mg weekly.
- Clinical trials show average weight loss of 22.5% of body weight at the highest dose over 72 weeks.
- Mounjaro is not currently approved for weight loss alone on the NHS as of April 2026.
- Private prescriptions cost between £150 and £250 per month depending on dose and provider.`;

const VALID_BODY = `# Mounjaro UK: Complete Guide

By Dr. Jane Smith, Medical Director | Published: 2026-04-29 | Last Updated: 2026-04-29

${VALID_TLDR}

## What is Mounjaro?

Mounjaro is a dual GIP and GLP-1 receptor agonist that reduces appetite and slows gastric emptying.

[^1]: Source: [NHS](https://www.nhs.uk/medicines/tirzepatide/) — accessed 2026-04-29
[^2]: Source: [NICE](https://www.nice.org.uk/guidance/ta1003) — accessed 2026-04-29
[^3]: Source: [BMJ](https://www.bmj.com/content/379/bmj-2022-071485) — accessed 2026-04-29

> "Tirzepatide represents a significant advance in weight management pharmacotherapy." — Dr. John Wilding, Professor of Medicine, University of Liverpool

> "The dual mechanism of tirzepatide leads to superior weight loss compared to semaglutide." — NEJM, 2022

### FAQ

**What is Mounjaro used for in the UK?**
Mounjaro is licensed in the UK for type 2 diabetes management. NICE approved it for weight management in adults with obesity in 2024.

**How much does Mounjaro cost privately?**
Private Mounjaro prescriptions cost £150–£250 per month. The cost varies by dose and clinic.

**Is Mounjaro available on the NHS?**
Mounjaro is available on NHS for type 2 diabetes. Weight management access is expanding via specialist clinics.

**Can I get Mounjaro without a diagnosis?**
Mounjaro requires a prescription from a licensed UK healthcare provider. Self-prescribing is not legal.

## Conclusion

Mounjaro represents the most effective pharmacological weight management tool currently available in the UK.

Speak to your GP or an NHS specialist weight management clinic to discuss eligibility for Mounjaro on the NHS.

---
Dr. Jane Smith is Medical Director at Evernu and has 15 years of experience managing metabolic conditions including type 2 diabetes and obesity.`;

const VALID_MARKDOWN = `${VALID_META}

${VALID_BODY}`;

describe("parseMetaBlock", () => {
  it("happy path — parses valid markdown correctly", () => {
    const result = parseMetaBlock(VALID_MARKDOWN);
    assert.equal(result.ok, true, `Errors: ${result.errors.join("; ")}`);
    assert.equal(result.meta_title, "Mounjaro UK: Complete Guide");
    assert.equal(result.schema_type, "Article + FAQ");
    assert.ok(result.meta_description.length >= 140, "meta_description too short");
    assert.ok(result.meta_description.length <= 155, "meta_description too long");
    assert.ok(result.body_md.startsWith("# "), "body_md should start with H1");
    assert.ok(!result.body_md.includes("META TITLE:"), "META BLOCK should be stripped");
    assert.equal(result.tldr_bullets.length, 5);
    assert.equal(result.errors.length, 0);
  });

  it("missing META BLOCK — returns error", () => {
    const result = parseMetaBlock(VALID_BODY);
    assert.equal(result.ok, false);
    assert.ok(result.errors.some(e => e.includes("META TITLE") || e.includes("META DESCRIPTION") || e.includes("SCHEMA TYPE")));
  });

  it("META TITLE too long — returns error", () => {
    const longTitle = `META TITLE: ${"A".repeat(61)}
META DESCRIPTION: Mounjaro UK is a GLP-1 receptor agonist approved for weight loss in adults. This guide covers dosage, cost, and eligibility criteria for UK patients.
SCHEMA TYPE: Article + FAQ

${VALID_BODY}`;
    const result = parseMetaBlock(longTitle);
    assert.equal(result.ok, false);
    assert.ok(result.errors.some(e => e.includes("META TITLE > 60")));
  });

  it("META DESCRIPTION wrong length — too short", () => {
    const shortDesc = `META TITLE: Mounjaro UK: Complete Guide
META DESCRIPTION: Too short.
SCHEMA TYPE: Article + FAQ

${VALID_BODY}`;
    const result = parseMetaBlock(shortDesc);
    assert.equal(result.ok, false);
    assert.ok(result.errors.some(e => e.includes("META DESCRIPTION length")));
  });

  it("META DESCRIPTION wrong length — too long", () => {
    const longDesc = `META TITLE: Mounjaro UK: Complete Guide
META DESCRIPTION: ${"B".repeat(156)}
SCHEMA TYPE: Article + FAQ

${VALID_BODY}`;
    const result = parseMetaBlock(longDesc);
    assert.equal(result.ok, false);
    assert.ok(result.errors.some(e => e.includes("META DESCRIPTION length")));
  });

  it("no H1 found — returns specific error", () => {
    const noH1 = `META TITLE: Mounjaro UK: Complete Guide
META DESCRIPTION: Mounjaro UK is a GLP-1 receptor agonist approved for weight loss in adults. This guide covers dosage, cost, and eligibility criteria for UK patients.
SCHEMA TYPE: Article + FAQ

Just some content without an H1.`;
    const result = parseMetaBlock(noH1);
    assert.equal(result.ok, false);
    assert.ok(result.errors.some(e => e.includes("No H1 found")));
  });

  it("TL;DR with wrong bullet count — too few", () => {
    const fewBullets = `${VALID_META}

# Mounjaro UK: Complete Guide

## Key Takeaways

- Mounjaro contains tirzepatide.
- The starting dose is 2.5mg weekly.
- Clinical trials show significant weight loss.

## Content`;
    const result = parseMetaBlock(fewBullets);
    assert.equal(result.ok, false);
    assert.ok(result.errors.some(e => e.includes("TL;DR has") && e.includes("bullets")));
  });

  it("TL;DR bullet exceeding 25 words", () => {
    const longBullet = `${VALID_META}

# Mounjaro UK: Complete Guide

## Key Takeaways

- Mounjaro contains tirzepatide and is available on NHS prescription in the UK for type 2 diabetes management by qualified physicians registered with the General Medical Council.
- The standard starting dose is 2.5mg weekly.
- Clinical trials show average weight loss of 22.5%.
- Mounjaro is not approved for weight loss alone on NHS.
- Private prescriptions cost between £150 and £250 per month.

## Content`;
    const result = parseMetaBlock(longBullet);
    assert.equal(result.ok, false);
    assert.ok(result.errors.some(e => e.includes("bullet exceeds 25 words")));
  });

  it("placeholder detection — containsPlaceholder", () => {
    const withPlaceholder = "Some content [PLACEHOLDER: INSERT UNIQUE DATA] here";
    const withoutPlaceholder = "Some content without placeholders";
    assert.equal(containsPlaceholder(withPlaceholder), true);
    assert.equal(containsPlaceholder(withoutPlaceholder), false);
  });
});
