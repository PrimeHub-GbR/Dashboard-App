-- Migration 086: Chef kann genehmigte Abwesenheiten loeschen.
-- Manager (Level 2) beantragt -> Geschaeftsfuehrung (Level >=3) finalisiert.
-- GF loescht direkt (UI macht die Doppel-Abfrage).

ALTER TABLE public.absence_requests DROP CONSTRAINT IF EXISTS absence_requests_status_check;
ALTER TABLE public.absence_requests ADD CONSTRAINT absence_requests_status_check
  CHECK (status = ANY (ARRAY['pending','approved','rejected','cancel_requested','cancelled','delete_requested']));

CREATE OR REPLACE FUNCTION public.admin_delete_absence(p_id uuid)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE v_me uuid; v_status text; v_emp uuid; v_new text;
BEGIN
  IF NOT public.is_chef() THEN RAISE EXCEPTION 'Keine Berechtigung'; END IF;
  SELECT id INTO v_me FROM public.employees WHERE auth_user_id = auth.uid();
  SELECT status, employee_id INTO v_status, v_emp
  FROM public.absence_requests WHERE id = p_id;
  IF v_status IS NULL THEN RAISE EXCEPTION 'Antrag nicht gefunden'; END IF;
  IF public._my_level() <= public._level_of(v_emp) THEN
    RAISE EXCEPTION 'Keine Berechtigung fuer diesen Antrag (Hierarchie)';
  END IF;
  IF v_status <> 'approved' THEN
    RAISE EXCEPTION 'Nur genehmigte Abwesenheiten koennen geloescht werden';
  END IF;
  IF public._my_level() >= 3 THEN
    v_new := 'cancelled';
  ELSE
    v_new := 'delete_requested';
  END IF;
  UPDATE public.absence_requests
  SET status = v_new, reviewed_by = v_me, reviewed_at = now()
  WHERE id = p_id;
  RETURN v_new;
END; $$;
GRANT EXECUTE ON FUNCTION public.admin_delete_absence(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_finalize_absence_deletion(p_id uuid, p_approve boolean)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE v_me uuid; v_status text; v_emp uuid;
BEGIN
  IF public._my_level() < 3 THEN RAISE EXCEPTION 'Nur die Geschaeftsfuehrung darf finalisieren'; END IF;
  SELECT id INTO v_me FROM public.employees WHERE auth_user_id = auth.uid();
  SELECT status, employee_id INTO v_status, v_emp
  FROM public.absence_requests WHERE id = p_id;
  IF v_status IS NULL THEN RAISE EXCEPTION 'Antrag nicht gefunden'; END IF;
  IF v_status <> 'delete_requested' THEN RAISE EXCEPTION 'Kein offener Loeschantrag'; END IF;
  UPDATE public.absence_requests
  SET status = CASE WHEN p_approve THEN 'cancelled' ELSE 'approved' END,
      reviewed_by = v_me, reviewed_at = now()
  WHERE id = p_id;
END; $$;
GRANT EXECUTE ON FUNCTION public.admin_finalize_absence_deletion(uuid, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_chef_absence_notifications(p_include_demo boolean DEFAULT false)
RETURNS TABLE(id uuid, employee_id uuid, employee_name text, employee_color text,
              start_date date, end_date date, type text, status text, note text,
              created_at timestamp with time zone)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT a.id, a.employee_id, e.name, e.color,
         a.start_date, a.end_date, a.type, a.status, a.note, a.created_at
  FROM public.absence_requests a
  JOIN public.employees e ON e.id = a.employee_id
  WHERE public.is_chef()
    AND (p_include_demo OR NOT e.is_demo)
    AND (
      a.status IN ('pending','cancel_requested')
      OR (a.status = 'delete_requested' AND public._my_level() >= 3)
    )
    AND public._my_level() > public._level_of(a.employee_id)
  ORDER BY a.created_at DESC
  LIMIT 50;
$$;

-- Team-Kalender zeigt auch offene Loeschantraege (delete_requested), damit der
-- Eintrag sichtbar bleibt, bis die Geschaeftsfuehrung finalisiert.
CREATE OR REPLACE FUNCTION public.get_team_absences(p_from date, p_to date, p_include_demo boolean DEFAULT false)
 RETURNS TABLE(id uuid, employee_id uuid, start_date date, end_date date, type text, status text, reviewer_name text, reviewed_at timestamp with time zone)
 LANGUAGE sql STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT a.id, a.employee_id, a.start_date, a.end_date, a.type, a.status,
         r.name, a.reviewed_at
  FROM public.absence_requests a
  JOIN public.employees e ON e.id = a.employee_id
  LEFT JOIN public.employees r ON r.id = a.reviewed_by
  WHERE public.is_chef()
    AND (p_include_demo OR NOT e.is_demo)
    AND a.status IN ('pending', 'approved', 'cancel_requested', 'delete_requested')
    AND a.start_date <= p_to AND a.end_date >= p_from
    AND public._my_level() > public._level_of(a.employee_id)
  ORDER BY a.start_date;
$function$;
