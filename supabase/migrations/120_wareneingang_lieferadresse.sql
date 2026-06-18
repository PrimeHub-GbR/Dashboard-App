-- Wareneingang: Lieferadresse erfassen (wohin geliefert wird — z. B. Rilkestr. 5,
-- Elbestr. 1, Amazon-Locker …). Der N8N-AI-Parser extrahiert sie aus der Mail,
-- /api/wareneingang/ingest schreibt sie, App + Dashboard zeigen sie an.
ALTER TABLE public.wareneingang ADD COLUMN IF NOT EXISTS lieferadresse text;

DROP FUNCTION IF EXISTS public.get_wareneingang(boolean);

-- get_wareneingang um lieferadresse erweitern.
CREATE FUNCTION public.get_wareneingang(p_archived boolean DEFAULT false)
 RETURNS TABLE(id uuid, supplier text, kind text, shop text, ab_nummer text, ab_datum date, ls_nummer text, ls_datum date, paletten_erwartet integer, nettogewicht_kg numeric, order_number text, bestellt_am timestamp with time zone, tracking_number text, carrier text, carrier_code text, tracking_url text, tracking_status text, tracking_status_code text, eta_date date, eta_text text, tracking_last_event_at timestamp with time zone, lieferadresse text, status text, has_ab_pdf boolean, has_ls_pdf boolean, empfangen_von uuid, empfangen_von_name text, empfangen_am timestamp with time zone, paletten_geprueft integer, schaden boolean, notiz text, avisiert_fuer timestamp with time zone, created_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT
    w.id, w.supplier, w.kind, w.shop,
    w.ab_nummer, w.ab_datum, w.ls_nummer, w.ls_datum,
    w.paletten_erwartet, w.nettogewicht_kg,
    w.order_number, w.bestellt_am,
    w.tracking_number, w.carrier, w.carrier_code, w.tracking_url,
    w.tracking_status, w.tracking_status_code,
    w.eta_date, w.eta_text, w.tracking_last_event_at,
    w.lieferadresse,
    w.status,
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
$function$;
