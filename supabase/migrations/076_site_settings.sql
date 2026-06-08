-- Migration 076: Site Settings (Schalter für öffentliche Firmen-Website)
-- Einfache Key-Value-Tabelle für globale Webseiten-Einstellungen.
-- Aktuell: landing_enabled steuert, ob die öffentliche Landing Page auf
-- primehubgbr.com sichtbar ist (Standard: aus).

CREATE TABLE IF NOT EXISTS public.site_settings (
  key         TEXT PRIMARY KEY,
  value       JSONB NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

ALTER TABLE public.site_settings ENABLE ROW LEVEL SECURITY;

-- Lesen für alle eingeloggten Nutzer (Dashboard-Anzeige).
-- Schreiben ausschließlich über Service-Role in der API (nach Admin-Check).
DROP POLICY IF EXISTS site_settings_select_auth ON public.site_settings;
CREATE POLICY site_settings_select_auth ON public.site_settings
  FOR SELECT TO authenticated USING (true);

-- Standardwert: Website aus
INSERT INTO public.site_settings (key, value) VALUES ('landing_enabled', 'false'::jsonb)
ON CONFLICT (key) DO NOTHING;
