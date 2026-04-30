import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { applyPatchToMarkdown, extractMetaUpdates } from "./apply";
import type { ProposedChanges } from "../improvement/types";

const BASE_BODY = `## Key Takeaways

- Point one
- Point two

## Introduction

This is the intro.

## The Main Section

Main content here.

## FAQ

**What is X?**

X is a thing.

**What is Y?**

Y is another thing.
`.trimStart();

function makeChange(
  type: ProposedChanges["changes"][0]["type"],
  target: string,
  proposed_content: string
): ProposedChanges["changes"][0] {
  return { type, priority: "recommended", target, rationale: "test", proposed_content };
}

describe("applyPatchToMarkdown", () => {
  it("replace_section replaces a named H2 and its content", () => {
    const patch = {
      changes: [
        makeChange(
          "replace_section",
          "The Main Section",
          "## The Main Section\n\nReplaced content."
        ),
      ],
    };
    const result = applyPatchToMarkdown(BASE_BODY, patch);
    assert.ok(result.includes("Replaced content."), "replaced content should appear");
    assert.ok(!result.includes("Main content here."), "old content should be gone");
  });

  it("replace_section appends when section not found", () => {
    const patch = {
      changes: [makeChange("replace_section", "Nonexistent Section", "## New\n\nContent.")],
    };
    const result = applyPatchToMarkdown(BASE_BODY, patch);
    assert.ok(result.includes("## New"), "new section should be appended");
    assert.ok(result.includes("Main content here."), "original content preserved");
  });

  it("insert_section inserts after a named H2", () => {
    const patch = {
      changes: [
        makeChange(
          "insert_section",
          "after Introduction",
          "## New Section\n\nNew section content."
        ),
      ],
    };
    const result = applyPatchToMarkdown(BASE_BODY, patch);
    assert.ok(result.includes("## New Section"), "new section should appear");
    // New section should come after Introduction
    const introIdx = result.indexOf("## Introduction");
    const newIdx = result.indexOf("## New Section");
    assert.ok(newIdx > introIdx, "new section comes after Introduction");
  });

  it("insert_section at end appends to document", () => {
    const patch = {
      changes: [makeChange("insert_section", "end", "## Appended\n\nAppended content.")],
    };
    const result = applyPatchToMarkdown(BASE_BODY, patch);
    const appendIdx = result.lastIndexOf("## Appended");
    const faqIdx = result.indexOf("## FAQ");
    assert.ok(appendIdx > faqIdx, "appended section comes after FAQ");
  });

  it("update_tldr replaces content under Key Takeaways heading", () => {
    const patch = {
      changes: [makeChange("update_tldr", "tldr", "- New point one\n- New point two\n- New point three")],
    };
    const result = applyPatchToMarkdown(BASE_BODY, patch);
    assert.ok(result.includes("- New point one"), "new bullet should appear");
    assert.ok(!result.includes("- Point one"), "old bullet should be gone");
    assert.ok(result.includes("## Key Takeaways"), "heading preserved");
  });

  it("update_faq replaces a specific question block", () => {
    const patch = {
      changes: [
        makeChange(
          "update_faq",
          "What is X?",
          "**What is X?**\n\nX is a thoroughly revised thing."
        ),
      ],
    };
    const result = applyPatchToMarkdown(BASE_BODY, patch);
    assert.ok(result.includes("X is a thoroughly revised thing."), "revised answer should appear");
    assert.ok(!result.includes("X is a thing."), "old answer should be gone");
    assert.ok(result.includes("Y is another thing."), "unrelated FAQ preserved");
  });

  it("update_faq appends when question not found", () => {
    const patch = {
      changes: [
        makeChange("update_faq", "What is Z?", "**What is Z?**\n\nZ is brand new."),
      ],
    };
    const result = applyPatchToMarkdown(BASE_BODY, patch);
    assert.ok(result.includes("**What is Z?**"), "new FAQ entry appended");
  });

  it("add_footnote appends footnote definition at end", () => {
    const patch = {
      changes: [
        makeChange(
          "add_footnote",
          "X is a thing.",
          "[^1]: Source: [Example](https://example.com) — accessed 2026-04-30"
        ),
      ],
    };
    const result = applyPatchToMarkdown(BASE_BODY, patch);
    assert.ok(result.includes("[^1]:"), "footnote definition should appear");
    // Footnote should be at the end
    const fnIdx = result.lastIndexOf("[^1]:");
    const mainIdx = result.indexOf("Main content here.");
    assert.ok(fnIdx > mainIdx, "footnote definition after main content");
  });

  it("update_meta does not modify body_md", () => {
    const patch = {
      changes: [
        makeChange("update_meta", "meta", "META TITLE: New Title\nMETA DESCRIPTION: New desc"),
      ],
    };
    const result = applyPatchToMarkdown(BASE_BODY, patch);
    assert.equal(result, BASE_BODY, "body_md unchanged for update_meta");
  });

  it("applies multiple changes in order", () => {
    const patch = {
      changes: [
        makeChange("replace_section", "Introduction", "## Introduction\n\nNew intro text."),
        makeChange("add_footnote", "New intro text.", "[^1]: Source: [Ref](https://ref.com)"),
      ],
    };
    const result = applyPatchToMarkdown(BASE_BODY, patch);
    assert.ok(result.includes("New intro text."), "first change applied");
    assert.ok(result.includes("[^1]:"), "second change applied");
    assert.ok(!result.includes("This is the intro."), "old intro removed");
  });
});

describe("extractMetaUpdates", () => {
  it("extracts meta title and description", () => {
    const patch = {
      changes: [
        makeChange(
          "update_meta",
          "meta",
          "META TITLE: My New Title\nMETA DESCRIPTION: My new description text"
        ),
      ],
    };
    const result = extractMetaUpdates(patch);
    assert.deepEqual(result, {
      meta_title: "My New Title",
      meta_description: "My new description text",
    });
  });

  it("extracts schema_type from update_schema change", () => {
    const patch = {
      changes: [makeChange("update_schema", "schema_type", "HowTo")],
    };
    const result = extractMetaUpdates(patch);
    assert.deepEqual(result, { schema_type: "HowTo" });
  });

  it("returns null when no meta changes", () => {
    const patch = {
      changes: [makeChange("replace_section", "Intro", "## Intro\n\nNew.")],
    };
    assert.equal(extractMetaUpdates(patch), null);
  });
});
