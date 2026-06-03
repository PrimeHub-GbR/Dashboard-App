-- Migration 061: Abwesenheits-Zusammenfassung für einen Zeitraum (Monat).
-- Genehmigte Abwesenheiten pro Typ in Arbeitstagen (laut weekly_schedule),
-- auf den Zeitraum begrenzt. Für die Monats-Kachel (Urlaub/Krank/Unbezahlt).
CREATE OR REPLACE FUNCTION public.get_absence_summary(
  p_employee_id uuid, p_from date, p_to date
)
RETURNS TABLE (urlaub integer, krankheit integer, sonstige integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT (p_employee_id = public.current_employee_id() OR public.is_chef()) THEN
    RAISE EXCEPTION 'Keine Berechtigung';
  END IF;

  RETURN QUERY
  SELECT
    COALESCE(SUM(CASE WHEN x.type = 'urlaub' THEN x.wd ELSE 0 END), 0)::int,
    COALESCE(SUM(CASE WHEN x.type = 'krankheit' THEN x.wd ELSE 0 END), 0)::int,
    COALESCE(SUM(CASE WHEN x.type = 'sonstige' THEN x.wd ELSE 0 END), 0)::int
  FROM (
    SELECT a.type,
           public._absence_workdays(
             p_employee_id,
             GREATEST(a.start_date, p_from),
             LEAST(a.end_date, p_to)
           ) AS wd
    FROM public.absence_requests a
    WHERE a.employee_id = p_employee_id
      AND a.status = 'approved'
      AND a.start_date <= p_to
      AND a.end_date >= p_from
  ) x;
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_absence_summary(uuid, date, date) TO authenticated;
