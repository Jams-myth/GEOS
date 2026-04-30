import pLimit from "p-limit";
import { checkPerplexityCitation } from "./perplexity";
import { checkOpenAiCitation } from "./openai";
import { checkGeminiCitation } from "./gemini";
import type { CitationResult } from "./perplexity";

export type { CitationResult };

export interface ArticleCitationResult {
  url: string;
  keyword: string;
  perplexity: CitationResult;
  openai: CitationResult;
  gemini: CitationResult;
}

export async function checkAiCitations(
  articles: Array<{ url: string; keyword: string }>
): Promise<ArticleCitationResult[]> {
  const limit = pLimit(5);

  const tasks = articles.map((article) =>
    limit(async (): Promise<ArticleCitationResult> => {
      const [perplexity, openai, gemini] = await Promise.allSettled([
        checkPerplexityCitation(article.url, article.keyword),
        checkOpenAiCitation(article.url, article.keyword),
        checkGeminiCitation(article.url, article.keyword),
      ]);

      const notCited: CitationResult = { cited: false, position: null };

      return {
        url: article.url,
        keyword: article.keyword,
        perplexity: perplexity.status === "fulfilled" ? perplexity.value : notCited,
        openai: openai.status === "fulfilled" ? openai.value : notCited,
        gemini: gemini.status === "fulfilled" ? gemini.value : notCited,
      };
    })
  );

  return Promise.all(tasks);
}
