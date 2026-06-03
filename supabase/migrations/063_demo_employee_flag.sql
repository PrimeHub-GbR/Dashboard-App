-- Migration 063: Demo-Mitarbeiter-Flag. Max Mustermitarbeiter bleibt als
-- Demo-Account erhalten, wird aber standardmäßig aus der Chef-Ansicht
-- ausgeblendet. Ein Toggle (p_include_demo) blendet ihn für Tests wieder ein.
ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
UPDATE public.employees SET is_demo = true
  WHERE id = 'aa000000-0000-0000-0000-000000000001';
COMMENT ON COLUMN public.employees.is_demo IS
  'Demo-Account (Max Mustermitarbeiter). Standardmäßig aus Chef-Listen gefiltert.';

DROP FUNCTION IF EXISTS public.get_all_employees_month_hours(integer, integer);
CREATE FUNCTION public.get_all_employees_month_hours(
  p_year integer, p_month integer, p_include_demo boolean DEFAULT false
)
RETURNS TABLE(
  employee_id uuid, employee_name text, employee_color text,
  target_hours_per_month numeric, total_work_minutes bigint,
  total_break_minutes bigint, entry_count bigint
)
LANGUAGE sql STABLE
SET search_path TO 'public', 'pg_temp'
AS $function$
  WITH daily AS (
    SELECT t.employee_id AS emp_id,
      (t.checked_in_at AT TIME ZONE 'Europe/Berlin')::date AS work_day,
      SUM(EXTRACT(EPOCH FROM (t.checked_out_at - t.checked_in_at)) / 60.0) AS gross,
      EXTRACT(EPOCH FROM (MAX(t.checked_out_at) - MIN(t.checked_in_at))) / 60.0 AS span,
      COUNT(*) AS cnt
    FROM time_entries t
    WHERE t.checked_out_at IS NOT NULL
      AND EXTRACT(YEAR FROM t.checked_in_at AT TIME ZONE 'Europe/Berlin') = p_year
      AND EXTRACT(MONTH FROM t.checked_in_at AT TIME ZONE 'Europe/Berlin') = p_month
    GROUP BY 1, 2
  ),
  per_emp AS (
    SELECT emp_id, SUM(gross) AS work_minutes,
      SUM(GREATEST(0, (CASE WHEN gross <= 360 THEN 0 WHEN gross <= 540 THEN 30 ELSE 45 END)
        - GREATEST(0, span - gross))) AS break_minutes,
      SUM(cnt) AS entry_count
    FROM daily GROUP BY emp_id
  )
  SELECT e.id, e.name, e.color, e.target_hours_per_month,
    COALESCE(pe.work_minutes, 0)::BIGINT, COALESCE(pe.break_minutes, 0)::BIGINT,
    COALESCE(pe.entry_count, 0)::BIGINT
  FROM employees e
  LEFT JOIN per_emp pe ON pe.emp_id = e.id
  WHERE e.is_active = true AND e.position != 'geschaeftsfuehrer'
    AND (p_include_demo OR NOT e.is_demo)
  GROUP BY e.id, e.name, e.color, e.target_hours_per_month,
    pe.work_minutes, pe.break_minutes, pe.entry_count
  ORDER BY e.name;
$function$;
GRANT EXECUTE ON FUNCTION public.get_all_employees_month_hours(integer, integer, boolean) TO authenticated;
