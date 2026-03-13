-- Migration: Create jobs table with enums
-- Feature: PROJ-1 (N8N Workflow Hub)

-- Custom enum types
CREATE TYPE job_status AS ENUM ('pending', 'running', 'success', 'failed', 'timeout');
CREATE TYPE workflow_key AS ENUM ('sellerboard', 'kulturgut', 'a43-export', 'avus-export', 'blank-export');

CREATE TABLE jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workflow_key workflow_key NOT NULL,
  input_file_url TEXT,
  result_file_url TEXT,
  status job_status NOT NULL DEFAULT 'pending',
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for common query patterns
CREATE INDEX idx_jobs_user_id ON jobs(user_id);
CREATE INDEX idx_jobs_created_at ON jobs(created_at DESC);
CREATE INDEX idx_jobs_status ON jobs(status);

-- Auto-update updated_at on row changes
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER jobs_updated_at
  BEFORE UPDATE ON jobs
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- Enable Row Level Security
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;

-- SELECT: Users can only see their own jobs
CREATE POLICY "jobs_select_own"
  ON jobs
  FOR SELECT
  USING (auth.uid() = user_id);

-- INSERT: Authenticated users can create jobs (only for themselves)
CREATE POLICY "jobs_insert_own"
  ON jobs
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- UPDATE/DELETE: Only service role (callback updates via server-side code)
-- Service role key bypasses RLS automatically
