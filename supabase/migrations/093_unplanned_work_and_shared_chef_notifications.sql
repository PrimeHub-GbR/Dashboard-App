-- Migration 093: "Nicht geplant"-Erkennung + geteilte Chef-Notifications
--
-- ZWEI Themen:
--
-- (1) "NICHT GEPLANT" — Gegenstueck zum No-Show:
--     Ein Mitarbeiter HAT gearbeitet (time_entry), war aber an dem Tag NICHT
--     verplant (keine Schicht, keine eingereichte Verfuegbarkeit). Die Uhrzeit
--     ist fuer die Gegenpruefung egal — nur: verplant? nein, gearbeitet? ja.
--     -> Live-Anzeige im Zeitmanagement (Mitarbeiter -> KW -> Tag)
--     -> persistierte Events + naechtlicher Chef-Push + Chef-Glocke
--
-- (2) GETEILTE CHEF-NOTIFICATIONS mit Attribution + 2-Wochen-Historie:
--     Bisher: hakt EIN Chef eine Meldung ab, verschwindet sie fuer alle (global).
--     Neu: die Meldung bleibt fuer ALLE Chefs sichtbar; sie zeigt jetzt, WER sie
--     abgehakt hat (z.B. "erledigt von Muhammed"). Abgehakte Meldungen bleiben
--     als Historie 14 Tage sichtbar, danach verschwinden sie aus der Liste.
--     notification_acks bleibt global (erster Abhaker gewinnt = wer es erledigt
--     hat); die RPCs filtern abgehakte NICHT mehr raus, sondern liefern
--     acked_by_name + acked_at mit.

-- ===========================================================================
-- (1a) Live-RPC: wer hat in einem Zeitraum gearbeitet, war aber NICHT verplant
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.get_team_unplanned_work(p_from date, p_to date)
  RETURNS TABLE(employee_id uuid, employee_name text, day date,
                worked_from text, worked_to text)
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
AS $function$
  WITH worked AS (
    SELECT te.employee_id,
           (te.checked_in_at AT TIME ZONE 'Europe/Berlin')::date AS d,
           to_char(MIN(te.checked_in_at AT TIME ZONE 'Europe/Berlin'), 'HH24:MI') AS wf,
           to_char(MAX(COALESCE(te.checked_out_at, te.checked_in_at)
                       AT TIME ZONE 'Europe/Berlin'), 'HH24:MI') AS wt
    FROM public.time_entries te
    WHERE (te.checked_in_at AT TIME ZONE 'Europe/Berlin')::date BETWEEN p_from AND p_to
    GROUP BY te.employee_id, (te.checked_in_at AT TIME ZONE 'Europe/Berlin')::date
  )
  SELECT w.employee_id, e.name, w.d, w.wf, w.wt
  FROM worked w
  JOIN public.employees e ON e.id = w.employee_id AND NOT e.is_demo
  WHERE public.is_chef()
    -- NICHT verplant: keine Chef-Schicht an dem Tag
    AND NOT EXISTS (
      SELECT 1 FROM public.planned_shifts ps
      WHERE ps.employee_id = w.employee_id AND ps.shift_date = w.d
    )
    -- NICHT verplant: keine eingereichte Verfuegbarkeit an dem Tag
    AND NOT EXISTS (
      SELECT 1 FROM public.employee_schedule_requests esr
      CROSS JOIN LATERAL (
        VALUES (1,'mon'),(2,'tue'),(3,'wed'),(4,'thu'),(5,'fri'),(6,'sat'),(7,'sun')
      ) AS k(idx, key)
      WHERE (esr.week_start + (k.idx - 1))::date = w.d
        AND esr.availability -> k.key ->> 'from' IS NOT NULL
    )
  ORDER BY w.d, e.name;
$function$;
GRANT EXECUTE ON FUNCTION public.get_team_unplanned_work(date, date) TO authenticated;

-- ===========================================================================
-- (1b) Persistierte Events (fuer Chef-Glocke + Push), idempotent pro Tag
-- ===========================================================================
CREATE TABLE IF NOT EXISTS public.unplanned_work_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  event_date date NOT NULL,
  worked_from text,
  worked_to text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (employee_id, event_date)
);
ALTER TABLE public.unplanned_work_events ENABLE ROW LEVEL SECURITY;
-- Kein direkter Zugriff: alles laeuft ueber SECURITY DEFINER RPCs.

-- ===========================================================================
-- (1c) Intern (service_role): "nicht geplant" von GESTERN
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.get_unplanned_work_internal()
  RETURNS TABLE(employee_id uuid, employee_name text, worked_from text, worked_to text)
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
AS $function$
  WITH d AS (SELECT (now() AT TIME ZONE 'Europe/Berlin')::date - 1 AS day),
  worked AS (
    SELECT te.employee_id,
           to_char(MIN(te.checked_in_at AT TIME ZONE 'Europe/Berlin'), 'HH24:MI') AS wf,
           to_char(MAX(COALESCE(te.checked_out_at, te.checked_in_at)
                       AT TIME ZONE 'Europe/Berlin'), 'HH24:MI') AS wt
    FROM public.time_entries te, d
    WHERE (te.checked_in_at AT TIME ZONE 'Europe/Berlin')::date = d.day
    GROUP BY te.employee_id
  )
  SELECT w.employee_id, e.name, w.wf, w.wt
  FROM worked w
  JOIN public.employees e ON e.id = w.employee_id AND NOT e.is_demo
  CROSS JOIN d
  WHERE NOT EXISTS (
      SELECT 1 FROM public.planned_shifts ps
      WHERE ps.employee_id = w.employee_id AND ps.shift_date = d.day)
    AND NOT EXISTS (
      SELECT 1 FROM public.employee_schedule_requests esr
      CROSS JOIN LATERAL (
        VALUES (1,'mon'),(2,'tue'),(3,'wed'),(4,'thu'),(5,'fri'),(6,'sat'),(7,'sun')
      ) AS k(idx, key)
      WHERE (esr.week_start + (k.idx - 1))::date = d.day
        AND esr.availability -> k.key ->> 'from' IS NOT NULL)
  ORDER BY e.name;
