-- Migration 081
--  (1) Server-Sperre: Mitarbeiter darf laufende + naechste Woche nicht aendern
--  (2) get_team_no_shows: geplant aber nicht eingestempelt (Chef-Ansicht)
--  (3) get_my_planning_gate: Pflicht-Popup "Stunden noch nicht voll verplant"

-- Hilfsfunktion: "HH:MM" -> Minuten
CREATE OR REPLACE FUNCTION public._hhmm_min(p text)
RETURNS int LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN p IS NULL OR position(':' in p) = 0 THEN NULL
    ELSE split_part(p,':',1)::int * 60 + split_part(p,':',2)::int
  END;
$$;

-- ArbZG-Pause: <=6h 0, <=9h 30, sonst 45
CREATE OR REPLACE FUNCTION public._arbzg_break(gross_min int)
RETURNS int LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN gross_min <= 360 THEN 0
              WHEN gross_min <= 540 THEN 30 ELSE 45 END;
$$;

-- (1) Trigger: Selbst-Aenderung an fixierten Wochen blockieren.
CREATE OR REPLACE FUNCTION public.enforce_schedule_freeze()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_this_monday date := current_date - (EXTRACT(ISODOW FROM current_date)::int - 1);
BEGIN
  -- Chef/Manager duerfen immer (laeuft ueber admin_edit_employee_day).
  IF public.is_chef() THEN RETURN NEW; END IF;
  -- Laufende + naechste Woche sind fix: aenderbar erst ab Montag+14.
  IF NEW.week_start < v_this_monday + 14 THEN
    RAISE EXCEPTION 'Diese Woche ist fixiert. Kurzfristige Aenderungen bitte direkt mit dem Chef absprechen.';
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_enforce_schedule_freeze ON public.employee_schedule_requests;
CREATE TRIGGER trg_enforce_schedule_freeze
  BEFORE INSERT OR UPDATE ON public.employee_schedule_requests
  FOR EACH ROW EXECUTE FUNCTION public.enforce_schedule_freeze();

-- (2) No-Shows: an vergangenen Tagen verplant (Chef-Schicht ODER eingereichte
--     Verfuegbarkeit) aber NICHT eingestempelt und NICHT abwesend.
CREATE OR REPLACE FUNCTION public.get_team_no_shows(p_from date, p_to date)
RETURNS TABLE(employee_id uuid, employee_name text, day date,
              planned_from text, planned_to text, source text)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  WITH days AS (
    SELECT generate_series(p_from, LEAST(p_to, current_date - 1), interval '1 day')::date AS d
  ),
  shift_commit AS (
    SELECT ps.employee_id, ps.shift_date AS d,
           to_char(ps.start_time,'HH24:MI') AS pf,
           to_char(ps.end_time,'HH24:MI') AS pt,
           'shift'::text AS src
    FROM public.planned_shifts ps
    WHERE ps.shift_date BETWEEN p_from AND current_date - 1
  ),
  avail_commit AS (
    SELECT esr.employee_id,
           (esr.week_start + (k.idx - 1))::date AS d,
           esr.availability -> k.key ->> 'from' AS pf,
           esr.availability -> k.key ->> 'to' AS pt,
           'availability'::text AS src
    FROM public.employee_schedule_requests esr
    CROSS JOIN LATERAL (
      VALUES (1,'mon'),(2,'tue'),(3,'wed'),(4,'thu'),(5,'fri'),(6,'sat'),(7,'sun')
    ) AS k(idx, key)
    WHERE esr.availability -> k.key ->> 'from' IS NOT NULL
      AND (esr.week_start + (k.idx - 1))::date BETWEEN p_from AND current_date - 1
  ),
  commit_all AS (
    SELECT * FROM shift_commit
    UNION ALL
    SELECT * FROM avail_commit
  ),
  commit_dedup AS (
    SELECT DISTINCT ON (c.employee_id, c.d)
           c.employee_id, c.d, c.pf, c.pt, c.src
    FROM commit_all c
    JOIN days dy ON dy.d = c.d
    ORDER BY c.employee_id, c.d, (c.src = 'shift') DESC
  )
  SELECT cd.employee_id, e.name, cd.d, cd.pf, cd.pt, cd.src
  FROM commit_dedup cd
  JOIN public.employees e ON e.id = cd.employee_id AND NOT e.is_demo
  WHERE public.is_chef()
    AND NOT EXISTS (
      SELECT 1 FROM public.time_entries te
      WHERE te.employee_id = cd.employee_id
        AND (te.checked_in_at AT TIME ZONE 'Europe/Berlin')::date = cd.d
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.absence_requests ar
      WHERE ar.employee_id = cd.employee_id
        AND ar.status = 'approved'
        AND cd.d BETWEEN ar.start_date AND ar.end_date
    )
  ORDER BY cd.d, e.name;
$$;
GRANT EXECUTE ON FUNCTION public.get_team_no_shows(date, date) TO authenticated;

-- (3) Planungs-Gate: braucht der eingeloggte Mitarbeiter noch Planung?
CREATE OR REPLACE FUNCTION public.get_my_planning_gate()
RETURNS TABLE(needs_planning boolean, target_hours numeric,
              planned_hours numeric, month_label text, target_month date)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_emp uuid; v_target numeric; v_month date; v_net int := 0;
  v_from int; v_to int; v_gross int; r record;
  v_keys text[] := ARRAY['mon','tue','wed','thu','fri','sat','sun'];
BEGIN
  SELECT id, COALESCE(target_hours_per_month, 0)
    INTO v_emp, v_target
  FROM public.employees WHERE auth_user_id = auth.uid();

  IF v_emp IS NULL OR public.is_chef() OR v_target <= 0 THEN
    RETURN QUERY SELECT false, COALESCE(v_target,0), 0::numeric, ''::text, NULL::date;
    RETURN;
  END IF;

  v_month := date_trunc('month', current_date)::date + interval '1 month';

  FOR r IN
    SELECT esr.week_start, esr.availability
    FROM public.employee_schedule_requests esr
    WHERE esr.employee_id = v_emp
      AND esr.week_start BETWEEN v_month - 7 AND (v_month + interval '1 month')::date
  LOOP
    FOR i IN 1..7 LOOP
      IF (r.week_start + (i - 1)) >= v_month
         AND (r.week_start + (i - 1)) < (v_month + interval '1 month')::date THEN
        v_from := public._hhmm_min(r.availability -> v_keys[i] ->> 'from');
        v_to   := public._hhmm_min(r.availability -> v_keys[i] ->> 'to');
        IF v_from IS NOT NULL AND v_to IS NOT NULL AND v_to > v_from THEN
          v_gross := v_to - v_from;
          v_net := v_net + v_gross - public._arbzg_break(v_gross);
        END IF;
      END IF;
    END LOOP;
  END LOOP;

  RETURN QUERY SELECT
    (EXTRACT(DAY FROM current_date)::int >= 20
      AND (v_net / 60.0) < v_target),
    v_target,
    round((v_net / 60.0)::numeric, 1),
    to_char(v_month, 'TMMonth YYYY'),
    v_month;
END; $$;
GRANT EXECUTE ON FUNCTION public.get_my_planning_gate() TO authenticated;
