-- API batch cost logging
CREATE TABLE api_batch_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service text NOT NULL,
  batch_size int NOT NULL DEFAULT 1,
  request_at timestamptz DEFAULT now(),
  response_time_ms int,
  cost_estimate numeric(10,6) DEFAULT 0
);
