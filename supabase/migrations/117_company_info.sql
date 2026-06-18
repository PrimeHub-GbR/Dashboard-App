-- Migration 117: Firmeninfos (Tab "Manager", nur GF, kopierbar, erweiterbar).
--
-- Schluessel/Wert-Eintraege, die der GF schnell kopieren kann (USt-IdNr.,
-- App-IDs, Team-ID etc.). GF kann eigene Eintraege hinzufuegen/bearbeiten/loeschen.

CREATE TABLE IF NOT EXISTS public.company_info (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text NOT NULL,
  value text NOT NULL DEFAULT '',
  -- optionale Gruppierung fuer die UI (z.B. 'Steuer', 'App', 'Allgemein')
  category text NOT NULL DEFAULT 'Allgemein',
  sort_order integer NOT NULL DEFAULT 100,
  is_seed boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.company_info ENABLE ROW LEVEL SECURITY;
-- Kein direkter Zugriff: alles ueber SECURITY DEFINER RPCs (is_gf-gated).

CREATE OR REPLACE FUNCTION public.touch_company_info_updated_at()
  RETURNS trigger LANGUAGE plpgsql
  SET search_path TO 'public', 'pg_temp'
AS $fn$
BEGIN NEW.updated_at := now(); RETURN NEW; END; $fn$;

DROP TRIGGER IF EXISTS trg_company_info_updated_at ON public.company_info;
CREATE TRIGGER trg_company_info_updated_at
  BEFORE UPDATE ON public.company_info
  FOR EACH ROW EXECUTE FUNCTION public.touch_company_info_updated_at();

CREATE OR REPLACE FUNCTION public.gf_list_company_info()
  RETURNS TABLE(id uuid, label text, value text, category text,
                sort_order integer, is_seed boolean)
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
AS $fn$
  SELECT id, label, value, category, sort_order, is_seed
  FROM public.company_info
  WHERE public.is_gf()
  ORDER BY sort_order, label;
$fn$;
GRANT EXECUTE ON FUNCTION public.gf_list_company_info() TO authenticated;

CREATE OR REPLACE FUNCTION public.gf_add_company_info(
    p_label text, p_value text, p_category text)
  RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE v_id uuid;
BEGIN
  IF NOT public.is_gf() THEN RAISE EXCEPTION 'Keine Berechtigung'; END IF;
  INSERT INTO public.company_info (label, value, category, created_by)
  VALUES (p_label, COALESCE(p_value,''), COALESCE(NULLIF(p_category,''),'Allgemein'), auth.uid())
  RETURNING id INTO v_id;
  RETURN v_id;
END; $fn$;
GRANT EXECUTE ON FUNCTION public.gf_add_company_info(text,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.gf_update_company_info(
    p_id uuid, p_label text, p_value text, p_category text)
  RETURNS void LANGUAGE plpgsql SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
AS $fn$
BEGIN
  IF NOT public.is_gf() THEN RAISE EXCEPTION 'Keine Berechtigung'; END IF;
  UPDATE public.company_info
  SET label = p_label, value = COALESCE(p_value,''),
      category = COALESCE(NULLIF(p_category,''), category)
  WHERE id = p_id;
END; $fn$;
GRANT EXECUTE ON FUNCTION public.gf_update_company_info(uuid,text,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.gf_delete_company_info(p_id uuid)
  RETURNS void LANGUAGE plpgsql SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
AS $fn$
BEGIN
  IF NOT public.is_gf() THEN RAISE EXCEPTION 'Keine Berechtigung'; END IF;
  DELETE FROM public.company_info WHERE id = p_id;
END; $fn$;
GRANT EXECUTE ON FUNCTION public.gf_delete_company_info(uuid) TO authenticated;

-- SEED bekannter Werte (idempotent ueber label). Steuernummer + EORI leer.
INSERT INTO public.company_info (label, value, category, sort_order, is_seed)
SELECT * FROM (VALUES
  ('USt-IdNr.',            'DE455808625',                  'Steuer', 10, true),
  ('Steuernummer',        '',                             'Steuer', 20, true),
  ('EORI-Nr.',            '',                             'Steuer', 30, true),
  ('Apple App Store App-ID', '6775537632',                'App',    40, true),
  ('Apple Team-ID',       'K2AZPZ6A9L',                    'App',    50, true),
  ('Android-Package',     'de.primehubgbr.primehub_app',  'App',    60, true)
) AS v(label, value, category, sort_order, is_seed)
WHERE NOT EXISTS (
  SELECT 1 FROM public.company_info c WHERE c.label = v.label);
