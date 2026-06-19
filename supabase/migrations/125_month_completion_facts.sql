-- Migration 125: Facts-RPC für die "Stunden voll"-Benachrichtigung.
--
-- Liefert für einen Mitarbeiter + Monatszeitraum alle Kennzahlen, die sowohl
-- der Kiosk (Glückwunsch-Anzeige nach dem Ausstempeln) als auch die App
-- (Start-Popup) brauchen, um zu entscheiden, ob das Monats-Soll erreicht ist,
-- und um die Side-Facts darzustellen.
--
-- Wiederverwendete Logik:
--   * ist_minutes / soll_minutes -> get_employee_balance (Mig 107, inkl. Pauschalen
--     und ArbZG-Fensterpause). reached = ist_minutes >= soll_minutes (soll > 0).
--   * worked_days / break_minutes / Abwesenheiten -> analog get_employee_archive
--     (Mig 112) bzw. direkt aus time_entries / absence_requests / pauschal_entries.
--   * erledigte Aufgaben -> tasks (status='done', completed_by = Mitarbeiter,
--     completed_at im Berlin-Monat).
--
-- Zugriff (SECURITY DEFINER):
--   * Service-Role (auth.uid() IS NULL) -> erlaubt (Kiosk-Checkout ruft via
--     Service-Client auf).
--   * Chef -> alle. Mitarbeiter -> nur eigener Datensatz. Vorgesetzter ->
--     direkte Reports (analog get_employee_balance).
--
-- break_minutes = gesamte (ArbZG-)Pausenminuten, die im Zeitraum tatsächlich von
-- der Brutto-Arbeitszeit abgezogen wurden (selbe Fensterpausen-Formel wie
-- get_employee_balance: gross - netto je Tag).

CREATE OR REPLACE FUNCTION public.get_month_completion_facts(
  p_employee_id  uuid,
  p_period_start date,
  p_period_end   date
)
RETURNS TABLE (
  employee_id        uuid,
  period_start       date,
  period_end         date,
  ist_minutes        integer,
  soll_minutes       integer,
  reached            boolean,
  worked_days        integer,
  avg_minutes_per_day integer,
  break_minutes      integer,
  vacation_days      integer,
  sick_days          integer,
  unpaid_days        integer,
  completed_tasks    integer
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
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

  -- Zugriffskontrolle: Service-Role (kein auth.uid()) immer; sonst Chef/Self/Report.
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

  -- Ist/Soll aus der bestehenden Bilanz-Logik (inkl. Pauschalen + ArbZG-Pause).
  SELECT b.ist_minutes, b.soll_minutes INTO v_ist, v_soll
  FROM public.get_employee_balance(p_employee_id, p_period_start, p_period_end) b;
  v_ist  := COALESCE(v_ist, 0);
  v_soll := COALESCE(v_soll, 0);

  -- Gearbeitete Tage + abgezogene Pausenminuten je Tag (selbe Fensterpausen-Formel).
  WITH daily AS (
    SELECT
      (te.checked_in_at AT TIME ZONE 'Europe/Berlin')::date AS work_day,
      SUM(EXTRACT(EPOCH FROM (te.checked_out_at - te.checked_in_at)) / 60.0) AS gross,
      EXTRACT(EPOCH FROM (MAX(te.checked_out_at) - MIN(te.checked_in_at))) / 60.0 AS span
    FROM public.time_entries te
    WHERE te.employee_id = p_employee_id
      AND te.checked_in_at >= p_period_start::TIMESTAMPTZ
      AND te.checked_in_at < (p_period_end + 1)::TIMESTAMPTZ
      AND te.checked_out_at IS NOT NULL
    GROUP BY 1
  )
  SELECT
    COUNT(*)::int,
    COALESCE(SUM(
      GREATEST(0,
        (GREATEST(0, LEAST(30, gross - 360)) + GREATEST(0, LEAST(15, gross - 540)))
        - GREATEST(0, span - gross)
      )
    ), 0)::int
  INTO v_worked, v_break
  FROM daily;

  -- Abwesenheits-Arbeitstage je Typ (genehmigt), auf den Zeitraum begrenzt.
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

  -- Erledigte Aufgaben des Mitarbeiters mit completed_at im Berlin-Monat.
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
$$;

GRANT EXECUTE ON FUNCTION public.get_month_completion_facts(uuid, date, date) TO authenticated, service_role;

COMMENT ON FUNCTION public.get_month_completion_facts(uuid, date, date) IS
  'Kennzahlen für die "Stunden voll"-Benachrichtigung (Kiosk + App). reached = Monats-Ist >= Monats-Soll. Wiederverwendet get_employee_balance. Service-Role (Kiosk) + Chef/Self/Report.';
