-- Migration 148: Fristen-Empfaenger fuer alle Mitarbeiter + Frist -> Aufgabe
--
-- Fachlich:
--   * GF-Fristen (gf_reminders) koennen JEDEM aktiven Mitarbeiter zugewiesen
--     werden (z. B. Lexoffice-Transaktionen -> Finanzbuchhaltung), nicht mehr
--     nur GF/Manager. Die App/Web zeigen Position als Kuerzel (GF/MGR/FIBU/MA).
--   * Wird eine Frist faellig (<= 3 Tage vor Stichtag oder ueberfaellig), legt
--     das System automatisch EINE Aufgabe an (Titel = Frist, Ziel heute + 3
--     Tage, Prio hoch), zugewiesen an alle Empfaenger. Sie erscheint im
--     Aufgaben-Tab, im "Neue Aufgabe"-Popup und per Push.
--   * Aufgabe erledigt = Frist erledigt (Ack + Periode vorrollen) und umgekehrt.
--   * Ist die Aufgabe nach dem Ziel noch offen, bekommen GF/Manager einmalig
--     einen Push "Frist-Aufgabe ueberfaellig".
--
-- Technik:
--   1. get_reminder_recipient_options / _gf_normalize_recipients: alle aktiven,
--      nicht-Demo Mitarbeiter (Sortierung nach Hierarchie).
--   2. tasks.reminder_id + tasks.reminder_due (+ UNIQUE) + reminder_overdue_notified_at.
--   3. gf_reminder_create_tasks()  (service_role) — vom Cron 'gf-frist-tasks'
--      ueber Edge Function notify-scheduled (mode 'frist_tasks') aufgerufen.
--   4. gf_reminder_overdue_tasks() (service_role) — einmalige Chef-Meldung.
--   5. Trigger tasks -> done schliesst die Frist; gf_complete_reminder schliesst
--      die verknuepfte Aufgabe (Advance nur, wenn das Ack neu war).

-- ===========================================================================
-- 1. Empfaenger: alle aktiven Mitarbeiter
-- ===========================================================================
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
  ORDER BY
    CASE e.position
      WHEN 'geschaeftsfuehrer' THEN 0
      WHEN 'manager' THEN 1
      WHEN 'finanzbuchhalter' THEN 2
      ELSE 3
    END,
    e.name;
$fn$;

CREATE OR REPLACE FUNCTION public._gf_normalize_recipients(p_ids uuid[])
  RETURNS uuid[]
  LANGUAGE plpgsql STABLE
  SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE
  v_valid uuid[];
  v_input integer;
BEGIN
  SELECT count(DISTINCT x) INTO v_input FROM unnest(COALESCE(p_ids, '{}'::uuid[])) AS x;
  SELECT array_agg(DISTINCT e.id) INTO v_valid
  FROM unnest(COALESCE(p_ids, '{}'::uuid[])) AS x(id)
  JOIN public.employees e ON e.id = x.id
  WHERE e.is_active
    AND NOT e.is_demo;
  IF v_valid IS NULL OR cardinality(v_valid) < 1 THEN
    RAISE EXCEPTION 'Mindestens ein Empfaenger erforderlich';
  END IF;
  IF cardinality(v_valid) <> v_input THEN
    RAISE EXCEPTION 'Nur aktive Mitarbeiter sind als Empfaenger zulaessig';
  END IF;
  RETURN v_valid;
END;
$fn$;

