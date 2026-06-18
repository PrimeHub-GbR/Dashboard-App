-- Migration 116: GF-Fristen / Pflicht-Termine (Tab "Manager", nur GF)
--
-- Wiederkehrende Pflicht-Termine (z.B. USt-Voranmeldung, ZM, OSS).
-- "Erledigt" wird GETEILT ueber notification_acks abgehakt: hakt EIN GF die
-- aktuelle Periode ab -> gilt fuer ALLE GF. Beim naechsten Faelligkeitszyklus
-- (next_due_date rollt vor) ist die neue Periode wieder offen.
--
-- Ack-Key-Schema:  'frist:<reminder_id>:<period_token>'
--   period_token = die next_due_date (ISO) zum Zeitpunkt des Abhakens.
-- So bleibt jede Periode eine eigene Ack-Zeile; rollt das Datum vor, entsteht
-- automatisch ein neuer (noch nicht vorhandener) Key = wieder offen.

CREATE TABLE IF NOT EXISTS public.gf_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  next_due_date date NOT NULL,
  -- Wiederholung: monthly | quarterly | biweekly | yearly | once
  recurrence text NOT NULL DEFAULT 'once'
    CHECK (recurrence IN ('monthly','quarterly','biweekly','yearly','once')),
  remind_days_before integer NOT NULL DEFAULT 5 CHECK (remind_days_before >= 0),
  is_seed boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.gf_reminders ENABLE ROW LEVEL SECURITY;
-- Kein direkter Zugriff: alles laeuft ueber SECURITY DEFINER RPCs (is_gf-gated).

CREATE INDEX IF NOT EXISTS idx_gf_reminders_due ON public.gf_reminders (next_due_date);

CREATE OR REPLACE FUNCTION public.touch_gf_reminders_updated_at()
  RETURNS trigger LANGUAGE plpgsql
  SET search_path TO 'public', 'pg_temp'
AS $fn$
BEGIN NEW.updated_at := now(); RETURN NEW; END; $fn$;

DROP TRIGGER IF EXISTS trg_gf_reminders_updated_at ON public.gf_reminders;
CREATE TRIGGER trg_gf_reminders_updated_at
  BEFORE UPDATE ON public.gf_reminders
  FOR EACH ROW EXECUTE FUNCTION public.touch_gf_reminders_updated_at();

-- ---------------------------------------------------------------------------
-- Hilfsfunktion: naechstes Faelligkeitsdatum nach Rhythmus vorrollen.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.gf_reminder_advance(p_due date, p_recurrence text)
  RETURNS date LANGUAGE sql IMMUTABLE
  SET search_path TO 'public', 'pg_temp'
AS $fn$
  SELECT CASE p_recurrence
    WHEN 'monthly'   THEN (p_due + interval '1 month')::date
    WHEN 'quarterly' THEN (p_due + interval '3 months')::date
    WHEN 'biweekly'  THEN (p_due + interval '14 days')::date
    WHEN 'yearly'    THEN (p_due + interval '1 year')::date
    ELSE p_due  -- 'once': bleibt stehen
  END;
$fn$;

-- ---------------------------------------------------------------------------
-- Ack-Key fuer die aktuelle Periode eines Reminders.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.gf_reminder_ack_key(p_id uuid, p_due date)
  RETURNS text LANGUAGE sql IMMUTABLE
  SET search_path TO 'public', 'pg_temp'
AS $fn$
  SELECT 'frist:' || p_id::text || ':' || to_char(p_due, 'YYYY-MM-DD');
$fn$;

