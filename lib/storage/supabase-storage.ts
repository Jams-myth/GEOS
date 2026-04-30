import { getDb } from "../db/client";
import { withRetry } from "../util/retry";

const BUCKET = process.env.SUPABASE_STORAGE_BUCKET ?? "article-media";

const CONTENT_TYPE_MAP: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  svg: "image/svg+xml",
};

function getContentType(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return CONTENT_TYPE_MAP[ext] ?? "application/octet-stream";
}

export async function uploadToSupabaseStorage(
  buffer: ArrayBuffer,
  path: string
): Promise<string> {
  return withRetry(async () => {
    const db = getDb();
    const contentType = getContentType(path);

    const { error } = await db.storage
      .from(BUCKET)
      .upload(path, buffer, { contentType, upsert: true });

    if (error) throw new Error(`Storage upload failed for ${path}: ${error.message}`);

    const { data } = db.storage.from(BUCKET).getPublicUrl(path);
    return data.publicUrl;
  });
}

export async function fetchAsBuffer(url: string): Promise<ArrayBuffer> {
  return withRetry(async () => {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
    }
    return response.arrayBuffer();
  });
}
