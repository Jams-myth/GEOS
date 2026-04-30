-- Track single-use email approval tokens to prevent replay
CREATE TABLE IF NOT EXISTS consumed_approval_tokens (
  token       TEXT PRIMARY KEY,
  used_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Auto-purge tokens older than 7 days (run as a periodic job or leave to prune cron in Task 5)
CREATE INDEX IF NOT EXISTS idx_consumed_tokens_used_at ON consumed_approval_tokens (used_at);
