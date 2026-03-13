-- Migration: Create user_roles table
-- Feature: PROJ-1 (N8N Workflow Hub)

CREATE TABLE user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('admin', 'staff')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id)
);

-- Index for fast lookups by user_id
CREATE INDEX idx_user_roles_user_id ON user_roles(user_id);

-- Enable Row Level Security
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;

-- SELECT: Users can only see their own role
CREATE POLICY "user_roles_select_own"
  ON user_roles
  FOR SELECT
  USING (auth.uid() = user_id);

-- INSERT/UPDATE/DELETE: Only service role (no policy = denied for all non-service-role clients)
-- Service role key bypasses RLS automatically
