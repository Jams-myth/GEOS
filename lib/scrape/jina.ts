import { withRetry } from "../util/retry";

export interface JinaResult {
  content_md: string;
  source_domain: string;
}

export async function scrapeWithJina(url: string): Promise<JinaResult> {
  return withRetry(async () => {
    const jinaUrl = `https://r.jina.ai/${url}`;
    const headers: Record<string, string> = {
      Accept: "text/markdown",
    };

    if (process.env.JINA_API_KEY) {
      headers["Authorization"] = `Bearer ${process.env.JINA_API_KEY}`;
    }

    const response = await fetch(jinaUrl, { headers });

    if (!response.ok) {
      throw new Error(`Jina Reader error ${response.status} for ${url}`);
    }

    const content_md = await response.text();
    const domain = new URL(url).hostname.replace(/^www\./, "");

    return { content_md, source_domain: domain };
  });
}
