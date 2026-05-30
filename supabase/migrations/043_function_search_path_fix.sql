-- Migration 043: SET search_path fuer Functions ohne expliziten search_path
--
-- Supabase-Linter-Empfehlung 0011 (function_search_path_mutable):
-- Functions ohne festen search_path koennen durch User-Schemas
-- ueberschrieben werden. Wir fixieren auf "public, pg_temp" — beide
-- sind Standard und sicher.
--
-- Die in Migration 041 neu angelegten Functions (is_admin_or_manager,
-- current_employee_id) und 042 (get_employee_balance) bringen den
-- search_path bereits selbst mit.

ALTER FUNCTION public.cleanup_webauthn_challenges()
  SET search_path = public, pg_temp;

ALTER FUNCTION public.get_all_employees_month_hours(p_year integer, p_month integer)
  SET search_path = public, pg_temp;

ALTER FUNCTION public.get_daily_hours_per_employee(p_year integer, p_month integer)
  SET search_path = public, pg_temp;

ALTER FUNCTION public.get_employee_month_hours(p_employee_id uuid, p_year integer, p_month integer)
  SET search_path = public, pg_temp;

ALTER FUNCTION public.get_order_statuses()
  SET search_path = public, pg_temp;

ALTER FUNCTION public.get_order_suppliers()
  SET search_path = public, pg_temp;

ALTER FUNCTION public.is_staff_or_admin()
  SET search_path = public, pg_temp;

ALTER FUNCTION public.mark_timed_out_jobs()
  SET search_path = public, pg_temp;

ALTER FUNCTION public.set_updated_at()
  SET search_path = public, pg_temp;

ALTER FUNCTION public.update_employees_updated_at()
  SET search_path = public, pg_temp;

ALTER FUNCTION public.update_rebuy_settings_updated_at()
  SET search_path = public, pg_temp;

ALTER FUNCTION public.update_time_entries_updated_at()
  SET search_path = public, pg_temp;

ALTER FUNCTION public.update_time_tracking_settings_updated_at()
  SET search_path = public, pg_temp;
