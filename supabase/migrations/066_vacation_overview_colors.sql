-- Migration 066: eindeutige Mitarbeiterfarben + Urlaubs-Übersicht-RPCs.
--
-- 1) Farben: vorher waren nur 4 Farben auf 8 aktive Mitarbeiter verteilt
--    (Dubletten). Jeder bekommt eine eindeutige, gut unterscheidbare Farbe.
-- 2) get_vacation_overview: pro Mitarbeiter Jahresanspruch, noch nicht
--    verplante Tage (remaining) und bereits gebuchte Zukunftstage.
-- 3) get_employee_vacation_months: genommene Urlaubstage pro Monat.

-- ============================================================ 1) Farben
UPDATE public.employees SET color = CASE id
  WHEN 'b2a27370-0150-4eab-8534-a9017d3de08a' THEN '#22c55e' -- Durmus: grün
  WHEN 'd459aa37-4e82-43af-9e75-ca98a021429c' THEN '#f59e0b' -- Magomet: orange
  WHEN 'ce99066c-85c5-4f56-8b23-17fd0c5a34b4' THEN '#3b82f6' -- Musa: blau
  WHEN 'bcc37ac0-df69-41e7-8314-33d7c2bb6ea0' THEN '#8b5cf6' -- Muchamed: violett
  WHEN '70dd440c-57e4-4306-898a-52ae810ef05c' THEN '#ec4899' -- Mohammed: pink
  WHEN '8053e05b-3f6f-4c68-8028-015e585628fe' THEN '#ef4444' -- Muammer: rot
  WHEN 'a134ea96-b8ae-45af-8f7b-1a960d882d13' THEN '#06b6d4' -- Seydi: cyan
  WHEN 'aa000000-0000-0000-0000-000000000001' THEN '#eab308' -- Max (Demo): gelb
  ELSE color END
WHERE id IN (
  'b2a27370-0150-4eab-8534-a9017d3de08a','d459aa37-4e82-43af-9e75-ca98a021429c',
  'ce99066c-85c5-4f56-8b23-17fd0c5a34b4','bcc37ac0-df69-41e7-8314-33d7c2bb6ea0',
  '70dd440c-57e4-4306-898a-52ae810ef05c','8053e05b-3f6f-4c68-8028-015e585628fe',
  'a134ea96-b8ae-45af-8f7b-1a960d882d13','aa000000-0000-0000-0000-000000000001'
);

-- ============================================ 2) Urlaubs-Übersicht (Chef)
CREATE OR REPLACE FUNCTION public.get_vacation_overview(
  p_year integer DEFAULT NULL,
  p_include_demo boolean DEFAULT false
)
RETURNS TABLE(
  employee_id uuid, name text, color text,
  entitlement integer, remaining integer, future_booked integer
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT e.id, e.name, e.color,
         vb.entitlement, vb.remaining,
         COALESCE(fut.days, 0)::int
  FROM public.employees e
  CROSS JOIN LATERAL public.get_vacation_balance(
    e.id, COALESCE(p_year, EXTRACT(YEAR FROM current_date)::int)) vb
  LEFT JOIN LATERAL (
    SELECT SUM(public._absence_workdays(
              e.id, GREATEST(a.start_date, current_date), a.end_date)) AS days
    FROM public.absence_requests a
    WHERE a.employee_id = e.id
      AND a.type = 'urlaub'
      AND a.status = 'approved'
      AND a.end_date >= current_date
      AND EXTRACT(YEAR FROM a.start_date)
          = COALESCE(p_year, EXTRACT(YEAR FROM current_date)::int)
  ) fut ON true
  WHERE public.is_chef()
    AND e.is_active
    AND (p_include_demo OR NOT e.is_demo)
  ORDER BY e.name;
$$;
GRANT EXECUTE ON FUNCTION public.get_vacation_overview(integer, boolean) TO authenticated;

-- =================================== 3) Genommene Urlaubstage pro Monat
CREATE OR REPLACE FUNCTION public.get_employee_vacation_months(
  p_employee_id uuid,
  p_year integer
)
RETURNS TABLE(month integer, days integer)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT EXTRACT(MONTH FROM gs.d)::int AS month, COUNT(*)::int AS days
  FROM public.absence_requests a
  CROSS JOIN LATERAL generate_series(a.start_date, a.end_date, interval '1 day') AS gs(d)
  WHERE a.employee_id = p_employee_id
    AND a.type = 'urlaub'
    AND a.status = 'approved'
    AND EXTRACT(YEAR FROM gs.d) = p_year
    AND EXTRACT(DOW FROM gs.d) NOT IN (0, 6)  -- ohne Wochenende
    AND public.is_chef()
  GROUP BY 1
  ORDER BY 1;
$$;
GRANT EXECUTE ON FUNCTION public.get_employee_vacation_months(uuid, integer) TO authenticated;
