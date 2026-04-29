-- Source scrape cache
CREATE TABLE source_scrapes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  url text NOT NULL,
  url_hash text NOT NULL UNIQUE,
  content_md text NOT NULL,
  source_domain text NOT NULL,
  authority_score int DEFAULT 5,
  scraped_at timestamptz DEFAULT now(),
  expires_at timestamptz NOT NULL
);

CREATE INDEX idx_source_scrapes_url_hash ON source_scrapes(url_hash);
CREATE INDEX idx_source_scrapes_expires_at ON source_scrapes(expires_at);
