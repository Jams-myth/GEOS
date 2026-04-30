-- Token usage tracking: per-call LLM cost logging
-- Pruned by prune-database after 365 days (retention policy in prune-database.ts)
CREATE TABLE IF NOT EXISTS token_usage_logs (
  id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id    UUID          REFERENCES articles(id) ON DELETE SET NULL,
  function_name TEXT          NOT NULL,
  step_name     TEXT          NOT NULL,
  model         TEXT          NOT NULL,
  input_tokens  INTEGER       NOT NULL DEFAULT 0,
  output_tokens INTEGER       NOT NULL DEFAULT 0,
  cost_usd      NUMERIC(10,6) NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS token_usage_logs_article_id_idx  ON token_usage_logs (article_id);
CREATE INDEX IF NOT EXISTS token_usage_logs_created_at_idx  ON token_usage_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS token_usage_logs_model_idx       ON token_usage_logs (model);