-- ===========================================================================
-- LISTE: alle Reminder mit Status der aktuellen Periode (GF-only).
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.gf_list_reminders()
  RETURNS TABLE(
    id uuid, title text, description text, next_due_date date,
    recurrence text, remind_days_before integer, is_seed boolean,
    done boolean, done_by_name text, done_at timestamptz,
    days_until integer, in_window boolean, ack_key text)
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
AS $fn$
  SELECT r.id, r.title, r.description, r.next_due_date,
         r.recurrence, r.remind_days_before, r.is_seed,
         (na.notif_key IS NOT NULL),
         acker.name,
         na.acknowledged_at,
         (r.next_due_date - (now() AT TIME ZONE 'Europe/Berlin')::date),
         ((r.next_due_date - (now() AT TIME ZONE 'Europe/Berlin')::date)
            <= r.remind_days_before),
         public.gf_reminder_ack_key(r.id, r.next_due_date)
  FROM public.gf_reminders r
  LEFT JOIN public.notification_acks na
         ON na.notif_key = public.gf_reminder_ack_key(r.id, r.next_due_date)
  LEFT JOIN public.employees acker
         ON acker.auth_user_id = na.acknowledged_by
  WHERE public.is_gf()
  ORDER BY r.next_due_date;
$fn$;
GRANT EXECUTE ON FUNCTION public.gf_list_reminders() TO authenticated;

-- ===========================================================================
-- PENDING-POPUP: offene Fristen im "X Tage vorher"-Fenster (GF-only).
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.gf_pending_reminders()
  RETURNS TABLE(id uuid, title text, description text, next_due_date date,
                days_until integer, ack_key text)
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
AS $fn$
  SELECT r.id, r.title, r.description, r.next_due_date,
         (r.next_due_date - (now() AT TIME ZONE 'Europe/Berlin')::date),
         public.gf_reminder_ack_key(r.id, r.next_due_date)
  FROM public.gf_reminders r
  WHERE public.is_gf()
    AND (r.next_due_date - (now() AT TIME ZONE 'Europe/Berlin')::date)
          <= r.remind_days_before
    AND NOT EXISTS (
      SELECT 1 FROM public.notification_acks na
      WHERE na.notif_key = public.gf_reminder_ack_key(r.id, r.next_due_date))
  ORDER BY r.next_due_date;
$fn$;
GRANT EXECUTE ON FUNCTION public.gf_pending_reminders() TO authenticated;

-- ===========================================================================
-- ABHAKEN (geteilt): aktuelle Periode erledigen + Datum vorrollen.
-- Erster GF gewinnt; wird global fuer alle GF erledigt. Bei wiederkehrenden
-- Fristen rollt next_due_date direkt auf die naechste Periode (wieder offen).
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.gf_complete_reminder(p_id uuid)
  RETURNS void LANGUAGE plpgsql SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE
  v_due date;
  v_recur text;
BEGIN
  IF NOT public.is_gf() THEN RAISE EXCEPTION 'Keine Berechtigung'; END IF;

  SELECT next_due_date, recurrence INTO v_due, v_recur
  FROM public.gf_reminders WHERE id = p_id;
  IF v_due IS NULL THEN RAISE EXCEPTION 'Frist nicht gefunden'; END IF;

  -- Ack fuer die aktuelle Periode setzen (geteilt, erster gewinnt).
  INSERT INTO public.notification_acks (notif_key, acknowledged_by)
  VALUES (public.gf_reminder_ack_key(p_id, v_due), auth.uid())
  ON CONFLICT (notif_key) DO NOTHING;

  -- Wiederkehrend: auf die naechste Periode vorrollen (neue Periode = offen).
  IF v_recur <> 'once' THEN
    UPDATE public.gf_reminders
    SET next_due_date = public.gf_reminder_advance(v_due, v_recur)
    WHERE id = p_id;
  END IF;
END; $fn$;
GRANT EXECUTE ON FUNCTION public.gf_complete_reminder(uuid) TO authenticated;

-- ===========================================================================
-- HINZUFUEGEN / BEARBEITEN / LOESCHEN (GF-only).
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.gf_add_reminder(
    p_title text, p_description text, p_next_due_date date,
    p_recurrence text, p_remind_days_before integer)
  RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE v_id uuid;
