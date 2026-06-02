-- Migration 053: Kommentar-/Ersteller-Namen + Demo-Modus
--
-- 1. Denormalisierte Namen, damit Mitarbeitende sehen, von wem ein Kommentar
--    bzw. eine Aufgabe stammt. (Die employees-RLS lässt Mitarbeitende den
--    Datensatz des Chefs sonst nicht lesen -> Join lieferte "Unbekannt".)
-- 2. tasks.is_demo markiert Seed-Aufgaben des Demo-Modus.
-- 3. RPC reset_demo_data() spielt einen realistischen Datenstand für den
--    Demo-Mitarbeiter (Max Mustermitarbeiter) neu ein.

-- =========================================================================
-- 1. Denormalisierte Namen
-- =========================================================================
ALTER TABLE public.task_comments
  ADD COLUMN IF NOT EXISTS author_name TEXT;

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS created_by_name TEXT;

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS is_demo BOOLEAN NOT NULL DEFAULT false;

-- =========================================================================
-- 2a. Interne Seed-Funktion (kein Berechtigungs-Check) — wird vom initialen
--     Seed (Migration) und von reset_demo_data() aufgerufen. NICHT an
--     authenticated granted, daher von der App nicht direkt aufrufbar.
-- =========================================================================
CREATE OR REPLACE FUNCTION public._demo_seed()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_demo     UUID := 'aa000000-0000-0000-0000-000000000001';
  v_mgr_emp  UUID;
  v_mgr_auth UUID;
  v_mgr_name TEXT;
  v_monday   DATE;
  d          DATE;
  t1 UUID; t2 UUID; t3 UUID; t4 UUID;
BEGIN
  -- Vorgesetzten als Ersteller der Demo-Aufgaben ermitteln.
  SELECT reports_to INTO v_mgr_emp FROM public.employees WHERE id = v_demo;
  SELECT auth_user_id, name INTO v_mgr_auth, v_mgr_name
    FROM public.employees WHERE id = v_mgr_emp;

  -- 1) Alte Demo-Daten entfernen
  DELETE FROM public.time_entries WHERE employee_id = v_demo;
  DELETE FROM public.employee_schedule_requests WHERE employee_id = v_demo;
  DELETE FROM public.tasks WHERE is_demo = true;  -- CASCADE: assignees + comments

  -- 2) Profil auf Demo-Standard zurücksetzen
  UPDATE public.employees SET
    name                  = 'Max Mustermitarbeiter',
    position              = 'mitarbeiter',
    email                 = 'tester@primehubgbr.com',
    phone                 = '+49 170 1234567',
    home_address          = 'Musterstrasse 1, 50667 Koeln',
    target_hours_per_month= 43,
    color                 = '#3b82f6',
    birth_date            = '1996-05-14',
    is_active             = true
  WHERE id = v_demo;

  -- 3) Stempelzeiten der letzten ~3 Wochen (nur Mo–Fr, 09:00–13:00 Berlin)
  FOR d IN
    SELECT gs::date
    FROM generate_series(current_date - 18, current_date - 1, interval '1 day') AS gs
  LOOP
    IF extract(isodow FROM d) <= 5 THEN
      INSERT INTO public.time_entries
        (employee_id, checked_in_at, checked_out_at, break_minutes, auth_method, needs_review)
      VALUES (
        v_demo,
        ((d::text || ' 09:00')::timestamp AT TIME ZONE 'Europe/Berlin'),
        ((d::text || ' 13:00')::timestamp AT TIME ZONE 'Europe/Berlin'),
        0, 'pin', false
      );
    END IF;
  END LOOP;

  -- 4) Wochenplanung der aktuellen Woche
  v_monday := date_trunc('week', current_date)::date;
  INSERT INTO public.employee_schedule_requests
    (employee_id, week_start, availability, status)
  VALUES (
    v_demo, v_monday,
    '{"mon":{"from":"09:00","to":"13:00"},"tue":{"from":"09:00","to":"13:00"},"wed":{"from":"09:00","to":"13:00"},"thu":{"from":"09:00","to":"13:00"},"fri":{"from":"09:00","to":"13:00"}}'::jsonb,
    'pending'
  );

  -- 5) Realistische Aufgaben (vom Vorgesetzten zugewiesen)
  INSERT INTO public.tasks
    (title, description, status, priority, due_date, created_by, created_by_name, is_demo)
  VALUES
    ('Lagerbestand Buecher zaehlen',
     'Inventur Regal A1–A4. Bitte die gezaehlten Mengen in die Liste eintragen.',
     'todo', 'high', current_date - 1, v_mgr_auth, v_mgr_name, true)
  RETURNING id INTO t1;

  INSERT INTO public.tasks
    (title, description, status, priority, due_date, created_by, created_by_name, is_demo)
  VALUES
    ('Wareneingang pruefen und einraeumen',
     'Die heutige Lieferung kontrollieren und ins Lager einraeumen.',
     'todo', 'medium', current_date + 2, v_mgr_auth, v_mgr_name, true)
  RETURNING id INTO t2;

  INSERT INTO public.tasks
    (title, description, status, priority, due_date, created_by, created_by_name, is_demo)
  VALUES
    ('Retouren bearbeiten',
     'Eingegangene Retouren pruefen, erfassen und wieder einlagern.',
     'in_progress', 'medium', current_date + 5, v_mgr_auth, v_mgr_name, true)
  RETURNING id INTO t3;

  INSERT INTO public.tasks
    (title, description, status, priority, due_date, completed_at, completed_by,
     created_by, created_by_name, is_demo)
  VALUES
    ('Versandetiketten drucken',
     'Etiketten fuer die heutigen Bestellungen drucken und zuordnen.',
     'done', 'low', current_date - 1, now() - interval '20 hours', v_demo,
     v_mgr_auth, v_mgr_name, true)
  RETURNING id INTO t4;

  INSERT INTO public.task_assignees (task_id, employee_id) VALUES
    (t1, v_demo), (t2, v_demo), (t3, v_demo), (t4, v_demo);

  -- Ein Beispiel-Kommentar vom Chef an der ersten Aufgabe
  INSERT INTO public.task_comments
    (task_id, author_employee_id, author_name, body)
  VALUES
    (t1, v_mgr_emp, v_mgr_name,
     'Bitte zuerst Regal A1, da kommt morgen Nachschub. Danke dir!');
END;
$$;

-- =========================================================================
-- 2b. Öffentliche RPC mit Berechtigungs-Check (App ruft diese auf)
-- =========================================================================
CREATE OR REPLACE FUNCTION public.reset_demo_data()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_demo UUID := 'aa000000-0000-0000-0000-000000000001';
BEGIN
  IF NOT (public.current_employee_id() = v_demo OR public.is_admin_or_manager()) THEN
    RAISE EXCEPTION 'reset_demo_data ist nur fuer den Demo-Account erlaubt';
  END IF;
  PERFORM public._demo_seed();
END;
$$;

GRANT EXECUTE ON FUNCTION public.reset_demo_data() TO authenticated;

COMMENT ON FUNCTION public.reset_demo_data() IS
  'Setzt die Daten des Demo-Mitarbeiters (Max Mustermitarbeiter) auf einen realistischen Standardstand zurueck. Nur fuer den Demo-Account oder Admin/Manager.';
