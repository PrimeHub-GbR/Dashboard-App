-- Migration 074: Force-Update-Gate.
-- Die App vergleicht ihre eigene Build-Nummer mit min_build pro Plattform.
-- Liegt sie darunter, blockiert die App mit einem Update-Hinweis. min_build
-- wird per SQL/Dashboard erhoeht (kein Release noetig). Standard 0 = blockiert
-- nichts.
--
-- Mindest-Build setzen (Beispiel, sperrt alles unter Build 50 auf iOS):
--   UPDATE public.app_version_gate SET min_build = 50, updated_at = now()
--   WHERE platform = 'ios';

CREATE TABLE IF NOT EXISTS public.app_version_gate (
  platform   text PRIMARY KEY CHECK (platform IN ('ios','android')),
  min_build  integer NOT NULL DEFAULT 0,
  store_url  text,
  message    text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.app_version_gate (platform, min_build, store_url) VALUES
  ('ios', 0, 'https://apps.apple.com/app/id6775537632'),
  ('android', 0, 'https://play.google.com/store/apps/details?id=de.primehubgbr.primehubApp')
ON CONFLICT (platform) DO NOTHING;

ALTER TABLE public.app_version_gate ENABLE ROW LEVEL SECURITY;
-- Keine RLS-Policies: Schreiben nur ueber Service-Role / SQL (sicher).
-- Gelesen wird ausschliesslich ueber die SECURITY-DEFINER-RPC unten.

-- Read-RPC: auch fuer NICHT eingeloggte Nutzer (anon), damit das Gate schon
-- vor dem Login greift.
CREATE OR REPLACE FUNCTION public.get_app_version_gate(p_platform text)
RETURNS TABLE(min_build integer, store_url text, message text)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT g.min_build, g.store_url, g.message
  FROM public.app_version_gate g
  WHERE g.platform = p_platform;
$$;
GRANT EXECUTE ON FUNCTION public.get_app_version_gate(text) TO anon, authenticated;
