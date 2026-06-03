-- Migration 058: Storno-Workflow + Urlaubs-Limit + Archiv
-- - Neue Status: cancel_requested (MA will genehmigten Urlaub zurücknehmen),
--   cancelled (Chef hat Stornierung genehmigt).
-- - submit_absence_request: Urlaub kann nicht über den Resturlaub hinaus.
-- - decide_absence_request: behandelt pending UND cancel_requested.
-- - Team-/Glocken-RPCs zeigen rejected/cancelled nicht mehr; eigenes Archiv.

ALTER TABLE public.absence_requests
  DROP CONSTRAINT IF EXISTS absence_requests_status_check;
ALTER TABLE public.absence_requests
  ADD CONSTRAINT absence_requests_status_check
  CHECK (status IN ('pending','approved','rejected','cancel_requested','cancelled'));

CREATE OR REPLACE FUNCTION public._absence_workdays(
  p_employee_id uuid, p_start date, p_end date
)
RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COUNT(*)::int
  FROM public.employees e
  CROSS JOIN LATERAL generate_series(p_start, p_end, interval '1 day') gs
  WHERE e.id = p_employee_id
    AND COALESCE((e.weekly_schedule ->> (
      CASE EXTRACT(ISODOW FROM gs)::int
        WHEN 1 THEN 'mon' WHEN 2 THEN 'tue' WHEN 3 THEN 'wed'
        WHEN 4 THEN 'thu' WHEN 5 THEN 'fri' WHEN 6 THEN 'sat' ELSE 'sun'
      END))::numeric, 0) > 0;
$$;
GRANT EXECUTE ON FUNCTION public._absence_workdays(uuid, date, date) TO authenticated;

CREATE OR REPLACE FUNCTION public.submit_absence_request(
  p_start date, p_end date, p_type text, p_note text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
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
$$;
GRANT EXECUTE ON FUNCTION public.submit_absence_request(date, date, text, text) TO authenticated;

-- Stornierung beantragen (MA): approved -> cancel_requested
CREATE OR REPLACE FUNCTION public.request_absence_cancellation(p_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE public.absence_requests
  SET status = 'cancel_requested'
  WHERE id = p_id
    AND employee_id = public.current_employee_id()
    AND status = 'approved';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Antrag nicht gefunden oder nicht genehmigt';
  END IF;
END;
$$;
GRANT EXECUTE ON FUNCTION public.request_absence_cancellation(uuid) TO authenticated;

-- decide: pending (approve->approved/reject->rejected) UND
-- cancel_requested (approve->cancelled/reject->approved)
CREATE OR REPLACE FUNCTION public.decide_absence_request(
  p_id uuid, p_approve boolean, p_note text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_reviewer uuid;
  v_status   text;
  v_new      text;
BEGIN
  IF NOT public.is_chef() THEN RAISE EXCEPTION 'Keine Berechtigung'; END IF;
  SELECT id INTO v_reviewer FROM public.employees WHERE auth_user_id = auth.uid();

  SELECT status INTO v_status FROM public.absence_requests WHERE id = p_id;
  IF v_status IS NULL THEN RAISE EXCEPTION 'Antrag nicht gefunden'; END IF;

  IF v_status = 'pending' THEN
    v_new := CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END;
  ELSIF v_status = 'cancel_requested' THEN
    v_new := CASE WHEN p_approve THEN 'cancelled' ELSE 'approved' END;
  ELSE
    RAISE EXCEPTION 'Antrag bereits entschieden';
  END IF;

  UPDATE public.absence_requests
  SET status = v_new,
      decision_note = NULLIF(btrim(coalesce(p_note,'')),''),
      reviewed_by = v_reviewer,
      reviewed_at = now()
  WHERE id = p_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.decide_absence_request(uuid, boolean, text) TO authenticated;

DROP FUNCTION IF EXISTS public.get_chef_absence_notifications();
CREATE FUNCTION public.get_chef_absence_notifications()
RETURNS TABLE (
  id uuid, employee_id uuid, employee_name text, employee_color text,
  start_date date, end_date date, type text, status text, note text, created_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT a.id, a.employee_id, e.name, e.color,
         a.start_date, a.end_date, a.type, a.status, a.note, a.created_at
  FROM public.absence_requests a
  JOIN public.employees e ON e.id = a.employee_id
  WHERE public.is_chef()
    AND a.status IN ('pending','cancel_requested')
  ORDER BY a.created_at DESC
  LIMIT 50;
$$;
GRANT EXECUTE ON FUNCTION public.get_chef_absence_notifications() TO authenticated;

CREATE OR REPLACE FUNCTION public.get_team_absences(p_from date, p_to date)
RETURNS TABLE (
  id uuid, employee_id uuid, start_date date, end_date date, type text, status text
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT a.id, a.employee_id, a.start_date, a.end_date, a.type, a.status
  FROM public.absence_requests a
  WHERE public.is_chef()
    AND a.status IN ('pending','approved','cancel_requested')
    AND a.start_date <= p_to AND a.end_date >= p_from
  ORDER BY a.start_date;
$$;
GRANT EXECUTE ON FUNCTION public.get_team_absences(date, date) TO authenticated;

-- Archiv: abgelehnte + stornierte Anträge (Chef)
CREATE OR REPLACE FUNCTION public.get_chef_archived_absences()
RETURNS TABLE (
  id uuid, employee_id uuid, employee_name text, employee_color text,
  start_date date, end_date date, type text, status text, note text,
  decision_note text, reviewed_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT a.id, a.employee_id, e.name, e.color,
         a.start_date, a.end_date, a.type, a.status, a.note,
         a.decision_note, a.reviewed_at
  FROM public.absence_requests a
  JOIN public.employees e ON e.id = a.employee_id
  WHERE public.is_chef()
    AND a.status IN ('rejected','cancelled')
  ORDER BY a.reviewed_at DESC NULLS LAST
  LIMIT 100;
$$;
GRANT EXECUTE ON FUNCTION public.get_chef_archived_absences() TO authenticated;
