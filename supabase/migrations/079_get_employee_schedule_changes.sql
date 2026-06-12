-- Migration 079: Chef sieht in der (nur lesenden) Mitarbeiter-Detailansicht,
-- an welchen Tagen der Arbeitsplan von einem Chef/Manager geaendert wurde.

CREATE OR REPLACE FUNCTION public.get_employee_schedule_changes(p_employee_id uuid)
RETURNS TABLE(event_date date, action text, changed_by_name text, created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT DISTINCT ON (sce.event_date)
         sce.event_date, sce.action, cb.name, sce.created_at
  FROM public.schedule_change_events sce
  LEFT JOIN public.employees cb ON cb.id = sce.created_by
  WHERE public.is_chef()
    AND sce.employee_id = p_employee_id
    AND sce.event_date >= current_date - interval '180 days'
  ORDER BY sce.event_date, sce.created_at DESC;
$$;
GRANT EXECUTE ON FUNCTION public.get_employee_schedule_changes(uuid) TO authenticated;
