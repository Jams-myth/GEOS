-- RLS policies
ALTER TABLE articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE sites ENABLE ROW LEVEL SECURITY;
ALTER TABLE keyword_clusters ENABLE ROW LEVEL SECURITY;
ALTER TABLE topic_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE improvements ENABLE ROW LEVEL SECURITY;
ALTER TABLE source_scrapes ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_batch_logs ENABLE ROW LEVEL SECURITY;

-- Anon key: read-only on published articles (live site)
CREATE POLICY "Anon read published articles"
  ON articles FOR SELECT
  TO anon
  USING (status = 'published');

-- Service role bypasses RLS by default in Supabase (no explicit policy needed)
-- Authenticated users (dashboard): full access
CREATE POLICY "Authenticated users full access on articles"
  ON articles FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);
