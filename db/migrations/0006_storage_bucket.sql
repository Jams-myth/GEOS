-- article-media storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('article-media', 'article-media', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Public read access on article-media"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'article-media');

CREATE POLICY "Service role can insert into article-media"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'article-media');

CREATE POLICY "Service role can update article-media"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'article-media');