BEGIN
  IF NOT public.is_gf() THEN RAISE EXCEPTION 'Keine Berechtigung'; END IF;
  INSERT INTO public.gf_reminders
    (title, description, next_due_date, recurrence, remind_days_before, created_by)
  VALUES (p_title, NULLIF(p_description,''), p_next_due_date,
          COALESCE(p_recurrence,'once'), COALESCE(p_remind_days_before,5), auth.uid())
  RETURNING id INTO v_id;
  RETURN v_id;
END; $fn$;
GRANT EXECUTE ON FUNCTION public.gf_add_reminder(text,text,date,text,integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.gf_update_reminder(
    p_id uuid, p_title text, p_description text, p_next_due_date date,
    p_recurrence text, p_remind_days_before integer)
  RETURNS void LANGUAGE plpgsql SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
AS $fn$
BEGIN
  IF NOT public.is_gf() THEN RAISE EXCEPTION 'Keine Berechtigung'; END IF;
  UPDATE public.gf_reminders
  SET title = p_title,
      description = NULLIF(p_description,''),
      next_due_date = p_next_due_date,
      recurrence = COALESCE(p_recurrence, recurrence),
      remind_days_before = COALESCE(p_remind_days_before, remind_days_before)
  WHERE id = p_id;
END; $fn$;
GRANT EXECUTE ON FUNCTION public.gf_update_reminder(uuid,text,text,date,text,integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.gf_delete_reminder(p_id uuid)
  RETURNS void LANGUAGE plpgsql SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
AS $fn$
BEGIN
  IF NOT public.is_gf() THEN RAISE EXCEPTION 'Keine Berechtigung'; END IF;
  DELETE FROM public.gf_reminders WHERE id = p_id;
END; $fn$;
GRANT EXECUTE ON FUNCTION public.gf_delete_reminder(uuid) TO authenticated;

-- ===========================================================================
-- SEED: aktuelle deutsche Pflicht-Fristen (Stand 06/2026). Idempotent ueber
-- den Titel: nur einfuegen, wenn noch nicht vorhanden.
-- ===========================================================================
INSERT INTO public.gf_reminders
  (title, description, next_due_date, recurrence, remind_days_before, is_seed)
SELECT * FROM (VALUES
  ('USt-Voranmeldung (mit Dauerfristverlängerung)',
   'Umsatzsteuer-Voranmeldung über ELSTER. Standard: 10. des Folgemonats; mit Dauerfristverlängerung (§ 46 UStDV) plus 1 Monat. Zahllast bleibt zum 10. fällig.',
   DATE '2026-07-10', 'monthly', 5, true),
  ('Zusammenfassende Meldung (ZM)',
   'ZM an das BZSt für innergemeinschaftliche Lieferungen/Leistungen. Frist: 25. nach Meldezeitraum — keine Fristverlängerung möglich.',
   DATE '2026-07-25', 'monthly', 5, true),
  ('OSS-Meldung (One-Stop-Shop)',
   'Vierteljährliche OSS-Umsatzsteuererklärung über das BZSt-Portal (BOP). Frist: letzter Tag des auf das Quartal folgenden Monats. Auch Nullmeldung Pflicht. Q2/2026 → 31.07.2026.',
   DATE '2026-07-31', 'quarterly', 7, true),
  ('Steuererklärung 2025 (ohne Steuerberater)',
   'Einkommensteuererklärung 2025 ohne Steuerberater. Gesetzliche Abgabefrist: 31.07.2026.',
   DATE '2026-07-31', 'yearly', 14, true),
  ('Lexoffice-Transaktionen abrufen',
   'Operativer Reminder: Banktransaktionen in Lexoffice abrufen/zuordnen. Alle 2 Wochen.',
   DATE '2026-07-03', 'biweekly', 1, true)
) AS v(title, description, next_due_date, recurrence, remind_days_before, is_seed)
WHERE NOT EXISTS (
  SELECT 1 FROM public.gf_reminders g WHERE g.title = v.title);
