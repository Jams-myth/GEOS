import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";
import TurndownService from "turndown";
import { withRetry } from "../util/retry";

export interface JinaResult {
  content_md: string;
  source_domain: string;
}

const turndown = new TurndownService({ headingStyle: "atx", codeBlockStyle: "fenced" });

export async function scrapeWithJina(url: string): Promise<JinaResult> {
  return withRetry(async () => {
    const response = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; GEOSBot/1.0)" },
    });

    if (!response.ok) {
      throw new Error(`Fetch error ${response.status} for ${url}`);
    }

    const html = await response.text();
    const dom = new JSDOM(html, { url });
    const article = new Readability(dom.window.document).parse();

    if (!article?.content) {
      throw new Error(`Readability could not extract content from ${url}`);
    }

    const content_md = turndown.turndown(article.content);
    const domain = new URL(url).hostname.replace(/^www\./, "");

    return { content_md, source_domain: domain };
  });
}
