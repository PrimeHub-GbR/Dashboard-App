-- Migration 042: RPC get_employee_balance(employee_id, period_start, period_end)
--
-- Liefert Ist/Soll/Differenz-Minuten fuer einen Mitarbeiter ueber einen
-- frei waehlbaren Zeitraum. Wird von App und kuenftig auch Web-Dashboard
-- als gemeinsame Berechnung genutzt.
--
-- Ist  = Summe (checked_out_at - checked_in_at - break_minutes) im Zeitraum
-- Soll = Summe (weekly_schedule[wochentag] * 60) ueber jeden Kalendertag
-- Diff = Ist - Soll
--
-- Zugriffsschutz: Mitarbeiter darf nur eigene Zahlen abrufen, Manager das
-- eigene Team, Admin alle. Verstoesse werfen 'Access denied'.
-- Feiertage werden in dieser Version NICHT abgezogen (Phase 2: NRW-Modul).

CREATE OR REPLACE FUNCTION public.get_employee_balance(
  p_employee_id UUID,
  p_period_start DATE,
  p_period_end DATE
)
RETURNS TABLE (
  employee_id UUID,
  period_start DATE,
  period_end DATE,
  ist_minutes INTEGER,
  soll_minutes INTEGER,
  diff_minutes INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $$
DECLARE
  v_caller_emp_id UUID;
  v_schedule JSONB;
  v_ist_minutes INTEGER;
  v_soll_minutes INTEGER;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_period_end < p_period_start THEN
    RAISE EXCEPTION 'period_end must be >= period_start';
  END IF;

  v_caller_emp_id := public.current_employee_id();

  -- Zugriffspruefung
  IF NOT (
    public.is_admin_or_manager()
    OR p_employee_id = v_caller_emp_id
    OR EXISTS (SELECT 1 FROM public.employees WHERE id = p_employee_id AND reports_to = v_caller_emp_id)
  ) THEN
    RAISE EXCEPTION 'Access denied for employee %', p_employee_id;
  END IF;

  -- weekly_schedule des Ziel-Mitarbeiters laden
  SELECT weekly_schedule INTO v_schedule
  FROM public.employees
  WHERE id = p_employee_id;

  IF v_schedule IS NULL THEN
    RAISE EXCEPTION 'Employee % not found', p_employee_id;
  END IF;

  -- Ist: Summe Netto-Arbeitsminuten im Zeitraum (nur abgeschlossene Buchungen)
  SELECT COALESCE(SUM(
    GREATEST(
      0,
      EXTRACT(EPOCH FROM (te.checked_out_at - te.checked_in_at)) / 60.0
        - te.break_minutes
    )
  ), 0)::INTEGER
  INTO v_ist_minutes
  FROM public.time_entries te
  WHERE te.employee_id = p_employee_id
    AND te.checked_in_at >= p_period_start::TIMESTAMPTZ
    AND te.checked_in_at < (p_period_end + 1)::TIMESTAMPTZ
    AND te.checked_out_at IS NOT NULL;

  -- Soll: Summe weekly_schedule pro Wochentag * 60 Minuten
  -- DOW: 0=Sonntag, 1=Montag, ..., 6=Samstag
  WITH days AS (
    SELECT generate_series(p_period_start, p_period_end, '1 day'::interval)::DATE AS d
  )
  SELECT COALESCE(SUM(
    (
      CASE EXTRACT(DOW FROM days.d)::INTEGER
        WHEN 1 THEN COALESCE((v_schedule->>'mon')::NUMERIC, 0)
        WHEN 2 THEN COALESCE((v_schedule->>'tue')::NUMERIC, 0)
        WHEN 3 THEN COALESCE((v_schedule->>'wed')::NUMERIC, 0)
        WHEN 4 THEN COALESCE((v_schedule->>'thu')::NUMERIC, 0)
        WHEN 5 THEN COALESCE((v_schedule->>'fri')::NUMERIC, 0)
        WHEN 6 THEN COALESCE((v_schedule->>'sat')::NUMERIC, 0)
        WHEN 0 THEN COALESCE((v_schedule->>'sun')::NUMERIC, 0)
        ELSE 0
      END
    ) * 60
  ), 0)::INTEGER
  INTO v_soll_minutes
  FROM days;

  RETURN QUERY
  SELECT
    p_employee_id,
    p_period_start,
    p_period_end,
    v_ist_minutes,
    v_soll_minutes,
    (v_ist_minutes - v_soll_minutes);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_employee_balance(UUID, DATE, DATE) TO authenticated;

COMMENT ON FUNCTION public.get_employee_balance(UUID, DATE, DATE) IS
  'Ist/Soll/Differenz-Minuten fuer einen Mitarbeiter im Zeitraum. Zugriffsgeschuetzt: Self, Manager-Team oder Admin.';
