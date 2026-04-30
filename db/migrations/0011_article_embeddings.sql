-- pgvector embedding for semantic duplicate detection
-- Requires pgvector extension (available on Supabase Free tier)
CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE articles ADD COLUMN IF NOT EXISTS body_embedding vector(1536);

CREATE INDEX IF NOT EXISTS articles_body_embedding_idx
  ON articles USING ivfflat (body_embedding vector_cosine_ops)
  WITH (lists = 100);

-- Match function: find articles within cosine similarity threshold
CREATE OR REPLACE FUNCTION match_articles(
  query_embedding vector(1536),
  match_threshold  float,
  match_count      int,
  site_id_filter   uuid DEFAULT NULL
)
RETURNS TABLE (
  id          uuid,
  title       text,
  similarity  float
)
LANGUAGE sql STABLE
AS $$
  SELECT
    a.id,
    a.title,
    1 - (a.body_embedding <=> query_embedding) AS similarity
  FROM articles a
  WHERE
    a.body_embedding IS NOT NULL
    AND 1 - (a.body_embedding <=> query_embedding) > match_threshold
    AND (site_id_filter IS NULL OR a.site_id = site_id_filter)
  ORDER BY a.body_embedding <=> query_embedding
  LIMIT match_count;
$$;
