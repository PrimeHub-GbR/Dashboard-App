-- Migration 068: Bei Abwesenheitsanträgen gilt nur der letzte.
--
-- submit_absence_request verwirft vor dem Anlegen alle noch ausstehenden
-- (pending) Anträge desselben Mitarbeiters, die sich mit dem neuen Zeitraum
-- überlappen. So kann der Mitarbeiter seinen Antrag bis zur Genehmigung
-- beliebig ändern (Urlaub -> Krankheit -> ...), und der Chef sieht immer nur
-- den zuletzt gestellten Antrag.

CREATE OR REPLACE FUNCTION public.submit_absence_request(
  p_start date, p_end date, p_type text, p_note text DEFAULT NULL::text
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_emp uuid;
  v_id  uuid;
  v_req integer;
  v_remaining integer;
BEGIN
  v_emp := public.current_employee_id();
  IF v_emp IS NULL THEN RAISE EXCEPTION 'Kein Mitarbeiter-Datensatz'; END IF;
  IF p_type NOT IN ('urlaub','krankheit','sonstige') THEN
    RAISE EXCEPTION 'Ungültiger Abwesenheitstyp';
  END IF;
  IF p_end < p_start THEN RAISE EXCEPTION 'Enddatum vor Startdatum'; END IF;

  -- Nur der letzte Antrag gilt: frühere, noch nicht entschiedene (pending)
  -- Anträge mit überlappendem Zeitraum verwerfen.
  DELETE FROM public.absence_requests
  WHERE employee_id = v_emp
    AND status = 'pending'
    AND start_date <= p_end
    AND end_date >= p_start;

  IF p_type = 'urlaub' THEN
    v_req := public._absence_workdays(v_emp, p_start, p_end);
    SELECT remaining INTO v_remaining
      FROM public.get_vacation_balance(v_emp, EXTRACT(YEAR FROM p_start)::int);
    IF v_req > COALESCE(v_remaining, 0) THEN
      RAISE EXCEPTION 'Nicht genug Resturlaub: % Arbeitstag(e) beantragt, nur % offen',
        v_req, COALESCE(v_remaining, 0)
        USING ERRCODE = '22023';
    END IF;
  END IF;

  INSERT INTO public.absence_requests (employee_id, start_date, end_date, type, note)
  VALUES (v_emp, p_start, p_end, p_type, NULLIF(btrim(coalesce(p_note,'')),''))
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$function$;
