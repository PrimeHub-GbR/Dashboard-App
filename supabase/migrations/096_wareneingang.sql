-- Migration 096: Wareneingang / Palettenannahme.
--
-- Verfolgt Lieferungen von Lieferanten (Start: BuchVertrieb Blank) entlang des
-- Status-Pfades  bestellt -> unterwegs -> empfangen.
--
-- Die E-Mail-Erkennung + das Parsen (Auftragsbestaetigung / Lieferschein) laeuft
-- in einem N8N-Workflow (N8N-First). N8N POSTet die geparsten Felder an
-- /api/wareneingang/ingest. Mitarbeiter bestaetigen den Empfang im Dashboard.
--
-- Zugriff ausschliesslich ueber Service-Role-API-Routen (mit Auth-Check) —
-- daher RLS an, keine public Policies.

CREATE TABLE IF NOT EXISTS public.wareneingang (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Lieferant — Default 'blank', Feld macht das Feature erweiterbar.
  supplier text NOT NULL DEFAULT 'blank',

  -- Auftragsbestaetigung
  ab_nummer text,
  ab_datum date,

  -- Lieferschein
  ls_nummer text,
  ls_datum date,

  -- Aus der Auftragsbestaetigungs-Mail geparst (Orientierung fuer den Empfang).
  paletten_erwartet integer,
  nettogewicht_kg numeric,

  -- bestellt (AB erhalten) | unterwegs (Lieferschein erhalten) | empfangen
  status text NOT NULL DEFAULT 'bestellt'
    CHECK (status IN ('bestellt', 'unterwegs', 'empfangen')),

  -- Belege (Supabase Storage, Bucket 'wareneingang-belege', bucket-relativer Key).
  ab_pdf_path text,
  ls_pdf_path text,

  -- Empfang durch Mitarbeiter
  empfangen_von uuid,
  empfangen_am timestamptz,
  paletten_geprueft integer,
  schaden boolean NOT NULL DEFAULT false,
  notiz text,

  -- Optional manuell pflegbar: vom Spediteur avisierter Anliefertermin (24h vorher).
  avisiert_fuer timestamptz,

  -- Quelle (Idempotenz / Nachvollziehbarkeit).
  gmail_message_id_ab text,
  gmail_message_id_ls text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.wareneingang ENABLE ROW LEVEL SECURITY;

-- Eine Auftragsbestaetigung pro (Lieferant, AB-Nr) — erlaubt sauberes Upsert.
CREATE UNIQUE INDEX IF NOT EXISTS uq_wareneingang_supplier_ab
  ON public.wareneingang (supplier, ab_nummer)
  WHERE ab_nummer IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_wareneingang_status
  ON public.wareneingang (status);

CREATE INDEX IF NOT EXISTS idx_wareneingang_supplier
  ON public.wareneingang (supplier);

CREATE INDEX IF NOT EXISTS idx_wareneingang_created
  ON public.wareneingang (created_at DESC);

-- updated_at automatisch pflegen.
CREATE OR REPLACE FUNCTION public.touch_wareneingang_updated_at()
  RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END; $fn$;

DROP TRIGGER IF EXISTS trg_wareneingang_updated_at ON public.wareneingang;
CREATE TRIGGER trg_wareneingang_updated_at
  BEFORE UPDATE ON public.wareneingang
  FOR EACH ROW EXECUTE FUNCTION public.touch_wareneingang_updated_at();

-- Privater Bucket fuer AB-/Lieferschein-PDFs.
INSERT INTO storage.buckets (id, name, public)
VALUES ('wareneingang-belege', 'wareneingang-belege', false)
ON CONFLICT (id) DO NOTHING;