-- ===========================================================================
-- 2. Verknuepfung Aufgabe <-> Frist-Periode
-- ===========================================================================
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS reminder_id uuid REFERENCES public.gf_reminders(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reminder_due date,
  ADD COLUMN IF NOT EXISTS reminder_overdue_notified_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS tasks_reminder_period_uidx
  ON public.tasks (reminder_id, reminder_due) WHERE reminder_id IS NOT NULL;

COMMENT ON COLUMN public.tasks.reminder_id IS
  'Automatisch aus einer GF-Frist (gf_reminders) erzeugte Aufgabe; reminder_due = Stichtag der Periode.';

-- ===========================================================================
-- 3. Aufgaben aus faelligen Fristen anlegen (service_role, taeglich)
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.gf_reminder_create_tasks()
  RETURNS TABLE(task_id uuid, title text, due_date date, assignee_ids uuid[])
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE
  v_today date := (now() AT TIME ZONE 'Europe/Berlin')::date;
  r record;
  v_assignees uuid[];
  v_created_by uuid;
  v_created_by_name text;
  v_task uuid;
BEGIN
  FOR r IN
    SELECT g.id, g.title, g.description, g.next_due_date, g.recipient_employee_ids, g.created_by
    FROM public.gf_reminders g
    WHERE (g.next_due_date - v_today) <= 3
      AND (g.next_due_date - v_today) >= -60
      AND NOT EXISTS (SELECT 1 FROM public.notification_acks na
                      WHERE na.notif_key = public.gf_reminder_ack_key(g.id, g.next_due_date))
      AND NOT EXISTS (SELECT 1 FROM public.tasks t
                      WHERE t.reminder_id = g.id AND t.reminder_due = g.next_due_date)
    ORDER BY g.next_due_date
  LOOP
    SELECT array_agg(e.id ORDER BY e.name) INTO v_assignees
    FROM public.employees e
    WHERE e.id = ANY (r.recipient_employee_ids) AND e.is_active AND NOT e.is_demo;
    IF v_assignees IS NULL THEN CONTINUE; END IF;

    -- Ersteller = Frist-Ersteller (GF), sonst erster aktiver GF (fuer den
    -- "heute faellig"-Push an den Vorgesetzten, siehe get_and_mark_tasks_due).
    v_created_by := r.created_by;
    IF v_created_by IS NULL OR NOT EXISTS (
         SELECT 1 FROM public.employees e WHERE e.auth_user_id = v_created_by) THEN
      SELECT e.auth_user_id INTO v_created_by FROM public.employees e
      WHERE e.position = 'geschaeftsfuehrer' AND e.is_active AND NOT e.is_demo
        AND e.auth_user_id IS NOT NULL
      ORDER BY e.name LIMIT 1;
    END IF;
    SELECT e.name INTO v_created_by_name FROM public.employees e
    WHERE e.auth_user_id = v_created_by LIMIT 1;

    INSERT INTO public.tasks (
      title, description, status, priority, due_date,
      created_by, created_by_name, is_demo, reminder_id, reminder_due
    ) VALUES (
      r.title,
      COALESCE(NULLIF(btrim(r.description), '') || E'\n\n', '')
        || 'Frist-Erinnerung · Stichtag ' || to_char(r.next_due_date, 'DD.MM.YYYY')
        || ' · bitte innerhalb von 3 Tagen erledigen.',
      'todo', 'high', v_today + 3,
      v_created_by, COALESCE(v_created_by_name, 'Fristen'), false,
      r.id, r.next_due_date
    )
    RETURNING id INTO v_task;

    INSERT INTO public.task_assignees (task_id, employee_id)
    SELECT v_task, a FROM unnest(v_assignees) AS a
    ON CONFLICT DO NOTHING;

    task_id := v_task; title := r.title; due_date := v_today + 3; assignee_ids := v_assignees;
    RETURN NEXT;
  END LOOP;
END;
$fn$;
REVOKE ALL ON FUNCTION public.gf_reminder_create_tasks() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.gf_reminder_create_tasks() TO service_role;

COMMENT ON FUNCTION public.gf_reminder_create_tasks() IS
  'Legt fuer jede faellige Frist (<= 3 Tage vor Stichtag, nicht erledigt) einmalig eine Aufgabe (Ziel heute+3, Prio hoch) fuer alle Empfaenger an. Nur service_role (Cron).';

-- ===========================================================================
-- 4. Ueberfaellige Frist-Aufgaben -> einmalige Chef-Meldung
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.gf_reminder_overdue_tasks()
  RETURNS TABLE(task_id uuid, title text, due_date date, assignee_names text, chef_ids uuid[])
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE
  v_today date := (now() AT TIME ZONE 'Europe/Berlin')::date;
  v_chefs uuid[];
  r record;
BEGIN
  SELECT array_agg(c.id) INTO v_chefs FROM public.chef_employee_ids() c(id);
  FOR r IN
    UPDATE public.tasks t
    SET reminder_overdue_notified_at = now()
    WHERE t.reminder_id IS NOT NULL
      AND t.status NOT IN ('done', 'blocked')
      AND t.due_date < v_today
      AND t.reminder_overdue_notified_at IS NULL
      AND NOT t.is_demo
    RETURNING t.id, t.title, t.due_date
  LOOP
    task_id := r.id; title := r.title; due_date := r.due_date;
    SELECT string_agg(e.name, ', ' ORDER BY e.name) INTO assignee_names
    FROM public.task_assignees ta JOIN public.employees e ON e.id = ta.employee_id
    WHERE ta.task_id = r.id;
    chef_ids := COALESCE(v_chefs, '{}');
    RETURN NEXT;
  END LOOP;
END;
$fn$;
REVOKE ALL ON FUNCTION public.gf_reminder_overdue_tasks() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.gf_reminder_overdue_tasks() TO service_role;

-- ===========================================================================
-- 5. Frist <-> Aufgabe synchron halten
-- ===========================================================================
-- Aufgabe -> done: Frist-Periode quittieren + vorrollen (nur wenn Ack neu).
CREATE OR REPLACE FUNCTION public.trg_reminder_task_done()
  RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE
  v_recur text;
  v_inserted text;
BEGIN
  IF NEW.reminder_id IS NULL OR NEW.status <> 'done'
     OR (TG_OP = 'UPDATE' AND OLD.status = 'done') THEN
    RETURN NEW;
  END IF;
  INSERT INTO public.notification_acks (notif_key, acknowledged_by)
  VALUES (public.gf_reminder_ack_key(NEW.reminder_id, NEW.reminder_due), auth.uid())
  ON CONFLICT (notif_key) DO NOTHING
  RETURNING notif_key INTO v_inserted;
  IF v_inserted IS NOT NULL THEN
    SELECT recurrence INTO v_recur FROM public.gf_reminders WHERE id = NEW.reminder_id;
    IF v_recur IS NOT NULL AND v_recur <> 'once' THEN
      UPDATE public.gf_reminders
      SET next_due_date = public.gf_reminder_advance(NEW.reminder_due, v_recur)
      WHERE id = NEW.reminder_id AND next_due_date = NEW.reminder_due;
    END IF;
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_tasks_reminder_done ON public.tasks;
CREATE TRIGGER trg_tasks_reminder_done
  AFTER UPDATE OF status ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.trg_reminder_task_done();

-- Frist erledigt (Popup/Manager-Tab) -> verknuepfte Aufgabe schliessen.
CREATE OR REPLACE FUNCTION public.gf_complete_reminder(p_id uuid)
  RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_due date;
  v_recur text;
  v_inserted text;
  v_me uuid := public.current_employee_id();
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

  -- Verknuepfte Aufgabe der Periode schliessen (Trigger findet Ack schon vor).
  UPDATE public.tasks
  SET status = 'done', completed_at = now(), completed_by = v_me, updated_at = now()
  WHERE reminder_id = p_id AND reminder_due = v_due AND status <> 'done';
END; $function$;

-- ===========================================================================
-- 6. Cron: taeglich 06:12 UTC (nach Frist-WhatsApp 06:10)
-- ===========================================================================
SELECT cron.unschedule('gf-frist-tasks')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'gf-frist-tasks');

SELECT cron.schedule(
  'gf-frist-tasks',
  '12 6 * * *',
  $cmd$
  SELECT net.http_post(
    url := 'https://tcqdyzmhwyfamzyeyskj.supabase.co/functions/v1/notify-scheduled',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || COALESCE(
        (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key'), '')
    ),
    body := jsonb_build_object('mode', 'frist_tasks')
  );
  $cmd$
);
