-- Migration 080: Arbeitsplan-Tab
--  (1) get_team_planned_shifts liefert created_by + Ersteller-Name
--  (2) update_planned_shift: Chef aendert Stunden einer geplanten Schicht
--  (3) delete_planned_shift: protokolliert die Loeschung (Pflicht-Meldung)
--  (4) get_team_schedule_changes: wer hat an welchem Tag geaendert (Wochen-Scope)

-- (1) Schichten inkl. Ersteller
DROP FUNCTION IF EXISTS public.get_team_planned_shifts(date, date, boolean);

CREATE OR REPLACE FUNCTION public.get_team_planned_shifts(
  p_from date, p_to date, p_include_demo boolean DEFAULT false)
RETURNS TABLE(id uuid, employee_id uuid, shift_date date,
              start_time time without time zone, end_time time without time zone,
              created_by uuid, created_by_name text)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT s.id, s.employee_id, s.shift_date, s.start_time, s.end_time,
         s.created_by, cb.name
  FROM public.planned_shifts s
  JOIN public.employees e ON e.id = s.employee_id
  LEFT JOIN public.employees cb ON cb.id = s.created_by
  WHERE public.is_chef()
    AND (p_include_demo OR NOT e.is_demo)
    AND s.shift_date BETWEEN p_from AND p_to
  ORDER BY s.shift_date, s.start_time;
$$;
GRANT EXECUTE ON FUNCTION public.get_team_planned_shifts(date, date, boolean) TO authenticated;

-- (2) Schicht-Stunden aendern
CREATE OR REPLACE FUNCTION public.update_planned_shift(
  p_id uuid, p_from text, p_to text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_chef uuid; v_emp uuid; v_date date; v_detail text;
BEGIN
  IF NOT public.is_chef() THEN RAISE EXCEPTION 'Keine Berechtigung'; END IF;
  SELECT employee_id, shift_date INTO v_emp, v_date
    FROM public.planned_shifts WHERE id = p_id;
  IF v_emp IS NULL THEN RAISE EXCEPTION 'Schicht nicht gefunden'; END IF;
  IF public._my_level() <= public._level_of(v_emp) THEN
    RAISE EXCEPTION 'Keine Berechtigung fuer diesen Mitarbeiter (Hierarchie)';
  END IF;
  IF v_date < current_date THEN
    RAISE EXCEPTION 'Vergangene Tage koennen nicht geaendert werden';
  END IF;
  IF p_from IS NULL OR p_to IS NULL THEN
    RAISE EXCEPTION 'Start- und Endzeit erforderlich';
  END IF;
  IF p_to <= p_from THEN
    RAISE EXCEPTION 'Endzeit muss nach Startzeit liegen';
  END IF;

  SELECT id INTO v_chef FROM public.employees WHERE auth_user_id = auth.uid();
  UPDATE public.planned_shifts
    SET start_time = p_from::time, end_time = p_to::time
    WHERE id = p_id;

  v_detail := to_char(v_date,'DD.MM.YYYY') || ': ' || p_from || '-' || p_to;
  INSERT INTO public.schedule_change_events
    (employee_id, event_date, action, detail, created_by)
    VALUES (v_emp, v_date, 'changed', v_detail, v_chef);
END; $$;
GRANT EXECUTE ON FUNCTION public.update_planned_shift(uuid, text, text) TO authenticated;

-- (3) Loeschen protokolliert die Aenderung (Pflicht-Meldung beim Mitarbeiter)
CREATE OR REPLACE FUNCTION public.delete_planned_shift(p_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE v_chef uuid; v_emp uuid; v_date date;
BEGIN
  IF NOT public.is_chef() THEN RAISE EXCEPTION 'Keine Berechtigung'; END IF;
  SELECT employee_id, shift_date INTO v_emp, v_date
    FROM public.planned_shifts WHERE id = p_id;
  IF v_emp IS NOT NULL THEN
    SELECT id INTO v_chef FROM public.employees WHERE auth_user_id = auth.uid();
    INSERT INTO public.schedule_change_events
      (employee_id, event_date, action, detail, created_by)
      VALUES (v_emp, v_date, 'deleted',
              to_char(v_date,'DD.MM.YYYY') || ': Schicht entfernt', v_chef);
  END IF;
  DELETE FROM public.planned_shifts WHERE id = p_id;
END; $$;

-- (4) Wer hat in dieser Woche welchen Tag geaendert (fuer "von X"-Zeile)
CREATE OR REPLACE FUNCTION public.get_team_schedule_changes(
  p_from date, p_to date)
RETURNS TABLE(employee_id uuid, event_date date, action text, changed_by_name text)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT DISTINCT ON (sce.employee_id, sce.event_date)
         sce.employee_id, sce.event_date, sce.action, cb.name
  FROM public.schedule_change_events sce
  LEFT JOIN public.employees cb ON cb.id = sce.created_by
  WHERE public.is_chef()
    AND sce.event_date BETWEEN p_from AND p_to
  ORDER BY sce.employee_id, sce.event_date, sce.created_at DESC;
$$;
GRANT EXECUTE ON FUNCTION public.get_team_schedule_changes(date, date) TO authenticated;
