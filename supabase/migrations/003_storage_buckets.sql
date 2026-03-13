-- Migration: Create storage buckets and RLS policies
-- Feature: PROJ-1 (N8N Workflow Hub)

-- Create private buckets for workflow file handling
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  (
    'workflow-uploads',
    'workflow-uploads',
    false,
    52428800, -- 50 MB
    ARRAY['text/csv', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel']
  ),
  (
    'workflow-results',
    'workflow-results',
    false,
    52428800, -- 50 MB
    NULL -- n8n can write any file type
  )
ON CONFLICT (id) DO NOTHING;

-- Storage RLS: Users can upload to their own folder in workflow-uploads
CREATE POLICY "uploads_insert_own"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'workflow-uploads'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Storage RLS: Users can read their own results from workflow-results
CREATE POLICY "results_select_own"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'workflow-results'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
