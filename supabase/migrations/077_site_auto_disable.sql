-- Migration 077: Auto-Deaktivierung der öffentlichen Website
-- Sicherheitsnetz: Die Landingpage schaltet sich nach X Tagen automatisch ab,
-- falls der Admin das manuelle Deaktivieren vergisst.
--
-- Neue site_settings-Keys:
--   auto_disable_enabled (bool)  — Automatik aktiv? (Standard: true)
--   auto_disable_days    (number)— Frist in Tagen (Standard: 5)
--   auto_disable_at      (string)— ISO-Zeitpunkt der Abschaltung; Zeile existiert
--                                  NUR wenn eine Frist läuft (kein Wert = keine Frist)

INSERT INTO public.site_settings (key, value) VALUES
  ('auto_disable_enabled', 'true'::jsonb),
  ('auto_disable_days',    '5'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- Die Website ist aktuell aktiv → Frist auf jetzt + 5 Tage setzen.
INSERT INTO public.site_settings (key, value)
VALUES ('auto_disable_at', to_jsonb((now() + interval '5 days')::text))
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
