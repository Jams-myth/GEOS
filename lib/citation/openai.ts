import OpenAI from "openai";
import type { CitationResult } from "./perplexity";

export async function checkOpenAiCitation(
  url: string,
  keyword: string
): Promise<CitationResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set");

  const client = new OpenAI({ apiKey });
  const targetDomain = new URL(url).hostname;

  const response = await client.responses.create({
    model: "gpt-4o",
    tools: [{ type: "web_search_preview" }],
    input: `${keyword}`,
  });

  // Extract URLs from output annotations
  // response.output is Array<ResponseOutputItem> — only 'message' items carry content
  const citedUrls: string[] = [];
  for (const item of response.output ?? []) {
    if (item.type !== "message") continue;
    for (const content of item.content ?? []) {
      if (content.type !== "output_text") continue;
      for (const annotation of content.annotations ?? []) {
        if (annotation.type === "url_citation") {
          citedUrls.push(annotation.url);
        }
      }
    }
  }

  const position = citedUrls.findIndex((c) => {
    try {
      return new URL(c).hostname === targetDomain;
    } catch {
      return false;
    }
  });

  return {
    cited: position !== -1,
    position: position !== -1 ? position + 1 : null,
  };
}
