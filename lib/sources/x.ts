import { withRetry } from "../util/retry";

export interface XPost {
  headline: string;
  sourceUrl: string;
  engagement: number;
  publishedAt: string;
}

export async function fetchXPosts(queries: string[]): Promise<XPost[]> {
  const bearerToken = process.env.X_BEARER_TOKEN;
  if (!bearerToken || queries.length === 0) return []; // Optional — skip if not configured

  const posts: XPost[] = [];

  for (const query of queries) {
    try {
      const result = await withRetry(async () => {
        const url = new URL("https://api.twitter.com/2/tweets/search/recent");
        url.searchParams.set("query", `${query} -is:retweet lang:en`);
        url.searchParams.set("max_results", "25");
        url.searchParams.set("tweet.fields", "created_at,public_metrics");

        const response = await fetch(url.toString(), {
          headers: { Authorization: `Bearer ${bearerToken}` },
          signal: AbortSignal.timeout(15_000),
        });

        if (response.status === 429) throw new Error("X API rate limited");
        if (!response.ok) throw new Error(`X API error: ${response.status}`);

        return response.json() as Promise<{
          data?: Array<{
            id: string;
            text: string;
            created_at?: string;
            public_metrics?: {
              like_count?: number;
              retweet_count?: number;
              reply_count?: number;
            };
          }>;
        }>;
      });

      for (const tweet of result.data ?? []) {
        const engagement =
          (tweet.public_metrics?.like_count ?? 0) +
          (tweet.public_metrics?.retweet_count ?? 0) * 3 +
          (tweet.public_metrics?.reply_count ?? 0);

        posts.push({
          // Strip URLs from tweet text; use first 200 chars as headline proxy
          headline: tweet.text
            .replace(/https?:\/\/\S+/g, "")
            .trim()
            .slice(0, 200),
          sourceUrl: `https://twitter.com/i/web/status/${tweet.id}`,
          engagement,
          publishedAt: tweet.created_at ?? new Date().toISOString(),
        });
      }
    } catch {
      // Silently skip — X is optional
    }
  }

  return posts;
}
