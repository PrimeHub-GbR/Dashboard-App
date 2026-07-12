-- Migration 131: GF-Fristen — pro Termin auswaehlbare Empfaenger (GF/Manager).
--
-- Bisher gingen Pop-up, Glocke und WhatsApp/Push-Erinnerungen an ALLE GF.
-- Neu: jede Frist hat eine Pflicht-Empfaengerliste (>= 1) aus GF + Managern.
--   * Verwalten (add/update/delete) bleibt GF-only.
--   * gf_pending_reminders (Pop-up) liefert nur Termine, bei denen der
--     Aufrufer Empfaenger ist — auch fuer Manager aufrufbar.
--   * gf_list_reminders: GF sehen alle (can_manage=true), Manager nur die
--     eigenen (read-only).
--   * gf_complete_reminder (geteiltes Abhaken) darf jeder Empfaenger.

-- ---------------------------------------------------------------------------
-- 1) Spalte + Backfill (bestehende Eintraege: alle GF) + Pflicht-Constraint
-- ---------------------------------------------------------------------------
ALTER TABLE public.gf_reminders
  ADD COLUMN IF NOT EXISTS recipient_employee_ids uuid[];

UPDATE public.gf_reminders
SET recipient_employee_ids = COALESCE(
  (SELECT array_agg(e.id) FROM public.employees e
   WHERE e.position = 'geschaeftsfuehrer' AND NOT e.is_demo),
  '{}'::uuid[])
WHERE recipient_employee_ids IS NULL;

ALTER TABLE public.gf_reminders
  ALTER COLUMN recipient_employee_ids SET NOT NULL;

DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conname = 'gf_reminders_recipients_not_empty') THEN
    ALTER TABLE public.gf_reminders
      ADD CONSTRAINT gf_reminders_recipients_not_empty
      CHECK (cardinality(recipient_employee_ids) >= 1);
  END IF;
END $do$;

-- ---------------------------------------------------------------------------
-- 2) Helper: Empfaengerliste normalisieren + validieren.
--    Erlaubt sind nur GF/Manager (nicht Demo); Duplikate werden entfernt.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._gf_normalize_recipients(p_ids uuid[])
  RETURNS uuid[] LANGUAGE plpgsql STABLE SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE
  v_valid uuid[];
  v_input integer;
BEGIN
  SELECT count(DISTINCT x) INTO v_input
  FROM unnest(COALESCE(p_ids, '{}'::uuid[])) AS x;

  SELECT array_agg(DISTINCT e.id) INTO v_valid
  FROM unnest(COALESCE(p_ids, '{}'::uuid[])) AS x(id)
  JOIN public.employees e ON e.id = x.id
  WHERE e.position IN ('geschaeftsfuehrer', 'manager')
    AND NOT e.is_demo;

  IF v_valid IS NULL OR cardinality(v_valid) < 1 THEN
    RAISE EXCEPTION 'Mindestens ein Empfaenger (GF oder Manager) erforderlich';
  END IF;
  IF cardinality(v_valid) <> v_input THEN
    RAISE EXCEPTION 'Nur GF/Manager sind als Empfaenger zulaessig';
  END IF;
  RETURN v_valid;
END; $fn$;

-- ---------------------------------------------------------------------------
-- 3) Auswahlliste fuers Formular: alle aktiven GF + Manager (is_gf-gated,
--    da nur GF Termine verwalten).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_reminder_recipient_options()
  RETURNS TABLE(id uuid, name text, "position" text)
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
AS $fn$
  SELECT e.id, e.name, e.position
  FROM public.employees e
  WHERE public.is_gf()
    AND e.is_active
    AND NOT e.is_demo
    AND e.position IN ('geschaeftsfuehrer', 'manager')
  ORDER BY (e.position = 'geschaeftsfuehrer') DESC, e.name;
$fn$;
GRANT EXECUTE ON FUNCTION public.get_reminder_recipient_options() TO authenticated;

-- ---------------------------------------------------------------------------
-- 4) HINZUFUEGEN / BEARBEITEN — neue Signaturen mit Pflicht-Empfaengern
--    (GF-only). Alte Signaturen entfernen, damit kein Weg ohne Empfaenger
--    uebrig bleibt.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.gf_add_reminder(text, text, date, text, integer);

CREATE FUNCTION public.gf_add_reminder(
    p_title text, p_description text, p_next_due_date date,
    p_recurrence text, p_remind_days_before integer, p_recipient_ids uuid[])
  RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE
  v_id uuid;
  v_recipients uuid[];
BEGIN
  IF NOT public.is_gf() THEN RAISE EXCEPTION 'Keine Berechtigung'; END IF;
  v_recipients := public._gf_normalize_recipients(p_recipient_ids);
  INSERT INTO public.gf_reminders
    (title, description, next_due_date, recurrence, remind_days_before,
     recipient_employee_ids, created_by)
  VALUES (p_title, NULLIF(p_description, ''), p_next_due_date,
          COALESCE(p_recurrence, 'once'), COALESCE(p_remind_days_before, 5),
          v_recipients, auth.uid())
  RETURNING id INTO v_id;
  RETURN v_id;
