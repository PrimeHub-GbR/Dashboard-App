-- Migration 094: WhatsApp-Vorlagen (Templates) im Dashboard verwalten.
--
-- Templates werden im Dashboard angelegt, bei Meta eingereicht (via N8N) und
-- ihr Genehmigungs-Status zurueckgespiegelt. Genehmigte Templates koennen dann
-- proaktiv (ausserhalb des 24h-Fensters) an Mitarbeiter gesendet werden.
--
-- Zugriff ausschliesslich ueber Service-Role-API-Routen (mit Auth-Check) —
-- daher RLS an, keine public Policies.

CREATE TABLE IF NOT EXISTS public.whatsapp_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Meta-Template-Name: nur Kleinbuchstaben, Ziffern, Unterstriche.
  name text NOT NULL UNIQUE,
  -- Freundlicher Anzeigename fuer die UI (optional).
  display_name text,
  category text NOT NULL DEFAULT 'UTILITY'
    CHECK (category IN ('UTILITY', 'MARKETING', 'AUTHENTICATION')),
  language text NOT NULL DEFAULT 'de',
  -- Body mit Platzhaltern {{1}}, {{2}} …
  body_text text NOT NULL,
  variables_count integer NOT NULL DEFAULT 0,
  -- Beispielwerte fuer die Platzhalter (fuer Metas Pruefung) als JSON-Array.
  example_values jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- LOCAL_PENDING (noch nicht bei Meta) | PENDING | APPROVED | REJECTED
  -- | PAUSED | DISABLED | DELETED | ERROR
  status text NOT NULL DEFAULT 'LOCAL_PENDING',
  meta_template_id text,
  -- Ablehnungsgrund / Fehlertext.
  status_detail text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.whatsapp_templates ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_whatsapp_templates_status
  ON public.whatsapp_templates (status);

-- updated_at automatisch pflegen.
CREATE OR REPLACE FUNCTION public.touch_whatsapp_templates_updated_at()
  RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END; $fn$;

DROP TRIGGER IF EXISTS trg_whatsapp_templates_updated_at ON public.whatsapp_templates;
CREATE TRIGGER trg_whatsapp_templates_updated_at
  BEFORE UPDATE ON public.whatsapp_templates
  FOR EACH ROW EXECUTE FUNCTION public.touch_whatsapp_templates_updated_at();
