-- Migration 016: Rebuy Buch-Scraper
-- Tabellen für den automatischen Rebuy-Scraper (wöchentlich, LXC-Container)

-- ============================================================
-- Tabelle: rebuy_settings
-- Speichert Konfiguration (Schedule, Container-URL)
-- ============================================================
CREATE TABLE IF NOT EXISTS rebuy_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule TEXT NOT NULL DEFAULT 'Sun *-*-* 02:00:00',
  container_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Standard-Eintrag anlegen
INSERT INTO rebuy_settings (schedule, container_url)
VALUES ('Sun *-*-* 02:00:00', NULL)
ON CONFLICT DO NOTHING;

-- Auto-Update trigger für updated_at
CREATE OR REPLACE FUNCTION update_rebuy_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER rebuy_settings_updated_at
  BEFORE UPDATE ON rebuy_settings
  FOR EACH ROW EXECUTE FUNCTION update_rebuy_settings_updated_at();

-- RLS
ALTER TABLE rebuy_settings ENABLE ROW LEVEL SECURITY;

-- Alle authentifizierten User dürfen lesen
CREATE POLICY "rebuy_settings_select" ON rebuy_settings
  FOR SELECT TO authenticated USING (true);

-- Nur Service Role darf schreiben (via API Route)
CREATE POLICY "rebuy_settings_update" ON rebuy_settings
  FOR UPDATE TO service_role USING (true);

-- ============================================================
-- Tabelle: rebuy_scrapes
-- Scrape-Verlauf + Live-Fortschritt
-- ============================================================
CREATE TABLE IF NOT EXISTS rebuy_scrapes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scrape_date DATE,
  file_path TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'success', 'failed')),
  row_count INTEGER,
  progress_pages INTEGER,
  total_pages INTEGER,
  eta_seconds INTEGER,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index für Sortierung nach Datum
CREATE INDEX IF NOT EXISTS rebuy_scrapes_created_at_idx ON rebuy_scrapes (created_at DESC);
CREATE INDEX IF NOT EXISTS rebuy_scrapes_status_idx ON rebuy_scrapes (status);

-- RLS
ALTER TABLE rebuy_scrapes ENABLE ROW LEVEL SECURITY;

-- Alle authentifizierten User dürfen lesen
CREATE POLICY "rebuy_scrapes_select" ON rebuy_scrapes
  FOR SELECT TO authenticated USING (true);

-- Nur Service Role darf schreiben
CREATE POLICY "rebuy_scrapes_insert" ON rebuy_scrapes
  FOR INSERT TO service_role WITH CHECK (true);

CREATE POLICY "rebuy_scrapes_update" ON rebuy_scrapes
  FOR UPDATE TO service_role USING (true);

-- ============================================================
-- Storage Bucket: rebuy-results
-- Private bucket für Excel-Ergebnisdateien
-- ============================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'rebuy-results',
  'rebuy-results',
  false,
  52428800, -- 50 MB
  ARRAY['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel']
)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS: Authentifizierte User dürfen lesen
CREATE POLICY "rebuy_results_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'rebuy-results');

-- Nur Service Role darf hochladen/löschen
CREATE POLICY "rebuy_results_insert" ON storage.objects
  FOR INSERT TO service_role
  WITH CHECK (bucket_id = 'rebuy-results');

CREATE POLICY "rebuy_results_update" ON storage.objects
  FOR UPDATE TO service_role
  USING (bucket_id = 'rebuy-results');
