-- Per-site monthly LLM cost cap (USD). NULL = no cap enforced.
ALTER TABLE sites ADD COLUMN IF NOT EXISTS monthly_cost_cap_usd NUMERIC(10,2) DEFAULT NULL;
