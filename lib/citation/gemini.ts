import { GoogleGenerativeAI } from "@google/generative-ai";
import type { CitationResult } from "./perplexity";

export async function checkGeminiCitation(
  url: string,
  keyword: string
): Promise<CitationResult> {
  const apiKey = process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) throw new Error("GOOGLE_AI_API_KEY is not set");

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-pro",
    // googleSearchRetrieval is the correct tool name in @google/generative-ai SDK
    tools: [{ googleSearchRetrieval: {} }],
  });

  const result = await model.generateContent(keyword);
  const response = result.response;

  const targetDomain = new URL(url).hostname;
  const citedUrls: string[] = [];

  // Extract grounding chunks (search results used by the model)
  const groundingMetadata = response.candidates?.[0]?.groundingMetadata;
  const chunks = groundingMetadata?.groundingChunks ?? [];

  for (const chunk of chunks) {
    const chunkUrl = chunk.web?.uri;
    if (chunkUrl) citedUrls.push(chunkUrl);
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
