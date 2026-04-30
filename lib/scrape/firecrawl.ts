import { withRetry } from "../util/retry";

export interface FirecrawlResult {
  content_md: string;
  source_domain: string;
}

export async function scrapeWithFirecrawl(url: string): Promise<FirecrawlResult> {
  return withRetry(async () => {
    const apiKey = process.env.FIRECRAWL_API_KEY;
    if (!apiKey) throw new Error("FIRECRAWL_API_KEY is not set");

    const response = await fetch("https://api.firecrawl.dev/v1/scrape", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        url,
        formats: ["markdown"],
        onlyMainContent: true,
      }),
    });

    if (!response.ok) {
      throw new Error(`Firecrawl error ${response.status}: ${await response.text()}`);
    }

    const data = await response.json() as { success: boolean; data?: { markdown?: string } };

    if (!data.success || !data.data?.markdown) {
      throw new Error(`Firecrawl returned no markdown for ${url}`);
    }

    const domain = new URL(url).hostname.replace(/^www\./, "");

    return {
      content_md: data.data.markdown,
      source_domain: domain,
    };
  });
}
