export interface ParsedDraft {
  ok: boolean;
  meta_title: string;
  meta_description: string;
  schema_type: string;
  tldr_bullets: string[];
  body_md: string;
  errors: string[];
}

export function parseMetaBlock(rawMarkdown: string): ParsedDraft {
  const errors: string[] = [];

  let text = rawMarkdown.trimStart();

  // Strip optional leading code fence (```markdown or ```)
  if (text.startsWith("```")) {
    const fenceEnd = text.indexOf("\n");
    if (fenceEnd !== -1) {
      text = text.slice(fenceEnd + 1).trimStart();
    }
  }

  // Find H1 boundary — META BLOCK precedes the first H1
  const h1Match = text.match(/^# /m);
  if (!h1Match || h1Match.index === undefined) {
    return {
      ok: false,
      meta_title: "",
      meta_description: "",
      schema_type: "",
      tldr_bullets: [],
      body_md: rawMarkdown,
      errors: ["No H1 found — META BLOCK boundary undetectable"],
    };
  }

  const metaBlockText = text.slice(0, h1Match.index);
  const body_md = text.slice(h1Match.index);

  const titleMatch = metaBlockText.match(/^META TITLE:\s*(.+)$/m);
  const descMatch = metaBlockText.match(/^META DESCRIPTION:\s*(.+)$/m);
  const schemaMatch = metaBlockText.match(/^SCHEMA TYPE:\s*(.+)$/m);

  const meta_title = titleMatch?.[1]?.trim() ?? "";
  const meta_description = descMatch?.[1]?.trim() ?? "";
  const schema_type = schemaMatch?.[1]?.trim() ?? "";

  if (!meta_title) errors.push("META TITLE missing");
  if (meta_title && meta_title.length > 60)
    errors.push(`META TITLE > 60 chars (${meta_title.length})`);
  if (!meta_description) errors.push("META DESCRIPTION missing");
  if (meta_description && (meta_description.length < 140 || meta_description.length > 155))
    errors.push(`META DESCRIPTION length ${meta_description.length}, must be 140–155`);
  if (!schema_type) errors.push("SCHEMA TYPE missing");

  const tldr_bullets = extractTldrBullets(body_md);

  if (tldr_bullets.length < 4 || tldr_bullets.length > 6)
    errors.push(`TL;DR has ${tldr_bullets.length} bullets, must be 4–6`);

  for (const bullet of tldr_bullets) {
    const wordCount = bullet.trim().split(/\s+/).length;
    if (wordCount > 25)
      errors.push(`TL;DR bullet exceeds 25 words (${wordCount} words): "${bullet.slice(0, 60)}..."`);
  }

  return {
    ok: errors.length === 0,
    meta_title,
    meta_description,
    schema_type,
    tldr_bullets,
    body_md,
    errors,
  };
}

export function extractTldrBullets(body_md: string): string[] {
  // Find "Key Takeaways" or "TL;DR" section heading
  const headingMatch = body_md.match(
    /^(?:#{1,3}\s*(?:Key Takeaways|TL;DR)[^\n]*|(?:\*\*)?(?:Key Takeaways|TL;DR)(?:[^*\n]*)(?:\*\*)?)\s*$/im
  );

  if (!headingMatch || headingMatch.index === undefined) return [];

  // Get content after the heading
  const afterHeading = body_md.slice(headingMatch.index + headingMatch[0].length);

  const bullets: string[] = [];

  for (const line of afterHeading.split("\n")) {
    // Stop at the next heading
    if (/^#{1,3}\s/.test(line)) break;
    const bulletMatch = line.match(/^\s*[-*]\s+(.+)$/);
    if (bulletMatch) {
      bullets.push(bulletMatch[1].trim());
    }
  }

  return bullets;
}

export function containsPlaceholder(body_md: string): boolean {
  return body_md.includes("[PLACEHOLDER:");
}
