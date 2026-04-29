import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";

interface CacheEntry {
  content: string;
  mtime: number;
}

const cache = new Map<string, CacheEntry>();

export async function loadPrompt(filename: string): Promise<string> {
  const path = join(process.cwd(), "prompts", filename);

  let stats;
  try {
    stats = await stat(path);
  } catch {
    throw new Error(`Prompt file not found: prompts/${filename}. Ensure the file exists before running pipeline functions.`);
  }

  const mtime = stats.mtimeMs;
  const cached = cache.get(filename);

  if (cached && cached.mtime === mtime) {
    return cached.content;
  }

  const content = await readFile(path, "utf-8");
  cache.set(filename, { content, mtime });
  return content;
}
