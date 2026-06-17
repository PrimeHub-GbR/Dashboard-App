-- Migration 098: Wareneingang erweitern für allgemeine Bestellungen (Amazon, eBay & Co.)
-- mit Sendungsverfolgung (Live-Status + geplanter Liefertag via Tracking-Aggregator).
--
-- Bisher: Paletten-Lieferungen von Blank (kind 'palette').
-- Neu: Pakete (kind 'paket') mit Sendungsnummer/Carrier/Live-Status/ETA.

ALTER TABLE public.wareneingang
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'palette'
    CHECK (kind IN ('palette', 'paket')),
  ADD COLUMN IF NOT EXISTS shop text,                 -- Händler/Absender-Anzeigename (Amazon.de, eBay …)
  ADD COLUMN IF NOT EXISTS order_number text,         -- Bestellnummer des Shops
  ADD COLUMN IF NOT EXISTS bestellt_am timestamptz,
  ADD COLUMN IF NOT EXISTS tracking_number text,
  ADD COLUMN IF NOT EXISTS carrier text,              -- Anzeigename (DHL, DPD …)
  ADD COLUMN IF NOT EXISTS carrier_code text,         -- normalisiert (dhl, dpd, hermes, gls, ups, amazon …)
  ADD COLUMN IF NOT EXISTS tracking_url text,
  ADD COLUMN IF NOT EXISTS tracking_status text,      -- letzter Klartext-Status vom Carrier
  -- normalisiert: pending | info_received | in_transit | out_for_delivery | delivered | exception | expired
  ADD COLUMN IF NOT EXISTS tracking_status_code text,
  ADD COLUMN IF NOT EXISTS eta_date date,
  ADD COLUMN IF NOT EXISTS eta_text text,
  ADD COLUMN IF NOT EXISTS tracking_last_event_at timestamptz,
  ADD COLUMN IF NOT EXISTS tracking_last_checked timestamptz,
  ADD COLUMN IF NOT EXISTS sender_email text,
  ADD COLUMN IF NOT EXISTS betreff text;

-- Sendungsnummer eindeutig (erlaubt Upsert per Tracking, Dedup gegen mehrere Mails).
CREATE UNIQUE INDEX IF NOT EXISTS uq_wareneingang_tracking
  ON public.wareneingang (tracking_number)
  WHERE tracking_number IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_wareneingang_kind ON public.wareneingang (kind);
CREATE INDEX IF NOT EXISTS idx_wareneingang_order ON public.wareneingang (supplier, order_number);

-- get_wareneingang neu (Return-Typ um Paket-/Tracking-Felder erweitert) ----------
DROP FUNCTION IF EXISTS public.get_wareneingang(boolean);
CREATE FUNCTION public.get_wareneingang(p_archived boolean DEFAULT false)
RETURNS TABLE(
  id uuid, supplier text, kind text, shop text,
  ab_nummer text, ab_datum date, ls_nummer text, ls_datum date,
  paletten_erwartet int, nettogewicht_kg numeric,
  order_number text, bestellt_am timestamptz,
  tracking_number text, carrier text, carrier_code text, tracking_url text,
  tracking_status text, tracking_status_code text,
  eta_date date, eta_text text, tracking_last_event_at timestamptz,
  status text, has_ab_pdf boolean, has_ls_pdf boolean,
  empfangen_von uuid, empfangen_von_name text, empfangen_am timestamptz,
  paletten_geprueft int, schaden boolean, notiz text, avisiert_fuer timestamptz,
  created_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT
    w.id, w.supplier, w.kind, w.shop,
    w.ab_nummer, w.ab_datum, w.ls_nummer, w.ls_datum,
    w.paletten_erwartet, w.nettogewicht_kg,
    w.order_number, w.bestellt_am,
    w.tracking_number, w.carrier, w.carrier_code, w.tracking_url,
    w.tracking_status, w.tracking_status_code,
    w.eta_date, w.eta_text, w.tracking_last_event_at,
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
$$;
GRANT EXECUTE ON FUNCTION public.get_wareneingang(boolean) TO authenticated;
