-- Migration 067: get_time_entries — Zeiteinträge inkl. Herkunft + Eintrager.
--
-- Liefert pro Zeiteintrag zusätzlich auth_method ('pin' = am Kiosk gestempelt,
-- 'manual' = manuell angelegt), ein corrected-Flag und den Namen des Chefs,
-- der manuell angelegt/korrigiert hat (Join über employees.auth_user_id).
-- SECURITY DEFINER umgeht RLS, daher Berechtigungsprüfung im WHERE.

CREATE OR REPLACE FUNCTION public.get_time_entries(
  p_employee_id uuid,
  p_from timestamptz,
  p_to timestamptz
)
RETURNS TABLE(
  id uuid, checked_in_at timestamptz, checked_out_at timestamptz,
  break_minutes integer, note text, auth_method text,
  corrected boolean, corrector_name text
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT t.id, t.checked_in_at, t.checked_out_at, t.break_minutes, t.note,
         t.auth_method, (t.corrected_by IS NOT NULL), c.name
  FROM public.time_entries t
  LEFT JOIN public.employees c ON c.auth_user_id = t.corrected_by
  WHERE t.employee_id = p_employee_id
    AND t.checked_in_at >= p_from AND t.checked_in_at < p_to
    AND (public.is_admin_or_manager()
         OR t.employee_id = public.current_employee_id())
  ORDER BY t.checked_in_at;
$$;
GRANT EXECUTE ON FUNCTION public.get_time_entries(uuid, timestamptz, timestamptz) TO authenticated;
