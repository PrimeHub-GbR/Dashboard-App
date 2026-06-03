-- Migration 060: Noch nicht genehmigte (pending) Abwesenheiten teilweise
-- zurückziehen — ohne Genehmigung, direkt. Splittet überlappende pending-
-- Anträge wie der Teilstorno, löscht aber den gewählten Teil sofort.
CREATE OR REPLACE FUNCTION public.withdraw_partial_pending(
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
      AND status = 'pending'
      AND start_date <= p_end
      AND end_date >= p_start
    FOR UPDATE
  LOOP
    cS := GREATEST(a.start_date, p_start);
    cE := LEAST(a.end_date, p_end);

    IF a.start_date < cS AND cE < a.end_date THEN
      UPDATE public.absence_requests SET end_date = cS - 1 WHERE id = a.id;
      INSERT INTO public.absence_requests
        (employee_id, start_date, end_date, type, status, note)
      VALUES (v_emp, cE + 1, a.end_date, a.type, 'pending', a.note);
    ELSIF a.start_date < cS THEN
      UPDATE public.absence_requests SET end_date = cS - 1 WHERE id = a.id;
    ELSIF cE < a.end_date THEN
      UPDATE public.absence_requests SET start_date = cE + 1 WHERE id = a.id;
    ELSE
      DELETE FROM public.absence_requests WHERE id = a.id;
    END IF;
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;
GRANT EXECUTE ON FUNCTION public.withdraw_partial_pending(date, date) TO authenticated;
