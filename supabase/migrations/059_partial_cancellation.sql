-- Migration 059: Teilstornierung über den Kalender
-- Mitarbeiter wählt einzelne genehmigte Tage und beantragt deren Stornierung.
-- Überlappende approved-Anträge werden gesplittet: der gewählte Bereich wird
-- ein cancel_requested-Eintrag, der Rest bleibt approved.
CREATE OR REPLACE FUNCTION public.request_partial_cancellation(
  p_start date, p_end date
)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_emp uuid;
  a     record;
  cS    date;
  cE    date;
  v_count integer := 0;
BEGIN
  v_emp := public.current_employee_id();
  IF v_emp IS NULL THEN RAISE EXCEPTION 'Kein Mitarbeiter-Datensatz'; END IF;
  IF p_end < p_start THEN RAISE EXCEPTION 'Enddatum vor Startdatum'; END IF;

  FOR a IN
    SELECT * FROM public.absence_requests
    WHERE employee_id = v_emp
      AND status = 'approved'
      AND start_date <= p_end
      AND end_date >= p_start
    FOR UPDATE
  LOOP
    cS := GREATEST(a.start_date, p_start);
    cE := LEAST(a.end_date, p_end);

    INSERT INTO public.absence_requests
      (employee_id, start_date, end_date, type, status, note)
    VALUES (v_emp, cS, cE, a.type, 'cancel_requested', a.note);
    v_count := v_count + 1;

    IF a.start_date < cS AND cE < a.end_date THEN
      UPDATE public.absence_requests SET end_date = cS - 1 WHERE id = a.id;
      INSERT INTO public.absence_requests
        (employee_id, start_date, end_date, type, status, note)
      VALUES (v_emp, cE + 1, a.end_date, a.type, 'approved', a.note);
    ELSIF a.start_date < cS THEN
      UPDATE public.absence_requests SET end_date = cS - 1 WHERE id = a.id;
    ELSIF cE < a.end_date THEN
      UPDATE public.absence_requests SET start_date = cE + 1 WHERE id = a.id;
    ELSE
      DELETE FROM public.absence_requests WHERE id = a.id;
    END IF;
  END LOOP;

  IF v_count = 0 THEN
    RAISE EXCEPTION 'Keine genehmigte Abwesenheit in diesem Zeitraum';
  END IF;
  RETURN v_count;
END;
$$;
GRANT EXECUTE ON FUNCTION public.request_partial_cancellation(date, date) TO authenticated;
