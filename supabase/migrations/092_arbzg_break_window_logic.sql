-- Migration 092: ArbZG-Pause als Fenster-Logik
--
-- Bisher Stufenfunktion: <=6h → 0, <=9h → 30, >9h → 45.
-- Problem: Wer 6h05 stempelt, verlor 35 Min (kam auf 5h30) — obwohl er
-- 6h gearbeitet hat. Gewünscht: Die ersten 6h sind IMMER bezahlt; erst die
-- danach gearbeitete Zeit deckt die Pause.
--
-- Fenster-Logik:
--   Minuten 6:00–6:30 (360–390 brutto) = 30-Min-Pausenfenster
--   Minuten 9:00–9:15 (540–555 brutto) = +15 Min → 45 Min gesamt
--
-- Pause(gross) = clamp(gross-360, 0, 30) + clamp(gross-540, 0, 15)
--
-- Beispiele:
--   6h00 → 0      → bezahlt 6h00
--   6h05 → 5      → bezahlt 6h00   (nur die 5 Überminuten zählen)
--   6h30 → 30     → bezahlt 6h00
--   7h00 → 30     → bezahlt 6h30
--   9h00 → 30     → bezahlt 8h30
--   9h15 → 45     → bezahlt 8h30
--   10h  → 45     → bezahlt 9h15
--
-- Lücken-Anrechnung (Pausen, die der Mitarbeiter durch Aus-/Einstempeln
-- selbst gemacht hat) bleibt unverändert: sie wird von der Pflichtpause
-- abgezogen, sodass nicht doppelt abgezogen wird.

-- 1) Zentrale Helper-Funktion ------------------------------------------------
CREATE OR REPLACE FUNCTION public._arbzg_break(gross_min integer)
  RETURNS integer
  LANGUAGE sql
  IMMUTABLE
AS $function$
  SELECT GREATEST(0, LEAST(30, gross_min - 360))
       + GREATEST(0, LEAST(15, gross_min - 540));
$function$;

-- 2) Monats-/Periodensaldo (Ist mit Lücken-Anrechnung) -----------------------
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
  SELECT COALESCE(SUM(
    gross - GREATEST(0,
      (GREATEST(0, LEAST(30, gross - 360)) + GREATEST(0, LEAST(15, gross - 540)))
      - GREATEST(0, span - gross)
    )
  ), 0)::INTEGER
  INTO v_ist_minutes
  FROM daily;

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

-- 3) Manuelle Korrektur durch Chef (break_minutes nach Fenster-Logik) --------
CREATE OR REPLACE FUNCTION public.admin_upsert_time_entry(p_id uuid, p_employee_id uuid, p_checked_in timestamp with time zone, p_checked_out timestamp with time zone DEFAULT NULL::timestamp with time zone, p_note text DEFAULT NULL::text)
  RETURNS time_entries
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_row    public.time_entries;
  v_gross  INTEGER;
  v_break  INTEGER := 0;
  v_target uuid;
BEGIN
  IF NOT public.is_chef() THEN
    RAISE EXCEPTION 'insufficient_privilege: nur Chef' USING ERRCODE = '42501';
  END IF;
  v_target := COALESCE((SELECT employee_id FROM public.time_entries WHERE id = p_id), p_employee_id);
  IF public._my_level() <= public._level_of(v_target) THEN
    RAISE EXCEPTION 'insufficient_privilege: keine Berechtigung fuer diesen Mitarbeiter (Hierarchie)' USING ERRCODE = '42501';
  END IF;
  IF p_checked_out IS NOT NULL THEN
    IF p_checked_out <= p_checked_in THEN
      RAISE EXCEPTION 'checked_out muss nach checked_in liegen' USING ERRCODE = '22023';
    END IF;
    v_gross := GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (p_checked_out - p_checked_in)) / 60)::INTEGER);
    v_break := GREATEST(0, LEAST(30, v_gross - 360)) + GREATEST(0, LEAST(15, v_gross - 540));
  END IF;
  IF p_id IS NULL THEN
    INSERT INTO public.time_entries (
      employee_id, checked_in_at, checked_out_at, break_minutes,
      note, auth_method, needs_review, corrected_by, corrected_at
    ) VALUES (
      p_employee_id, p_checked_in, p_checked_out, v_break,
      p_note, 'manual', true, auth.uid(), now()
    ) RETURNING * INTO v_row;
  ELSE
    UPDATE public.time_entries SET
      checked_in_at = p_checked_in, checked_out_at = p_checked_out,
      break_minutes = v_break, note = COALESCE(p_note, note),
      needs_review = true, corrected_by = auth.uid(), corrected_at = now(),
      updated_at = now()
    WHERE id = p_id RETURNING * INTO v_row;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'time_entry not found: %', p_id USING ERRCODE = 'P0002';
    END IF;
  END IF;
  RETURN v_row;
END;
$function$;
