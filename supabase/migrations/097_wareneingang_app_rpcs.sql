-- Migration 097: App-RPCs für Wareneingang / Bestellannahme.
--
-- Die Mitarbeiter-App (Flutter) liest die `wareneingang`-Tabelle nicht direkt
-- (RLS an, keine Policies) — Zugriff ausschliesslich ueber SECURITY-DEFINER-RPCs,
-- analog zum Lager/Reorder-Feature.
--
-- Aktiv vs. Archiv: empfangene Lieferungen aus VORHERIGEN Monaten wandern ins
-- Archiv. Offene Lieferungen (bestellt/unterwegs) bleiben immer aktiv.

-- Liste der Wareneingaenge (aktiv oder Archiv).
CREATE OR REPLACE FUNCTION public.get_wareneingang(p_archived boolean DEFAULT false)
RETURNS TABLE(
  id uuid,
  supplier text,
  ab_nummer text,
  ab_datum date,
  ls_nummer text,
  ls_datum date,
  paletten_erwartet int,
  nettogewicht_kg numeric,
  status text,
  has_ab_pdf boolean,
  has_ls_pdf boolean,
  empfangen_von uuid,
  empfangen_von_name text,
  empfangen_am timestamptz,
  paletten_geprueft int,
  schaden boolean,
  notiz text,
  avisiert_fuer timestamptz,
  created_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT
    w.id, w.supplier, w.ab_nummer, w.ab_datum, w.ls_nummer, w.ls_datum,
    w.paletten_erwartet, w.nettogewicht_kg, w.status,
    (w.ab_pdf_path IS NOT NULL) AS has_ab_pdf,
    (w.ls_pdf_path IS NOT NULL) AS has_ls_pdf,
    w.empfangen_von, e.name AS empfangen_von_name, w.empfangen_am,
    w.paletten_geprueft, w.schaden, w.notiz, w.avisiert_fuer, w.created_at
  FROM public.wareneingang w
  LEFT JOIN public.employees e ON e.auth_user_id = w.empfangen_von
  WHERE auth.uid() IS NOT NULL
    AND (
      CASE
        WHEN p_archived
          THEN w.status = 'empfangen' AND w.empfangen_am < date_trunc('month', now())
        ELSE NOT (w.status = 'empfangen' AND w.empfangen_am < date_trunc('month', now()))
      END
    )
  ORDER BY
    CASE w.status WHEN 'unterwegs' THEN 0 WHEN 'bestellt' THEN 1 ELSE 2 END,
    w.created_at DESC;
$$;
GRANT EXECUTE ON FUNCTION public.get_wareneingang(boolean) TO authenticated;

-- Mitarbeiter bestaetigt den Empfang einer Lieferung.
CREATE OR REPLACE FUNCTION public.confirm_wareneingang_receipt(
  p_id uuid,
  p_paletten int DEFAULT NULL,
  p_schaden boolean DEFAULT false,
  p_notiz text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Nicht angemeldet';
  END IF;

  UPDATE public.wareneingang
  SET status = 'empfangen',
      empfangen_von = auth.uid(),
      empfangen_am = now(),
      paletten_geprueft = p_paletten,
      schaden = COALESCE(p_schaden, false),
      notiz = NULLIF(btrim(COALESCE(p_notiz, '')), '')
  WHERE id = p_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lieferung nicht gefunden';
  END IF;
END; $$;
GRANT EXECUTE ON FUNCTION public.confirm_wareneingang_receipt(uuid, int, boolean, text) TO authenticated;
