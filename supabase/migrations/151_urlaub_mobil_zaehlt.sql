-- 151: Urlaub bei Mobilem Arbeiten zaehlt auch ausserhalb des Wochenplans.
--
-- Befund (01.10.2026): Der GF hat fuer eine Remote-Mitarbeiterin (mobiles_arbeiten)
-- rueckwirkend Urlaub am Mo 21.09. und Fr 25.09. eingetragen. Ihr weekly_schedule
-- hat nur Di/Do/So > 0. _absence_workdays zaehlt ausschliesslich Wochenplan-Tage
-- -> beide Tage = 0 -> Urlaub fehlt in Monatsuebersicht (GF), Lohn-Tab (FIBU),
-- Archiv und Urlaubskonto.
--
-- Neu: Ein Abwesenheitstag zaehlt, wenn
--   * der Wochentag im weekly_schedule > 0 ist (wie bisher), ODER
--   * der Mitarbeiter mobiles_arbeiten hat und der Tag Mo-Fr ist
--     (Remote-Mitarbeiter planen frei, ihr Wochenplan ist kein verlaesslicher
--      Arbeitstage-Kalender).
-- Fuer Mitarbeiter ohne Mobiles Arbeiten aendert sich nichts.
--
-- get_vacation_balance hatte die Wochenplan-Logik inline dupliziert und nutzt
-- jetzt ebenfalls _absence_workdays (Zaehlung sonst identisch).

CREATE OR REPLACE FUNCTION public._absence_workdays(p_employee_id uuid, p_start date, p_end date)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT COUNT(*)::int
  FROM public.employees e
  CROSS JOIN LATERAL generate_series(p_start, p_end, interval '1 day') gs
  WHERE e.id = p_employee_id
    AND (
      COALESCE((e.weekly_schedule ->> (
        CASE EXTRACT(ISODOW FROM gs)::int
          WHEN 1 THEN 'mon' WHEN 2 THEN 'tue' WHEN 3 THEN 'wed'
          WHEN 4 THEN 'thu' WHEN 5 THEN 'fri' WHEN 6 THEN 'sat' ELSE 'sun'
        END))::numeric, 0) > 0
      OR (COALESCE(e.mobiles_arbeiten, false) AND EXTRACT(ISODOW FROM gs)::int <= 5)
    );
$function$;

CREATE OR REPLACE FUNCTION public.get_vacation_balance(p_employee_id uuid, p_year integer DEFAULT NULL::integer)
 RETURNS TABLE(year integer, full_days integer, entitlement integer, used integer, remaining integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_year    integer := COALESCE(p_year, EXTRACT(YEAR FROM now())::integer);
  v_full    integer;
  v_entry   date;
  v_ent     integer;
  v_used    integer;
BEGIN
  -- Zugriff: eigener Datensatz oder Chef.
  IF NOT (p_employee_id = public.current_employee_id() OR public.is_chef()) THEN
    RAISE EXCEPTION 'Keine Berechtigung';
  END IF;

  SELECT vacation_days_per_year, entry_date
    INTO v_full, v_entry
  FROM public.employees WHERE id = p_employee_id;

  v_full := COALESCE(v_full, 0);

  -- Anteiliger Anspruch
  IF v_entry IS NULL OR EXTRACT(YEAR FROM v_entry)::int < v_year THEN
    v_ent := v_full;
  ELSIF EXTRACT(YEAR FROM v_entry)::int > v_year THEN
    v_ent := 0;
  ELSE
    -- Eintritt im laufenden Jahr: volle Monate ab Eintrittsmonat bis Dezember
    v_ent := ROUND(v_full * (12 - EXTRACT(MONTH FROM v_entry)::int + 1) / 12.0);
  END IF;

  -- Verbrauchte Urlaubstage: genehmigte 'urlaub'-Antraege, Arbeitstage laut
  -- _absence_workdays (Wochenplan bzw. Mo-Fr bei Mobilem Arbeiten), aufs Jahr begrenzt.
  SELECT COALESCE(SUM(public._absence_workdays(
           p_employee_id,
           GREATEST(a.start_date, make_date(v_year, 1, 1)),
           LEAST(a.end_date, make_date(v_year, 12, 31))
         )), 0)::int
    INTO v_used
  FROM public.absence_requests a
  WHERE a.employee_id = p_employee_id
    AND a.type = 'urlaub'
    AND a.status = 'approved'
    AND a.start_date <= make_date(v_year, 12, 31)
    AND a.end_date   >= make_date(v_year, 1, 1);

  RETURN QUERY SELECT v_year, v_full, v_ent, COALESCE(v_used, 0),
                      v_ent - COALESCE(v_used, 0);
END;
$function$;
