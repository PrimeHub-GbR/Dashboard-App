-- Migration 149: Fristen = "Wiederkehrende Aufgaben" (ersetzt Aufgaben-Automatik aus 148)
--
-- Fachlich (Nutzer-Entscheidung 2026-09-20): Fristen wie Lexoffice-Buchung,
-- OSS-Meldung, Zusammenfassende Meldung sind wiederkehrend und passen nicht
-- zu den einmaligen Aufgaben. Sie erscheinen in der App im Aufgaben-Tab unter
-- der Unterrubrik "Wiederkehrend" (Stichtag, Turnus, Empfaenger, Erledigt).
-- Der Empfaenger hakt sie dort ab (gf_complete_reminder -> naechste Periode).
-- Wird eine Frist NICHT bis zum Stichtag erledigt, bekommt die
-- Geschaeftsfuehrung einmalig pro Periode einen Push.
--
-- Technik:
--   1. Aufgaben-Automatik aus 148 zurueckbauen (Cron, Funktionen, Trigger,
--      Spalten) — es wurden keine produktiven Aufgaben erzeugt.
--   2. gf_complete_reminder ohne Aufgaben-Kopplung (Advance nur bei neuem Ack).
--   3. gf_reminder_overdue_internal() (service_role): ueberfaellige, nicht
--      erledigte Fristen einmalig melden (Ack 'fristover:<id>:<due>').
--   4. Cron 'gf-frist-overdue' 06:12 UTC -> notify-scheduled mode 'frist_overdue'.
--   Die Empfaenger-Oeffnung fuer alle Mitarbeiter (148 Teil 1) bleibt.

-- ===========================================================================
-- 1. Rueckbau der Aufgaben-Automatik
-- ===========================================================================
SELECT cron.unschedule('gf-frist-tasks')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'gf-frist-tasks');

DROP TRIGGER IF EXISTS trg_tasks_reminder_done ON public.tasks;
DROP FUNCTION IF EXISTS public.trg_reminder_task_done();
DROP FUNCTION IF EXISTS public.gf_reminder_create_tasks();
DROP FUNCTION IF EXISTS public.gf_reminder_overdue_tasks();
DROP INDEX IF EXISTS public.tasks_reminder_period_uidx;
ALTER TABLE public.tasks
  DROP COLUMN IF EXISTS reminder_id,
  DROP COLUMN IF EXISTS reminder_due,
  DROP COLUMN IF EXISTS reminder_overdue_notified_at;

-- ===========================================================================
-- 2. gf_complete_reminder: Advance nur beim ersten Erledigen
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.gf_complete_reminder(p_id uuid)
  RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_due date;
  v_recur text;
  v_inserted text;
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
  ON CONFLICT (notif_key) DO NOTHING
  RETURNING notif_key INTO v_inserted;

  -- Wiederkehrend: nur beim ERSTEN Erledigen vorrollen (kein Doppel-Advance).
  IF v_inserted IS NOT NULL AND v_recur <> 'once' THEN
    UPDATE public.gf_reminders
    SET next_due_date = public.gf_reminder_advance(v_due, v_recur)
    WHERE id = p_id;
  END IF;
END; $function$;

-- ===========================================================================
-- 3. Ueberfaellige Fristen -> einmalige GF-Meldung
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.gf_reminder_overdue_internal()
  RETURNS TABLE(reminder_id uuid, title text, next_due_date date, days_overdue integer,
                recipient_names text, gf_ids uuid[])
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE
  v_today date := (now() AT TIME ZONE 'Europe/Berlin')::date;
  v_gfs uuid[];
  r record;
  v_key text;
  v_inserted text;
BEGIN
  SELECT array_agg(e.id) INTO v_gfs FROM public.employees e
  WHERE e.position = 'geschaeftsfuehrer' AND e.is_active AND NOT e.is_demo;

  FOR r IN
    SELECT g.id, g.title, g.next_due_date, g.recipient_employee_ids
    FROM public.gf_reminders g
    WHERE g.next_due_date < v_today
      AND (v_today - g.next_due_date) <= 60
      AND NOT EXISTS (SELECT 1 FROM public.notification_acks na
                      WHERE na.notif_key = public.gf_reminder_ack_key(g.id, g.next_due_date))
    ORDER BY g.next_due_date
  LOOP
    v_key := 'fristover:' || r.id::text || ':' || to_char(r.next_due_date, 'YYYY-MM-DD');
    INSERT INTO public.notification_acks (notif_key, acknowledged_by)
    VALUES (v_key, NULL)
    ON CONFLICT (notif_key) DO NOTHING
    RETURNING notif_key INTO v_inserted;
    IF v_inserted IS NULL THEN CONTINUE; END IF;  -- schon gemeldet

    reminder_id := r.id;
    title := r.title;
    next_due_date := r.next_due_date;
    days_overdue := v_today - r.next_due_date;
    SELECT string_agg(e.name, ', ' ORDER BY e.name) INTO recipient_names
    FROM public.employees e WHERE e.id = ANY (r.recipient_employee_ids);
    gf_ids := COALESCE(v_gfs, '{}');
    RETURN NEXT;
  END LOOP;
END;
$fn$;
REVOKE ALL ON FUNCTION public.gf_reminder_overdue_internal() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.gf_reminder_overdue_internal() TO service_role;

COMMENT ON FUNCTION public.gf_reminder_overdue_internal() IS
  'Ueberfaellige, nicht erledigte Fristen — einmal pro Periode (Ack fristover:) fuer den GF-Push. Nur service_role (Cron).';

-- ===========================================================================
-- 4. Cron: taeglich 06:12 UTC
-- ===========================================================================
SELECT cron.unschedule('gf-frist-overdue')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'gf-frist-overdue');

SELECT cron.schedule(
  'gf-frist-overdue',
  '12 6 * * *',
  $cmd$
  SELECT net.http_post(
    url := 'https://tcqdyzmhwyfamzyeyskj.supabase.co/functions/v1/notify-scheduled',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || COALESCE(
        (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key'), '')
    ),
    body := jsonb_build_object('mode', 'frist_overdue')
  );
  $cmd$
);
