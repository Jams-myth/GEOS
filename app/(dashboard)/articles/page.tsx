import { getDb } from "../../../lib/db/client";
import ArticlesClient from "./ArticlesClient";

export const dynamic = "force-dynamic";

async function getArticles() {
  const db = getDb();

  const { data: articles } = await db
    .from("articles")
    .select("id, title, primary_keyword, status, published_at, created_at, url, generation_scores_jsonb")
    .neq("status", "archived")
    .order("created_at", { ascending: false });

  if (!articles || articles.length === 0) return [];

  const { data: latestAssessments } = await db
    .from("assessments")
    .select("article_id, serp_positions_jsonb, ai_citations_jsonb, week_of")
    .in("article_id", articles.map((a) => a.id))
    .order("week_of", { ascending: false });

  const latestMap = new Map<string, { serp: { position?: number | null }; citations: { perplexity?: { cited?: boolean }; openai?: { cited?: boolean }; gemini?: { cited?: boolean } } }>();
  for (const a of latestAssessments ?? []) {
    if (!a.article_id || latestMap.has(a.article_id)) continue;
    latestMap.set(a.article_id, {
      serp: (a.serp_positions_jsonb as { position?: number | null }) ?? {},
      citations: (a.ai_citations_jsonb as { perplexity?: { cited?: boolean }; openai?: { cited?: boolean }; gemini?: { cited?: boolean } }) ?? {},
    });
  }

  return articles
    .map((article) => {
      const assessment = latestMap.get(article.id);
      const citedCount = assessment
        ? [assessment.citations.perplexity, assessment.citations.openai, assessment.citations.gemini]
            .filter((c) => c?.cited).length
        : null;
      return {
        ...article,
        position: assessment?.serp?.position ?? null,
        citedCount,
        scores: (article.generation_scores_jsonb as { total?: number; accuracy_fact_checking?: number; information_density?: number; structural_machine_readability?: number; authoritative_eeat?: number; entity_optimisation?: number; directness_intent?: number; consensus_safety?: number; source_freshness?: number } | null),
      };
    })
    .filter((article) => article.scores?.total != null);
}

export default async function ArticlesPage() {
  const articles = await getArticles();
  return <ArticlesClient articles={articles} />;
}
