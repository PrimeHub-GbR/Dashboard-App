-- 129: ArbZG-Pausenanerkennung — nur Luecken von mindestens 15 Minuten am Stueck
-- zaehlen als genommene Pause (§4 ArbZG: Pausenbloecke min. 15 Minuten).
--
-- Bisher: anerkannte Pause = gesamte Lueckenzeit des Tages (span - gross).
-- Neu:    anerkannte Pause = SUM(Luecke zwischen aufeinanderfolgenden Stempelungen
--         desselben Berlin-Tags, WENN Luecke >= 15 min) via LAG-Window.
-- Luecken < 15 min sind weiterhin keine Arbeitszeit (nicht gestempelt), decken
-- aber die Pflichtpause (>6h: 30 min, >9h: 45 min) nicht mehr ab.
--
-- Angepasste Funktionen (alle mit Tages-Netto-Formel span-gross):
--   get_employee_balance, get_all_employees_month_hours,
--   get_month_completion_facts, get_employee_archive_days
-- (get_employee_archive / get_employee_archive_monthly delegieren an
--  get_employee_balance und erben den Fix automatisch.)

-- ---------------------------------------------------------------------------
-- get_employee_balance
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_employee_balance(p_employee_id uuid, p_period_start date, p_period_end date)
 RETURNS TABLE(employee_id uuid, period_start date, period_end date, ist_minutes integer, soll_minutes integer, diff_minutes integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_caller_emp_id UUID;
  v_schedule JSONB;
  v_ist_minutes INTEGER;
  v_soll_minutes INTEGER;
  v_pauschal_minutes INTEGER;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_period_end < p_period_start THEN RAISE EXCEPTION 'period_end must be >= period_start'; END IF;

  v_caller_emp_id := public.current_employee_id();
  IF NOT (
    public.is_chef()
    OR p_employee_id = v_caller_emp_id
    OR EXISTS (SELECT 1 FROM public.employees WHERE id = p_employee_id AND reports_to = v_caller_emp_id)
  ) THEN
    RAISE EXCEPTION 'Access denied for employee %', p_employee_id;
  END IF;

  SELECT weekly_schedule INTO v_schedule FROM public.employees WHERE id = p_employee_id;
  IF v_schedule IS NULL THEN RAISE EXCEPTION 'Employee % not found', p_employee_id; END IF;

  WITH entry_gaps AS (
    SELECT
      (te.checked_in_at AT TIME ZONE 'Europe/Berlin')::date AS work_day,
      EXTRACT(EPOCH FROM (te.checked_out_at - te.checked_in_at)) / 60.0 AS dur,
      GREATEST(0, EXTRACT(EPOCH FROM (te.checked_in_at - LAG(te.checked_out_at) OVER (
        PARTITION BY (te.checked_in_at AT TIME ZONE 'Europe/Berlin')::date
        ORDER BY te.checked_in_at
      ))) / 60.0) AS gap
    FROM public.time_entries te
    WHERE te.employee_id = p_employee_id
      AND te.checked_in_at >= p_period_start::TIMESTAMPTZ
      AND te.checked_in_at < (p_period_end + 1)::TIMESTAMPTZ
      AND te.checked_out_at IS NOT NULL
  ),
  daily AS (
    SELECT work_day,
      SUM(dur) AS gross,
      COALESCE(SUM(gap) FILTER (WHERE gap >= 15), 0) AS taken_break
    FROM entry_gaps
    GROUP BY 1
  )
  SELECT COALESCE(SUM(
    gross - GREATEST(0,
      (GREATEST(0, LEAST(30, gross - 360)) + GREATEST(0, LEAST(15, gross - 540)))
      - taken_break
    )
  ), 0)::INTEGER
  INTO v_ist_minutes
  FROM daily;

  SELECT COALESCE(SUM(pe.minutes), 0)::INTEGER
  INTO v_pauschal_minutes
  FROM public.pauschal_entries pe
  WHERE pe.employee_id = p_employee_id
    AND pe.status = 'approved'
    AND pe.datum BETWEEN p_period_start AND p_period_end;

  v_ist_minutes := v_ist_minutes + v_pauschal_minutes;

  WITH days AS (
    SELECT generate_series(p_period_start, p_period_end, '1 day'::interval)::DATE AS d
  )
  SELECT COALESCE(SUM(
    (CASE EXTRACT(DOW FROM days.d)::INTEGER
      WHEN 1 THEN COALESCE((v_schedule->>'mon')::NUMERIC, 0)
      WHEN 2 THEN COALESCE((v_schedule->>'tue')::NUMERIC, 0)
      WHEN 3 THEN COALESCE((v_schedule->>'wed')::NUMERIC, 0)
      WHEN 4 THEN COALESCE((v_schedule->>'thu')::NUMERIC, 0)
      WHEN 5 THEN COALESCE((v_schedule->>'fri')::NUMERIC, 0)
      WHEN 6 THEN COALESCE((v_schedule->>'sat')::NUMERIC, 0)
      WHEN 0 THEN COALESCE((v_schedule->>'sun')::NUMERIC, 0)
      ELSE 0 END) * 60
  ), 0)::INTEGER
  INTO v_soll_minutes
  FROM days;

  RETURN QUERY SELECT p_employee_id, p_period_start, p_period_end,
    v_ist_minutes, v_soll_minutes, (v_ist_minutes - v_soll_minutes);
END;
$function$;

-- ---------------------------------------------------------------------------
-- get_all_employees_month_hours
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_all_employees_month_hours(p_year integer, p_month integer, p_include_demo boolean DEFAULT false)
 RETURNS TABLE(employee_id uuid, employee_name text, employee_color text, target_hours_per_month numeric, total_work_minutes bigint, total_break_minutes bigint, total_pauschal_minutes bigint, entry_count bigint)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  WITH entry_gaps AS (
    SELECT t.employee_id AS emp_id,
      (t.checked_in_at AT TIME ZONE 'Europe/Berlin')::date AS work_day,
      EXTRACT(EPOCH FROM (t.checked_out_at - t.checked_in_at)) / 60.0 AS dur,
      GREATEST(0, EXTRACT(EPOCH FROM (t.checked_in_at - LAG(t.checked_out_at) OVER (
        PARTITION BY t.employee_id, (t.checked_in_at AT TIME ZONE 'Europe/Berlin')::date
        ORDER BY t.checked_in_at
      ))) / 60.0) AS gap
    FROM time_entries t
    WHERE t.checked_out_at IS NOT NULL
      AND EXTRACT(YEAR FROM t.checked_in_at AT TIME ZONE 'Europe/Berlin') = p_year
      AND EXTRACT(MONTH FROM t.checked_in_at AT TIME ZONE 'Europe/Berlin') = p_month
  ),
  daily AS (
    SELECT emp_id, work_day,
      SUM(dur) AS gross,
      COALESCE(SUM(gap) FILTER (WHERE gap >= 15), 0) AS taken_break,
      COUNT(*) AS cnt
    FROM entry_gaps
    GROUP BY 1, 2
  ),
  per_emp AS (
    SELECT emp_id, SUM(gross) AS work_minutes,
      SUM(GREATEST(0, (CASE WHEN gross <= 360 THEN 0 WHEN gross <= 540 THEN 30 ELSE 45 END)
        - taken_break)) AS break_minutes,
      SUM(cnt) AS entry_count
    FROM daily GROUP BY emp_id
  ),
  pauschal AS (
    SELECT pe.employee_id AS emp_id, SUM(pe.minutes) AS pauschal_minutes
    FROM pauschal_entries pe
    WHERE pe.status = 'approved'
      AND EXTRACT(YEAR FROM pe.datum) = p_year
      AND EXTRACT(MONTH FROM pe.datum) = p_month
    GROUP BY pe.employee_id
  )
  SELECT e.id, e.name, e.color, e.target_hours_per_month,
    (COALESCE(pe.work_minutes, 0) + COALESCE(pa.pauschal_minutes, 0))::BIGINT,
    COALESCE(pe.break_minutes, 0)::BIGINT,
    COALESCE(pa.pauschal_minutes, 0)::BIGINT,
    COALESCE(pe.entry_count, 0)::BIGINT
  FROM employees e
  LEFT JOIN per_emp pe ON pe.emp_id = e.id
  LEFT JOIN pauschal pa ON pa.emp_id = e.id
  WHERE e.is_active = true AND e.position != 'geschaeftsfuehrer'
    AND (p_include_demo OR NOT e.is_demo)
  ORDER BY e.name;
$function$;

-- ---------------------------------------------------------------------------
-- get_month_completion_facts (Mig 125 — eigene break_minutes-Berechnung)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_month_completion_facts(p_employee_id uuid, p_period_start date, p_period_end date)
 RETURNS TABLE(employee_id uuid, period_start date, period_end date, ist_minutes integer, soll_minutes integer, reached boolean, worked_days integer, avg_minutes_per_day integer, break_minutes integer, vacation_days integer, sick_days integer, unpaid_days integer, completed_tasks integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_caller_emp_id uuid;
  v_ist  integer;
  v_soll integer;
  v_worked integer;
  v_break  integer;
  v_vac    integer;
  v_sick   integer;
  v_unpaid integer;
  v_tasks  integer;
BEGIN
  IF p_period_end < p_period_start THEN
    RAISE EXCEPTION 'period_end must be >= period_start' USING ERRCODE = '22023';
  END IF;

  IF auth.uid() IS NOT NULL THEN
    v_caller_emp_id := public.current_employee_id();
    IF NOT (
      public.is_chef()
      OR p_employee_id = v_caller_emp_id
      OR EXISTS (SELECT 1 FROM public.employees WHERE id = p_employee_id AND reports_to = v_caller_emp_id)
    ) THEN
      RAISE EXCEPTION 'Access denied for employee %', p_employee_id USING ERRCODE = '42501';
    END IF;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.employees WHERE id = p_employee_id) THEN
    RAISE EXCEPTION 'employee not found: %', p_employee_id USING ERRCODE = 'P0002';
  END IF;

  SELECT b.ist_minutes, b.soll_minutes INTO v_ist, v_soll
  FROM public.get_employee_balance(p_employee_id, p_period_start, p_period_end) b;
  v_ist  := COALESCE(v_ist, 0);
  v_soll := COALESCE(v_soll, 0);

  WITH entry_gaps AS (
    SELECT
      (te.checked_in_at AT TIME ZONE 'Europe/Berlin')::date AS work_day,
      EXTRACT(EPOCH FROM (te.checked_out_at - te.checked_in_at)) / 60.0 AS dur,
      GREATEST(0, EXTRACT(EPOCH FROM (te.checked_in_at - LAG(te.checked_out_at) OVER (
        PARTITION BY (te.checked_in_at AT TIME ZONE 'Europe/Berlin')::date
        ORDER BY te.checked_in_at
      ))) / 60.0) AS gap
    FROM public.time_entries te
    WHERE te.employee_id = p_employee_id
      AND te.checked_in_at >= p_period_start::TIMESTAMPTZ
      AND te.checked_in_at < (p_period_end + 1)::TIMESTAMPTZ
      AND te.checked_out_at IS NOT NULL
  ),
  daily AS (
    SELECT work_day,
      SUM(dur) AS gross,
      COALESCE(SUM(gap) FILTER (WHERE gap >= 15), 0) AS taken_break
    FROM entry_gaps
    GROUP BY 1
  )
  SELECT
    COUNT(*)::int,
    COALESCE(SUM(
      GREATEST(0,
        (GREATEST(0, LEAST(30, gross - 360)) + GREATEST(0, LEAST(15, gross - 540)))
        - taken_break
      )
    ), 0)::int
  INTO v_worked, v_break
  FROM daily;

  SELECT
    COALESCE(SUM(CASE WHEN x.type = 'urlaub'    THEN x.wd ELSE 0 END), 0)::int,
    COALESCE(SUM(CASE WHEN x.type = 'krankheit' THEN x.wd ELSE 0 END), 0)::int,
    COALESCE(SUM(CASE WHEN x.type = 'sonstige'  THEN x.wd ELSE 0 END), 0)::int
  INTO v_vac, v_sick, v_unpaid
  FROM (
    SELECT a.type,
           public._absence_workdays(
             p_employee_id,
             GREATEST(a.start_date, p_period_start),
             LEAST(a.end_date, p_period_end)
           ) AS wd
    FROM public.absence_requests a
    WHERE a.employee_id = p_employee_id
      AND a.status = 'approved'
      AND a.start_date <= p_period_end
      AND a.end_date   >= p_period_start
  ) x;

  SELECT COUNT(*)::int INTO v_tasks
  FROM public.tasks t
  WHERE t.status = 'done'
    AND t.completed_by = p_employee_id
    AND t.completed_at IS NOT NULL
    AND (t.completed_at AT TIME ZONE 'Europe/Berlin')::date BETWEEN p_period_start AND p_period_end;

  RETURN QUERY SELECT
    p_employee_id, p_period_start, p_period_end,
    v_ist, v_soll,
    (v_soll > 0 AND v_ist >= v_soll),
    COALESCE(v_worked, 0),
    CASE WHEN COALESCE(v_worked, 0) > 0 THEN (v_ist / v_worked)::int ELSE 0 END,
    COALESCE(v_break, 0),
    COALESCE(v_vac, 0), COALESCE(v_sick, 0), COALESCE(v_unpaid, 0),
    COALESCE(v_tasks, 0);
END;
$function$;

-- ---------------------------------------------------------------------------
-- get_employee_archive_days (Mig 113)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_employee_archive_days(p_employee_id uuid, p_from date, p_to date)
 RETURNS TABLE(work_day date, first_in timestamp with time zone, last_out timestamp with time zone, gross_minutes integer, break_minutes integer, net_minutes integer, pauschal_minutes integer, entry_count integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  WITH guard AS (
    SELECT public.is_chef() AS ok
  ),
  entry_gaps AS (
    SELECT
      (te.checked_in_at AT TIME ZONE 'Europe/Berlin')::date AS d,
      te.checked_in_at,
      te.checked_out_at,
      EXTRACT(EPOCH FROM (te.checked_out_at - te.checked_in_at)) / 60.0 AS dur,
      GREATEST(0, EXTRACT(EPOCH FROM (te.checked_in_at - LAG(te.checked_out_at) OVER (
        PARTITION BY (te.checked_in_at AT TIME ZONE 'Europe/Berlin')::date
        ORDER BY te.checked_in_at
      ))) / 60.0) AS gap
    FROM public.time_entries te, guard
    WHERE guard.ok
      AND te.employee_id = p_employee_id
      AND te.checked_out_at IS NOT NULL
      AND (te.checked_in_at AT TIME ZONE 'Europe/Berlin')::date BETWEEN p_from AND p_to
  ),
  daily AS (
    SELECT
      d,
      MIN(checked_in_at)  AS first_in,
      MAX(checked_out_at) AS last_out,
      SUM(dur) AS gross,
      COALESCE(SUM(gap) FILTER (WHERE gap >= 15), 0) AS taken_break,
      COUNT(*) AS cnt
    FROM entry_gaps
    GROUP BY 1
  ),
  paus AS (
    SELECT pe.datum AS d, SUM(pe.minutes) AS pm
    FROM public.pauschal_entries pe, guard
    WHERE guard.ok
      AND pe.employee_id = p_employee_id
      AND pe.status = 'approved'
      AND pe.datum BETWEEN p_from AND p_to
    GROUP BY 1
  ),
  all_days AS (
    SELECT d FROM daily
    UNION
    SELECT d FROM paus
  )
  SELECT
    ad.d AS work_day,
    dl.first_in,
    dl.last_out,
    COALESCE(dl.gross, 0)::int AS gross_minutes,
    GREATEST(0,
      (GREATEST(0, LEAST(30, COALESCE(dl.gross,0) - 360))
       + GREATEST(0, LEAST(15, COALESCE(dl.gross,0) - 540)))
      - COALESCE(dl.taken_break, 0)
    )::int AS break_minutes,
    (COALESCE(dl.gross,0) - GREATEST(0,
      (GREATEST(0, LEAST(30, COALESCE(dl.gross,0) - 360))
       + GREATEST(0, LEAST(15, COALESCE(dl.gross,0) - 540)))
      - COALESCE(dl.taken_break, 0)
    ) + COALESCE(p.pm, 0))::int AS net_minutes,
    COALESCE(p.pm, 0)::int AS pauschal_minutes,
    COALESCE(dl.cnt, 0)::int AS entry_count
  FROM all_days ad
  LEFT JOIN daily dl ON dl.d = ad.d
  LEFT JOIN paus  p  ON p.d  = ad.d
  ORDER BY ad.d;
$function$;
