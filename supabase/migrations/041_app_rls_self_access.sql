-- Migration 041: RLS Self-Access fuer Mitarbeiter-App
--
-- Bisher: jede authenticated User sah alle Zeilen (Policy "USING (true)").
-- Neu: Mitarbeitende sehen nur eigene Daten via auth_user_id, Manager
-- zusaetzlich ihr Team (employees.reports_to). Admin und Manager behalten
-- durch is_admin_or_manager()-Override Vollzugriff — wichtig fuer das
-- bestehende Web-Dashboard (useLiveCheckins/useMonthStats lesen via
-- Browser-Client direkt aus time_entries).
--
-- Schreibrechte bleiben primaer auf service_role. Zusaetzlich erhalten
-- Mitarbeitende Insert/Update auf employee_schedule_requests fuer
-- die Wochenplanungs-Abgabe direkt aus der App.

-- =========================================================================
-- Helper-Functions (SECURITY DEFINER, stable)
-- =========================================================================

CREATE OR REPLACE FUNCTION public.is_admin_or_manager()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
      AND role IN ('admin', 'manager')
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_admin_or_manager() TO authenticated;

COMMENT ON FUNCTION public.is_admin_or_manager() IS
  'TRUE wenn auth.uid() in user_roles als admin oder manager eingetragen ist.';

CREATE OR REPLACE FUNCTION public.current_employee_id()
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $$
  SELECT id FROM public.employees WHERE auth_user_id = auth.uid() LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.current_employee_id() TO authenticated;

COMMENT ON FUNCTION public.current_employee_id() IS
  'employee_id des aktuell eingeloggten Users via employees.auth_user_id = auth.uid(). NULL wenn nicht verknuepft.';

-- =========================================================================
-- employees
-- =========================================================================
DROP POLICY IF EXISTS "employees_select_authenticated" ON public.employees;

CREATE POLICY "employees_select_role_or_self" ON public.employees
FOR SELECT TO authenticated
USING (
  public.is_admin_or_manager()
  OR id = public.current_employee_id()
  OR reports_to = public.current_employee_id()
);

-- =========================================================================
-- time_entries
-- =========================================================================
DROP POLICY IF EXISTS "time_entries_select_authenticated" ON public.time_entries;

CREATE POLICY "time_entries_select_role_or_self" ON public.time_entries
FOR SELECT TO authenticated
USING (
  public.is_admin_or_manager()
  OR employee_id = public.current_employee_id()
  OR employee_id IN (
    SELECT id FROM public.employees WHERE reports_to = public.current_employee_id()
  )
);

-- =========================================================================
-- shift_plans
-- =========================================================================
DROP POLICY IF EXISTS "shift_plans_select_authenticated" ON public.shift_plans;

CREATE POLICY "shift_plans_select_role_or_self" ON public.shift_plans
FOR SELECT TO authenticated
USING (
  public.is_admin_or_manager()
  OR employee_id = public.current_employee_id()
  OR employee_id IN (
    SELECT id FROM public.employees WHERE reports_to = public.current_employee_id()
  )
);

-- =========================================================================
-- employee_schedule_requests
-- =========================================================================
DROP POLICY IF EXISTS "esr_select_authenticated" ON public.employee_schedule_requests;

CREATE POLICY "esr_select_role_or_self" ON public.employee_schedule_requests
FOR SELECT TO authenticated
USING (
  public.is_admin_or_manager()
  OR employee_id = public.current_employee_id()
  OR employee_id IN (
    SELECT id FROM public.employees WHERE reports_to = public.current_employee_id()
  )
);

-- Mitarbeitende koennen eigene Wochenplanungs-Abgabe direkt schreiben
CREATE POLICY "esr_insert_self" ON public.employee_schedule_requests
FOR INSERT TO authenticated
WITH CHECK (employee_id = public.current_employee_id());

CREATE POLICY "esr_update_self" ON public.employee_schedule_requests
FOR UPDATE TO authenticated
USING (employee_id = public.current_employee_id())
WITH CHECK (employee_id = public.current_employee_id());
