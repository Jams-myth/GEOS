-- Sites, keyword clusters, topic candidates
CREATE TABLE sites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  domain text NOT NULL UNIQUE,
  supabase_config_jsonb jsonb,
  vercel_config_jsonb jsonb,
  indexing_adapters text[] DEFAULT '{}',
  brand_voice text,
  structure_template_jsonb jsonb,
  default_author_jsonb jsonb,
  notification_config_jsonb jsonb,
  approval_config_jsonb jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE keyword_clusters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id uuid REFERENCES sites(id) ON DELETE CASCADE,
  primary_keyword text NOT NULL,
  related_keywords text[] DEFAULT '{}',
  priority int DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE topic_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id uuid REFERENCES sites(id) ON DELETE CASCADE,
  headline text NOT NULL,
  sources_jsonb jsonb DEFAULT '[]',
  score numeric DEFAULT 0,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'selected', 'published', 'rejected', 'superseded', 'expired')),
  discovered_at timestamptz DEFAULT now()
);
