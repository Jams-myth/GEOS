import { withRetry } from "../util/retry";

export interface CitationResult {
  cited: boolean;
  position: number | null;
}

export async function checkPerplexityCitation(
  url: string,
  keyword: string
): Promise<CitationResult> {
  const apiKey = process.env.PERPLEXITY_API_KEY;
  if (!apiKey) return { cited: false, position: null };

  return withRetry(async () => {

    const response = await fetch("https://api.perplexity.ai/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "sonar-pro",
        messages: [
          {
            role: "user",
            content: `${keyword}`,
          },
        ],
        return_citations: true,
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok) {
      throw new Error(`Perplexity API error: ${response.status}`);
    }

    const data = (await response.json()) as {
      citations?: string[];
      choices?: Array<{ message?: { content?: string } }>;
    };

    const citations = data.citations ?? [];
    const targetDomain = new URL(url).hostname;

    const position = citations.findIndex((c) => {
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
  });
}
