-- Migration 046: Kommunikation-Einstellungen (Singleton)
-- Feature: kommunikation/whatsapp — editierbare Standard-Fußzeile

CREATE TABLE IF NOT EXISTS kommunikation_settings (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_footer TEXT NOT NULL DEFAULT '',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Standard-Eintrag mit der bisherigen fest verdrahteten Fußzeile
INSERT INTO kommunikation_settings (message_footer)
SELECT 'Bitte antworten Sie nicht auf diese Nachricht. Bei Rückfragen wenden Sie sich an Ihren Manager.'
WHERE NOT EXISTS (SELECT 1 FROM kommunikation_settings);

-- Auto-Update von updated_at
CREATE OR REPLACE FUNCTION update_kommunikation_settings_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS kommunikation_settings_updated_at ON kommunikation_settings;
CREATE TRIGGER kommunikation_settings_updated_at
  BEFORE UPDATE ON kommunikation_settings
  FOR EACH ROW EXECUTE FUNCTION update_kommunikation_settings_updated_at();

-- RLS
ALTER TABLE kommunikation_settings ENABLE ROW LEVEL SECURITY;

-- Alle authentifizierten User dürfen lesen
CREATE POLICY "kommunikation_settings_select" ON kommunikation_settings
  FOR SELECT TO authenticated USING (true);

-- Nur Service Role darf schreiben (via API Route mit Admin/Manager-Check)
CREATE POLICY "kommunikation_settings_update" ON kommunikation_settings
  FOR UPDATE TO service_role USING (true);