END; $fn$;
GRANT EXECUTE ON FUNCTION
  public.gf_add_reminder(text, text, date, text, integer, uuid[])
  TO authenticated;

DROP FUNCTION IF EXISTS
  public.gf_update_reminder(uuid, text, text, date, text, integer);

CREATE FUNCTION public.gf_update_reminder(
    p_id uuid, p_title text, p_description text, p_next_due_date date,
    p_recurrence text, p_remind_days_before integer, p_recipient_ids uuid[])
  RETURNS void LANGUAGE plpgsql SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE
  v_recipients uuid[];
BEGIN
  IF NOT public.is_gf() THEN RAISE EXCEPTION 'Keine Berechtigung'; END IF;
  v_recipients := public._gf_normalize_recipients(p_recipient_ids);
  UPDATE public.gf_reminders
  SET title = p_title,
      description = NULLIF(p_description, ''),
      next_due_date = p_next_due_date,
      recurrence = COALESCE(p_recurrence, recurrence),
      remind_days_before = COALESCE(p_remind_days_before, remind_days_before),
      recipient_employee_ids = v_recipients
  WHERE id = p_id;
END; $fn$;
GRANT EXECUTE ON FUNCTION
  public.gf_update_reminder(uuid, text, text, date, text, integer, uuid[])
  TO authenticated;

-- ---------------------------------------------------------------------------
-- 5) PENDING-POPUP: nur Termine, bei denen der Aufrufer Empfaenger ist.
--    Aufrufbar fuer alle authenticated — der Filter auf die eigene
--    employee_id uebernimmt die Zugriffskontrolle (Nicht-Empfaenger: leer).
-- ---------------------------------------------------------------------------
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
  JOIN public.employees me ON me.auth_user_id = auth.uid()
  WHERE me.id = ANY(r.recipient_employee_ids)
    AND (r.next_due_date - (now() AT TIME ZONE 'Europe/Berlin')::date)
          <= r.remind_days_before
    AND NOT EXISTS (
      SELECT 1 FROM public.notification_acks na
      WHERE na.notif_key = public.gf_reminder_ack_key(r.id, r.next_due_date))
  ORDER BY r.next_due_date;
$fn$;
GRANT EXECUTE ON FUNCTION public.gf_pending_reminders() TO authenticated;

-- ---------------------------------------------------------------------------
-- 6) LISTE: GF = alle Termine (can_manage=true), Manager = nur eigene
--    (read-only). Neue Spalten: Empfaenger-IDs, -Namen, can_manage.
--    Return-Typ aendert sich -> DROP + CREATE.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.gf_list_reminders();

CREATE FUNCTION public.gf_list_reminders()
  RETURNS TABLE(
    id uuid, title text, description text, next_due_date date,
    recurrence text, remind_days_before integer, is_seed boolean,
    done boolean, done_by_name text, done_at timestamptz,
    days_until integer, in_window boolean, ack_key text,
    recipient_ids uuid[], recipient_names text[], can_manage boolean)
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
         public.gf_reminder_ack_key(r.id, r.next_due_date),
         r.recipient_employee_ids,
         (SELECT array_agg(e.name ORDER BY e.name)
          FROM public.employees e
          WHERE e.id = ANY(r.recipient_employee_ids)),
         public.is_gf()
  FROM public.gf_reminders r
  LEFT JOIN public.notification_acks na
         ON na.notif_key = public.gf_reminder_ack_key(r.id, r.next_due_date)
  LEFT JOIN public.employees acker
         ON acker.auth_user_id = na.acknowledged_by
  WHERE public.is_gf()
     OR EXISTS (
       SELECT 1 FROM public.employees me
       WHERE me.auth_user_id = auth.uid()
         AND me.id = ANY(r.recipient_employee_ids))
  ORDER BY r.next_due_date;
$fn$;
GRANT EXECUTE ON FUNCTION public.gf_list_reminders() TO authenticated;

-- ---------------------------------------------------------------------------
-- 7) ABHAKEN: jeder Empfaenger darf (geteilt — einer hakt ab, gilt fuer alle).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.gf_complete_reminder(p_id uuid)
  RETURNS void LANGUAGE plpgsql SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE
  v_due date;
  v_recur text;
BEGIN
  IF NOT public.is_gf() AND NOT EXISTS (
      SELECT 1 FROM public.gf_reminders r
      JOIN public.employees me ON me.auth_user_id = auth.uid()
      WHERE r.id = p_id AND me.id = ANY(r.recipient_employee_ids)) THEN
    RAISE EXCEPTION 'Keine Berechtigung';
  END IF;

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
