-- Migration 033: Neue Kontaktfelder + Dokumentenpfade + Geschäftsadresse entfernen

-- 1. Neue Pflichtfelder (nullable, da bestehende Datensätze vorhanden)
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS tax_number          TEXT,
  ADD COLUMN IF NOT EXISTS phone               TEXT,
  ADD COLUMN IF NOT EXISTS email               TEXT,
  ADD COLUMN IF NOT EXISTS arbeitsvertrag_path TEXT,
  ADD COLUMN IF NOT EXISTS personalfragebogen_path TEXT;

-- 2. Geschäftsadresse entfernen
ALTER TABLE employees DROP COLUMN IF EXISTS work_address;

-- 3. Storage Bucket für Mitarbeiter-Dokumente
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'employee-documents',
  'employee-documents',
  false,
  10485760,  -- 10 MB
  ARRAY['application/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- 4. RLS für employee-documents Bucket
CREATE POLICY "Authenticated users can upload employee documents"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'employee-documents');

CREATE POLICY "Authenticated users can read employee documents"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'employee-documents');

CREATE POLICY "Authenticated users can update employee documents"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'employee-documents');

CREATE POLICY "Authenticated users can delete employee documents"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'employee-documents');
