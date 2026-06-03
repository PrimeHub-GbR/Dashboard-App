-- Migration 062: Reviewer-Name (wer hat genehmigt/abgelehnt/storniert) in die
-- Chef-RPCs aufnehmen. Für die Genehmigungs-Historie (nur Chef-Ansichten).

DROP FUNCTION IF EXISTS public.get_team_absences(date, date);
CREATE FUNCTION public.get_team_absences(p_from date, p_to date)
RETURNS TABLE (
  id uuid, employee_id uuid, start_date date, end_date date,
  type text, status text, reviewer_name text, reviewed_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT a.id, a.employee_id, a.start_date, a.end_date, a.type, a.status,
         r.name, a.reviewed_at
  FROM public.absence_requests a
  LEFT JOIN public.employees r ON r.id = a.reviewed_by
  WHERE public.is_chef()
    AND a.status IN ('pending', 'approved', 'cancel_requested')
    AND a.start_date <= p_to AND a.end_date >= p_from
  ORDER BY a.start_date;
$$;
GRANT EXECUTE ON FUNCTION public.get_team_absences(date, date) TO authenticated;

DROP FUNCTION IF EXISTS public.get_chef_archived_absences();
CREATE FUNCTION public.get_chef_archived_absences()
RETURNS TABLE (
  id uuid, employee_id uuid, employee_name text, employee_color text,
  start_date date, end_date date, type text, status text, note text,
  decision_note text, reviewed_at timestamptz, reviewer_name text
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT a.id, a.employee_id, e.name, e.color,
         a.start_date, a.end_date, a.type, a.status, a.note,
         a.decision_note, a.reviewed_at, r.name
  FROM public.absence_requests a
  JOIN public.employees e ON e.id = a.employee_id
  LEFT JOIN public.employees r ON r.id = a.reviewed_by
  WHERE public.is_chef()
    AND a.status IN ('rejected', 'cancelled')
  ORDER BY a.reviewed_at DESC NULLS LAST
  LIMIT 100;
$$;
GRANT EXECUTE ON FUNCTION public.get_chef_archived_absences() TO authenticated;
