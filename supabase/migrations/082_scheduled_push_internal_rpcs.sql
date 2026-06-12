-- Migration 082: Interne RPCs fuer die zeitgesteuerten Push-Jobs.
-- Kein is_chef-Gate (laufen aus Edge Function mit service_role).

-- Chef-/Manager-Mitarbeiter-IDs
CREATE OR REPLACE FUNCTION public.chef_employee_ids()
RETURNS TABLE(id uuid)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT e.id FROM public.employees e
  WHERE NOT e.is_demo AND (
    e.position IN ('geschaeftsfuehrer','manager')
    OR EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = e.auth_user_id AND ur.role IN ('admin','manager')
    )
  );
$$;
REVOKE ALL ON FUNCTION public.chef_employee_ids() FROM public;
GRANT EXECUTE ON FUNCTION public.chef_employee_ids() TO service_role;

-- No-Shows von GESTERN (Berlin): verplant aber nicht eingestempelt/abwesend.
CREATE OR REPLACE FUNCTION public.get_no_shows_internal()
RETURNS TABLE(employee_id uuid, employee_name text,
              planned_from text, planned_to text)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  WITH d AS (SELECT (now() AT TIME ZONE 'Europe/Berlin')::date - 1 AS day),
  shift_commit AS (
    SELECT ps.employee_id,
           to_char(ps.start_time,'HH24:MI') AS pf,
           to_char(ps.end_time,'HH24:MI') AS pt,
           'shift'::text AS src
    FROM public.planned_shifts ps, d WHERE ps.shift_date = d.day
  ),
  avail_commit AS (
    SELECT esr.employee_id,
           esr.availability -> k.key ->> 'from' AS pf,
           esr.availability -> k.key ->> 'to' AS pt,
           'availability'::text AS src
    FROM public.employee_schedule_requests esr, d
    CROSS JOIN LATERAL (
      VALUES (1,'mon'),(2,'tue'),(3,'wed'),(4,'thu'),(5,'fri'),(6,'sat'),(7,'sun')
    ) AS k(idx, key)
    WHERE (esr.week_start + (k.idx - 1)) = d.day
      AND esr.availability -> k.key ->> 'from' IS NOT NULL
  ),
  commit_all AS (
    SELECT * FROM shift_commit UNION ALL SELECT * FROM avail_commit
  ),
  commit_dedup AS (
    SELECT DISTINCT ON (c.employee_id) c.employee_id, c.pf, c.pt
    FROM commit_all c ORDER BY c.employee_id, (c.src='shift') DESC
  )
  SELECT cd.employee_id, e.name, cd.pf, cd.pt
  FROM commit_dedup cd
  JOIN public.employees e ON e.id = cd.employee_id AND NOT e.is_demo
  CROSS JOIN d
  WHERE NOT EXISTS (
      SELECT 1 FROM public.time_entries te
      WHERE te.employee_id = cd.employee_id
        AND (te.checked_in_at AT TIME ZONE 'Europe/Berlin')::date = d.day)
    AND NOT EXISTS (
      SELECT 1 FROM public.absence_requests ar
      WHERE ar.employee_id = cd.employee_id AND ar.status = 'approved'
        AND d.day BETWEEN ar.start_date AND ar.end_date)
  ORDER BY e.name;
$$;
REVOKE ALL ON FUNCTION public.get_no_shows_internal() FROM public;
GRANT EXECUTE ON FUNCTION public.get_no_shows_internal() TO service_role;

-- Mitarbeiter, die den naechsten Monat noch nicht voll verplant haben.
CREATE OR REPLACE FUNCTION public.get_planning_due_internal()
RETURNS TABLE(employee_id uuid, employee_name text,
              target_hours numeric, planned_hours numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_month date := date_trunc('month', current_date)::date + interval '1 month';
  v_keys text[] := ARRAY['mon','tue','wed','thu','fri','sat','sun'];
  emp record; r record; v_net int; v_from int; v_to int; v_gross int;
BEGIN
  FOR emp IN
    SELECT e.id, e.name, COALESCE(e.target_hours_per_month,0) AS tgt
    FROM public.employees e
    WHERE NOT e.is_demo AND COALESCE(e.target_hours_per_month,0) > 0
      AND NOT (
        e.position IN ('geschaeftsfuehrer','manager')
        OR EXISTS (SELECT 1 FROM public.user_roles ur
                   WHERE ur.user_id = e.auth_user_id AND ur.role IN ('admin','manager'))
      )
  LOOP
    v_net := 0;
    FOR r IN
      SELECT esr.week_start, esr.availability
      FROM public.employee_schedule_requests esr
      WHERE esr.employee_id = emp.id
        AND esr.week_start BETWEEN v_month - 7 AND (v_month + interval '1 month')::date
    LOOP
      FOR i IN 1..7 LOOP
        IF (r.week_start + (i-1)) >= v_month
           AND (r.week_start + (i-1)) < (v_month + interval '1 month')::date THEN
          v_from := public._hhmm_min(r.availability -> v_keys[i] ->> 'from');
          v_to   := public._hhmm_min(r.availability -> v_keys[i] ->> 'to');
          IF v_from IS NOT NULL AND v_to IS NOT NULL AND v_to > v_from THEN
            v_gross := v_to - v_from;
            v_net := v_net + v_gross - public._arbzg_break(v_gross);
          END IF;
        END IF;
      END LOOP;
    END LOOP;
    IF (v_net / 60.0) < emp.tgt THEN
      employee_id := emp.id; employee_name := emp.name;
      target_hours := emp.tgt; planned_hours := round((v_net/60.0)::numeric,1);
      RETURN NEXT;
    END IF;
  END LOOP;
END; $$;
REVOKE ALL ON FUNCTION public.get_planning_due_internal() FROM public;
GRANT EXECUTE ON FUNCTION public.get_planning_due_internal() TO service_role;
