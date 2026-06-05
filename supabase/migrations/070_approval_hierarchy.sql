-- Migration 070: Genehmigungs-Hierarchie nach Position.
-- Level: geschaeftsfuehrer=3, manager=2, mitarbeiter=1 (role admin=3, manager=2).
-- Genehmigen darf nur, wer ein STRIKT hoeheres Level hat als der Antragsteller.
-- So gehen Manager-Antraege an die Geschaeftsfuehrung; Manager genehmigen nur
-- Mitarbeiter; niemand genehmigt sich selbst.

CREATE OR REPLACE FUNCTION public._level_from(p_position text, p_role text)
RETURNS integer LANGUAGE sql IMMUTABLE AS $$
  SELECT GREATEST(
    CASE p_position
      WHEN 'geschaeftsfuehrer' THEN 3
      WHEN 'manager' THEN 2
      ELSE 1 END,
    CASE p_role
      WHEN 'admin' THEN 3
      WHEN 'manager' THEN 2
      ELSE 0 END
  );
$$;

-- Level des eingeloggten Users.
CREATE OR REPLACE FUNCTION public._my_level()
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp' AS $$
  SELECT public._level_from(
    (SELECT position FROM public.employees WHERE auth_user_id = auth.uid() LIMIT 1),
    (SELECT role FROM public.user_roles WHERE user_id = auth.uid() LIMIT 1)
  );
$$;

-- Level eines Mitarbeiters per employee-id.
CREATE OR REPLACE FUNCTION public._level_of(p_emp uuid)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp' AS $$
  SELECT public._level_from(
    (SELECT position FROM public.employees WHERE id = p_emp),
    (SELECT ur.role FROM public.user_roles ur
       JOIN public.employees e ON e.auth_user_id = ur.user_id
      WHERE e.id = p_emp LIMIT 1)
  );
$$;

-- ===================================== decide_absence_request mit Hierarchie

CREATE OR REPLACE FUNCTION public.decide_absence_request(
  p_id uuid, p_approve boolean, p_note text DEFAULT NULL::text
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_reviewer uuid;
  v_status   text;
  v_emp      uuid;
  v_new      text;
BEGIN
  IF NOT public.is_chef() THEN RAISE EXCEPTION 'Keine Berechtigung'; END IF;
  SELECT id INTO v_reviewer FROM public.employees WHERE auth_user_id = auth.uid();

  SELECT status, employee_id INTO v_status, v_emp
  FROM public.absence_requests WHERE id = p_id;
  IF v_status IS NULL THEN RAISE EXCEPTION 'Antrag nicht gefunden'; END IF;

  -- Hierarchie: nur Antraege von strikt niedrigerem Level entscheiden.
  IF public._my_level() <= public._level_of(v_emp) THEN
    RAISE EXCEPTION 'Keine Berechtigung fuer diesen Antrag (Hierarchie)';
  END IF;

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
$function$;

-- ============================ get_chef_absence_notifications mit Hierarchie

DROP FUNCTION IF EXISTS public.get_chef_absence_notifications(boolean);
CREATE FUNCTION public.get_chef_absence_notifications(
  p_include_demo boolean DEFAULT false
)
RETURNS TABLE(
  id uuid, employee_id uuid, employee_name text, employee_color text,
  start_date date, end_date date, type text, status text, note text,
  created_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT a.id, a.employee_id, e.name, e.color,
         a.start_date, a.end_date, a.type, a.status, a.note, a.created_at
  FROM public.absence_requests a
  JOIN public.employees e ON e.id = a.employee_id
  WHERE public.is_chef()
    AND (p_include_demo OR NOT e.is_demo)
    AND a.status IN ('pending','cancel_requested')
    AND public._my_level() > public._level_of(a.employee_id)
  ORDER BY a.created_at DESC
  LIMIT 50;
$$;
GRANT EXECUTE ON FUNCTION public.get_chef_absence_notifications(boolean) TO authenticated;

-- ======================================== get_team_absences mit Hierarchie

DROP FUNCTION IF EXISTS public.get_team_absences(date, date, boolean);
CREATE FUNCTION public.get_team_absences(
  p_from date,
  p_to date,
  p_include_demo boolean DEFAULT false
)
RETURNS TABLE(
  id uuid, employee_id uuid, start_date date, end_date date,
  type text, status text, reviewer_name text, reviewed_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT a.id, a.employee_id, a.start_date, a.end_date, a.type, a.status,
         r.name, a.reviewed_at
  FROM public.absence_requests a
  JOIN public.employees e ON e.id = a.employee_id
  LEFT JOIN public.employees r ON r.id = a.reviewed_by
  WHERE public.is_chef()
    AND (p_include_demo OR NOT e.is_demo)
    AND a.status IN ('pending', 'approved', 'cancel_requested')
    AND a.start_date <= p_to AND a.end_date >= p_from
    AND public._my_level() > public._level_of(a.employee_id)
  ORDER BY a.start_date;
$$;
GRANT EXECUTE ON FUNCTION public.get_team_absences(date, date, boolean) TO authenticated;

-- =================================== get_vacation_overview ohne Geschaeftsfuehrer

CREATE OR REPLACE FUNCTION public.get_vacation_overview(
  p_year integer DEFAULT NULL,
  p_include_demo boolean DEFAULT false
)
RETURNS TABLE(
  employee_id uuid, name text, color text,
  entitlement integer, remaining integer, future_booked integer
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT e.id, e.name, e.color,
         vb.entitlement, vb.remaining,
         COALESCE(fut.days, 0)::int
  FROM public.employees e
  CROSS JOIN LATERAL public.get_vacation_balance(
    e.id, COALESCE(p_year, EXTRACT(YEAR FROM current_date)::int)) vb
  LEFT JOIN LATERAL (
    SELECT SUM(public._absence_workdays(
              e.id, GREATEST(a.start_date, current_date), a.end_date)) AS days
    FROM public.absence_requests a
    WHERE a.employee_id = e.id
      AND a.type = 'urlaub'
      AND a.status = 'approved'
      AND a.end_date >= current_date
      AND EXTRACT(YEAR FROM a.start_date)
          = COALESCE(p_year, EXTRACT(YEAR FROM current_date)::int)
  ) fut ON true
  WHERE public.is_chef()
    AND e.is_active
    AND e.position <> 'geschaeftsfuehrer'
    AND (p_include_demo OR NOT e.is_demo)
  ORDER BY e.name;
$$;
GRANT EXECUTE ON FUNCTION public.get_vacation_overview(integer, boolean) TO authenticated;
