import { withRetry } from "../util/retry";

export interface GdeltArticle {
  headline: string;
  sourceUrl: string;
  engagement: number;
  publishedAt: string;
}

export async function fetchGdeltArticles(queries: string[]): Promise<GdeltArticle[]> {
  if (queries.length === 0) return [];

  const articles: GdeltArticle[] = [];

  for (const query of queries) {
    try {
      const result = await withRetry(async () => {
        const url = new URL("https://api.gdeltproject.org/api/v2/doc/doc");
        url.searchParams.set("query", query);
        url.searchParams.set("mode", "artlist");
        url.searchParams.set("maxrecords", "25");
        url.searchParams.set("format", "json");

        const response = await fetch(url.toString(), {
          signal: AbortSignal.timeout(15_000),
        });
        if (!response.ok) throw new Error(`GDELT API error: ${response.status}`);

        return response.json() as Promise<{
          articles?: Array<{
            title?: string;
            url?: string;
            seendate?: string; // YYYYMMDDTHHMMSSZ e.g. "20250401T120000Z"
          }>;
        }>;
      });

      for (const article of result.articles ?? []) {
        if (!article.title || !article.url) continue;

        let publishedAt: string;
        try {
          const d = article.seendate ?? "";
          // Parse GDELT seendate: "20250401T120000Z" → ISO
          publishedAt = d
            ? new Date(
                `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}T` +
                `${d.slice(9, 11)}:${d.slice(11, 13)}:${d.slice(13, 15)}Z`
              ).toISOString()
            : new Date().toISOString();
        } catch {
          publishedAt = new Date().toISOString();
        }

        articles.push({
          headline: article.title,
          sourceUrl: article.url,
          engagement: 0, // GDELT doesn't provide engagement metrics
          publishedAt,
        });
      }
    } catch {
      // Silently skip failed queries
    }
  }

  return articles;
}
