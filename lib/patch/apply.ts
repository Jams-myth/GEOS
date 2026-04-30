import type { PatchChange, ProposedChanges } from "../improvement/types";

/**
 * Finds the line index of an H2 heading whose text matches the target.
 * Matching is case-insensitive and trims leading `## `.
 */
function findH2LineIndex(lines: string[], target: string): number {
  const needle = target.trim().toLowerCase();
  return lines.findIndex(
    (l) => l.trimStart().startsWith("## ") && l.replace(/^#+\s*/, "").trim().toLowerCase() === needle
  );
}

/**
 * Returns [start, end) indices of the H2 section beginning at `startLine`.
 * `end` is either the next H2 line or lines.length.
 */
function getSectionBounds(lines: string[], startLine: number): [number, number] {
  let end = startLine + 1;
  while (end < lines.length) {
    if (lines[end].trimStart().startsWith("## ")) break;
    end++;
  }
  return [startLine, end];
}

function applyReplaceSection(lines: string[], change: PatchChange): string[] {
  const idx = findH2LineIndex(lines, change.target);
  if (idx === -1) {
    // Section not found — append as a new section
    return [...lines, "", ...change.proposed_content.split("\n")];
  }
  const [start, end] = getSectionBounds(lines, idx);
  return [...lines.slice(0, start), ...change.proposed_content.split("\n"), ...lines.slice(end)];
}

function applyInsertSection(lines: string[], change: PatchChange): string[] {
  const target = change.target.trim().toLowerCase();

  if (target === "end" || target === "at end") {
    return [...lines, "", ...change.proposed_content.split("\n")];
  }

  if (target === "start" || target === "at start") {
    return [...change.proposed_content.split("\n"), "", ...lines];
  }

  // "after <H2 heading>"
  const afterPrefix = "after ";
  const heading = target.startsWith(afterPrefix) ? target.slice(afterPrefix.length) : target;
  const idx = findH2LineIndex(lines, heading);

  if (idx === -1) {
    return [...lines, "", ...change.proposed_content.split("\n")];
  }

  const [, end] = getSectionBounds(lines, idx);
  return [
    ...lines.slice(0, end),
    "",
    ...change.proposed_content.split("\n"),
    ...lines.slice(end),
  ];
}

function applyUpdateTldr(lines: string[], change: PatchChange): string[] {
  // Finds any H2 that looks like "Key Takeaways", "TL;DR", "Summary", etc.
  const tldrVariants = ["key takeaways", "tldr", "tl;dr", "summary", "quick summary"];
  const idx = lines.findIndex((l) => {
    if (!l.trimStart().startsWith("## ")) return false;
    const text = l.replace(/^#+\s*/, "").trim().toLowerCase();
    return tldrVariants.some((v) => text.includes(v));
  });

  if (idx === -1) return lines;
  const [start, end] = getSectionBounds(lines, idx);
  // Keep the H2 heading, replace everything below it
  return [...lines.slice(0, start + 1), ...change.proposed_content.split("\n"), ...lines.slice(end)];
}

function applyUpdateFaq(lines: string[], change: PatchChange): string[] {
  // Find the FAQ section, then find the specific question inside it
  const faqIdx = lines.findIndex((l) => {
    if (!l.trimStart().startsWith("## ")) return false;
    return l.replace(/^#+\s*/, "").trim().toLowerCase().includes("faq");
  });

  if (faqIdx === -1) return lines;

  const [, faqEnd] = getSectionBounds(lines, faqIdx);

  // Search for the question as a heading (H3) or bold text within the FAQ section
  const questionNeedle = change.target.trim().toLowerCase();
  let qStart = -1;
  for (let i = faqIdx + 1; i < faqEnd; i++) {
    const lineText = lines[i].replace(/^#+\s*/, "").replace(/\*\*/g, "").trim().toLowerCase();
    if (lineText === questionNeedle) {
      qStart = i;
      break;
    }
  }

  if (qStart === -1) {
    // Question not found — append to FAQ section
    return [
      ...lines.slice(0, faqEnd),
      "",
      ...change.proposed_content.split("\n"),
      ...lines.slice(faqEnd),
    ];
  }

  // Find end of this Q&A block (next heading, next bold-question marker, or end of FAQ)
  let qEnd = qStart + 1;
  while (qEnd < faqEnd) {
    const trimmed = lines[qEnd].trim();
    if (trimmed.startsWith("#")) break;
    // Another bold question (e.g. "**What is Y?**") signals the start of the next Q&A
    if (qEnd > qStart + 1 && trimmed.startsWith("**") && trimmed.endsWith("**") && trimmed.length > 4) break;
    qEnd++;
  }

  return [
    ...lines.slice(0, qStart),
    ...change.proposed_content.split("\n"),
    ...lines.slice(qEnd),
  ];
}

function applyAddFootnote(lines: string[], change: PatchChange): string[] {
  // Append footnote definition at the end of the document
  const footnoteLines = change.proposed_content.split("\n");
  // Ensure there's a blank line before the first footnote block
  const last = lines[lines.length - 1]?.trim();
  if (last !== "") {
    return [...lines, "", ...footnoteLines];
  }
  return [...lines, ...footnoteLines];
}

/**
 * Apply a single patch change to a markdown body string.
 * Changes to meta fields (update_meta, update_schema) are not applied to body_md;
 * those are handled directly in the DB update step of apply-improvement.ts.
 */
function applyChange(body: string, change: PatchChange): string {
  const lines = body.split("\n");

  switch (change.type) {
    case "replace_section":
      return applyReplaceSection(lines, change).join("\n");

    case "insert_section":
      return applyInsertSection(lines, change).join("\n");

    case "update_tldr":
      return applyUpdateTldr(lines, change).join("\n");

    case "update_faq":
      return applyUpdateFaq(lines, change).join("\n");

    case "add_footnote":
      return applyAddFootnote(lines, change).join("\n");

    case "update_meta":
    case "update_schema":
      // Not applied to body_md — handled at DB level
      return body;

    default:
      return body;
  }
}

/**
 * Apply all patch changes from a ProposedChanges object to a markdown body.
 * Changes are applied in order (critical first, as per planner output).
 * `update_meta` and `update_schema` changes are skipped here (not body changes).
 */
export function applyPatchToMarkdown(
  currentBody: string,
  patch: ProposedChanges | { changes: PatchChange[] }
): string {
  let body = currentBody;
  for (const change of patch.changes) {
    body = applyChange(body, change);
  }
  return body;
}

/**
 * Extract meta field updates from a patch (for direct DB writes).
 * Returns null if there are no meta/schema changes.
 */
export function extractMetaUpdates(patch: ProposedChanges | { changes: PatchChange[] }): {
  meta_title?: string;
  meta_description?: string;
  schema_type?: string;
} | null {
  const updates: Record<string, string> = {};

  for (const change of patch.changes) {
    if (change.type === "update_meta") {
      // Format: "META TITLE: ...\nMETA DESCRIPTION: ..."
      const lines = change.proposed_content.split("\n");
      for (const line of lines) {
        if (line.startsWith("META TITLE:")) {
          updates.meta_title = line.replace("META TITLE:", "").trim();
        } else if (line.startsWith("META DESCRIPTION:")) {
          updates.meta_description = line.replace("META DESCRIPTION:", "").trim();
        }
      }
    } else if (change.type === "update_schema") {
      updates.schema_type = change.proposed_content.trim();
    }
  }

  return Object.keys(updates).length > 0 ? updates : null;
}
