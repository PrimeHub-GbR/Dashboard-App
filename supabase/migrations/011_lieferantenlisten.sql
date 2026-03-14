-- Table for supplier list entries
CREATE TABLE lieferantenlisten (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lieferant TEXT NOT NULL CHECK (lieferant IN ('blank', 'a43-kulturgut', 'avus')),
  filename TEXT NOT NULL,
  file_path TEXT NOT NULL,
  bestelldatum DATE NOT NULL,
  uploaded_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE lieferantenlisten ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can read own entries"
  ON lieferantenlisten FOR SELECT
  USING (auth.uid() = uploaded_by);

CREATE POLICY "Users can insert own entries"
  ON lieferantenlisten FOR INSERT
  WITH CHECK (auth.uid() = uploaded_by);

CREATE POLICY "Users can delete own entries"
  ON lieferantenlisten FOR DELETE
  USING (auth.uid() = uploaded_by);

-- Indexes for frequently queried columns
CREATE INDEX idx_lieferantenlisten_uploaded_by ON lieferantenlisten (uploaded_by);
CREATE INDEX idx_lieferantenlisten_bestelldatum ON lieferantenlisten (bestelldatum DESC);
CREATE INDEX idx_lieferantenlisten_lieferant ON lieferantenlisten (lieferant);

-- Storage bucket for supplier list files
INSERT INTO storage.buckets (id, name, public)
VALUES ('lieferantenlisten', 'lieferantenlisten', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies
CREATE POLICY "Auth users can upload lieferantenlisten"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'lieferantenlisten');

CREATE POLICY "Auth users can read own lieferantenlisten files"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'lieferantenlisten');
