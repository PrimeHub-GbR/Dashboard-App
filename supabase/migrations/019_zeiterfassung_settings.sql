-- Migration 019: Zeiterfassungssystem — Einstellungen + Realtime

-- ============================================================
-- Tabelle: time_tracking_settings (Singleton)
-- Globale Systemeinstellungen für das Zeiterfassungssystem
-- ============================================================
CREATE TABLE time_tracking_settings (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  overtime_threshold_hours  NUMERIC(5,2) NOT NULL DEFAULT 10.0,
  break_trigger_hours       NUMERIC(4,2) NOT NULL DEFAULT 6.0,
  n8n_webhook_url           TEXT,
  notification_enabled      BOOLEAN NOT NULL DEFAULT false,
  kiosk_pin_length          INTEGER NOT NULL DEFAULT 4,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Singleton-Datensatz einfügen
INSERT INTO time_tracking_settings (
  overtime_threshold_hours,
  break_trigger_hours,
  kiosk_pin_length
) VALUES (10.0, 6.0, 4);

ALTER TABLE time_tracking_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "time_tracking_settings_select_authenticated" ON time_tracking_settings
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "time_tracking_settings_update_service_role" ON time_tracking_settings
  FOR UPDATE TO service_role USING (true);

CREATE OR REPLACE FUNCTION update_time_tracking_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER time_tracking_settings_updated_at
  BEFORE UPDATE ON time_tracking_settings
  FOR EACH ROW EXECUTE FUNCTION update_time_tracking_settings_updated_at();


-- ============================================================
-- Supabase Realtime für Live-Übersicht aktivieren
-- ============================================================
ALTER PUBLICATION supabase_realtime ADD TABLE time_entries;
ALTER PUBLICATION supabase_realtime ADD TABLE employees;
