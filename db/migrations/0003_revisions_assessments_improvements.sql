-- Revisions, assessments, and improvements
CREATE TABLE revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id uuid REFERENCES articles(id) ON DELETE CASCADE,
  version int NOT NULL,
  body_md text NOT NULL,
  editor_scores_jsonb jsonb,
  editor_notes text,
  source_type text CHECK (source_type IN ('generation', 'revision', 'improvement', 'rollback')),
  created_at timestamptz DEFAULT now()
);

CREATE TABLE assessments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id uuid REFERENCES articles(id) ON DELETE CASCADE,
  week_of date NOT NULL,
  gsc_data_jsonb jsonb DEFAULT '{}',
  ga4_data_jsonb jsonb DEFAULT '{}',
  serp_positions_jsonb jsonb DEFAULT '{}',
  ai_citations_jsonb jsonb DEFAULT '{}',
  recommendations_jsonb jsonb DEFAULT '[]',
  batch_request_id text,
  created_at timestamptz DEFAULT now(),
  UNIQUE(article_id, week_of)
);

CREATE TABLE improvements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id uuid REFERENCES articles(id) ON DELETE CASCADE,
  assessment_id uuid REFERENCES assessments(id),
  proposed_changes_jsonb jsonb NOT NULL,
  gemini_review_jsonb jsonb,
  expected_impact text,
  estimated_position_gain int DEFAULT 0,
  article_version_at_proposal int NOT NULL,
  status text NOT NULL DEFAULT 'pending_approval' CHECK (status IN ('pending_approval', 'approved', 'applied', 'rejected', 'expired', 'rolled_back')),
  approval_token text UNIQUE,
  approval_expires_at timestamptz,
  approved_by text,
  approved_at timestamptz,
  approval_channel text CHECK (approval_channel IN ('discord', 'email', 'dashboard')),
  rejection_reason text,
  applied_at timestamptz,
  rollback_revision_id uuid REFERENCES revisions(id),
  inngest_run_id text,
  created_at timestamptz DEFAULT now()
);