$function$;
REVOKE ALL ON FUNCTION public.get_unplanned_work_internal() FROM public;
GRANT EXECUTE ON FUNCTION public.get_unplanned_work_internal() TO service_role;

-- ===========================================================================
-- (1d) Naechtlich (aus notify-scheduled): Events persistieren + zurueckgeben
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.record_yesterday_unplanned_work()
  RETURNS TABLE(employee_id uuid, employee_name text, worked_from text, worked_to text)
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_yday date := (now() AT TIME ZONE 'Europe/Berlin')::date - 1;
BEGIN
  INSERT INTO public.unplanned_work_events (employee_id, event_date, worked_from, worked_to)
  SELECT u.employee_id, v_yday, u.worked_from, u.worked_to
  FROM public.get_unplanned_work_internal() u
  ON CONFLICT (employee_id, event_date) DO NOTHING;

  RETURN QUERY
  SELECT e.id, e.name, uwe.worked_from, uwe.worked_to
  FROM public.unplanned_work_events uwe
  JOIN public.employees e ON e.id = uwe.employee_id
  WHERE uwe.event_date = v_yday;
END; $function$;
REVOKE ALL ON FUNCTION public.record_yesterday_unplanned_work() FROM public;
GRANT EXECUTE ON FUNCTION public.record_yesterday_unplanned_work() TO service_role;

-- ===========================================================================
-- (1e) Chef-Glocke: "nicht geplant"-Meldungen (geteilt, mit Attribution +
--      14-Tage-Historie). Ack-Key = 'unplannedwork:<event_id>'.
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.get_chef_unplanned_notifications()
  RETURNS TABLE(event_id uuid, employee_id uuid, employee_name text,
                employee_color text, event_date date,
                worked_from text, worked_to text,
                acknowledged boolean, acked_by_name text, acked_at timestamptz)
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT uwe.id, uwe.employee_id, e.name, e.color, uwe.event_date,
         uwe.worked_from, uwe.worked_to,
         (na.notif_key IS NOT NULL),
         acker.name,
         na.acknowledged_at
  FROM public.unplanned_work_events uwe
  JOIN public.employees e ON e.id = uwe.employee_id AND NOT e.is_demo
  LEFT JOIN public.notification_acks na
         ON na.notif_key = 'unplannedwork:' || uwe.id::text
  LEFT JOIN public.employees acker
         ON acker.auth_user_id = na.acknowledged_by
  WHERE public.is_chef()
    AND (
      -- offen: noch nicht abgehakt, Event der letzten 30 Tage
      (na.notif_key IS NULL
        AND uwe.event_date >= (now() AT TIME ZONE 'Europe/Berlin')::date - 30)
      -- Historie: abgehakt in den letzten 14 Tagen
      OR (na.acknowledged_at >= now() - interval '14 days')
    )
  ORDER BY (na.notif_key IS NULL) DESC, uwe.event_date DESC;
$function$;
GRANT EXECUTE ON FUNCTION public.get_chef_unplanned_notifications() TO authenticated;

-- ===========================================================================
-- (2) Task-Glocke: geteilt + Attribution + 14-Tage-Historie
--     Return-Typ aendert sich (acked_by_name, acked_at) -> DROP noetig.
-- ===========================================================================
DROP FUNCTION IF EXISTS public.get_chef_task_notifications();
CREATE FUNCTION public.get_chef_task_notifications()
  RETURNS TABLE(task_id uuid, title text, completed_at timestamptz, completed_by uuid,
                completer_name text, completer_color text, acknowledged boolean,
                acked_by_name text, acked_at timestamptz)
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT t.id, t.title, t.completed_at, t.completed_by, e.name, e.color,
         (na.notif_key IS NOT NULL),
         acker.name,
         na.acknowledged_at
  FROM public.tasks t
  JOIN public.employees e ON e.id = t.completed_by
  LEFT JOIN public.notification_acks na
         ON na.notif_key = 'taskdone:' || t.id::text
  LEFT JOIN public.employees acker
         ON acker.auth_user_id = na.acknowledged_by
  WHERE public.is_chef()
    AND t.status = 'done'
    AND t.completed_by IS NOT NULL
    AND t.completed_at IS NOT NULL
    AND COALESCE(t.is_demo, false) = false
    AND (
      (na.notif_key IS NULL AND t.completed_at >= now() - interval '30 days')
      OR (na.acknowledged_at >= now() - interval '14 days')
    )
  ORDER BY (na.notif_key IS NULL) DESC, t.completed_at DESC
  LIMIT 80;
$function$;
GRANT EXECUTE ON FUNCTION public.get_chef_task_notifications() TO authenticated;

-- ===========================================================================
-- (3) Cron: naechtlicher "nicht geplant"-Push an die Chefs (23:35 UTC).
--     Service-Role-Key aus dem Vault (wie Mig 083). Fehlt er -> 401 (harmlos).
-- ===========================================================================
SELECT cron.unschedule('notify-unplanned-work')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'notify-unplanned-work');

SELECT cron.schedule(
  'notify-unplanned-work',
  '35 23 * * *',
  $cmd$
  SELECT net.http_post(
    url := 'https://tcqdyzmhwyfamzyeyskj.supabase.co/functions/v1/notify-scheduled',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || COALESCE(
        (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key'), '')
    ),
    body := jsonb_build_object('mode', 'unplanned_work')
  );
  $cmd$
);
