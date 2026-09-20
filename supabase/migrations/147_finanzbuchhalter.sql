-- Migration 147: Position "Finanzbuchhalter" + "Aktiv = beschaeftigt"
--
-- Fachlich:
--   * Neue Position `finanzbuchhalter` (Finanzbuchhaltung). Berichtet direkt an
--     die Geschaeftsfuehrung (Organigramm neben dem Manager). Rechte wie
--     Mitarbeiter (Level 1, kein Chef-Modus) PLUS Lesezugriff auf Stunden,
--     Abwesenheiten und Urlaubstage aller Mitarbeiter (Lohnbuchhaltung).
--   * `employees.is_active` bedeutet ab jetzt nur noch "beschaeftigt". Wer
--     Mobiles Arbeiten aktiv hat, wird am Kiosk automatisch ausgeblendet
--     (Web-Kiosk filtert `mobiles_arbeiten = false`). Damit erscheinen
--     Remote-Mitarbeiter ueberall (Skill-Matrix, Team, Urlaub, Aufgaben).
--
-- Technik:
--   1. CHECK-Constraint auf employees.position erweitern.
--   2. Helper is_payroll() / is_chef_or_payroll().
--   3. Lese-RPCs: Gate is_chef() -> is_chef_or_payroll() (dynamisch aus den
--      Live-Definitionen ersetzt, Signaturen unveraendert):
--      get_employee_balance, get_time_entries, get_absence_summary,
--      get_vacation_balance, get_vacation_overview, get_employee_vacation_months,
--      get_archive_employees, get_employee_archive, get_employee_archive_days,
--      get_employee_archive_entries, get_employee_archive_monthly,
--      get_month_completion_facts, mobile_work_list, pauschal_list,
--      get_team_absences (zusaetzlich Hierarchie-Filter fuer Payroll offen).
--   4. get_all_employees_month_hours: SECURITY DEFINER + Gate (bisher lief sie
--      unter Caller-RLS; Payroll haette sonst nur sich selbst gesehen).
--   5. admin_update_employee (2 Overloads) + admin_create_employee: Position
--      `finanzbuchhalter` zulassen (Level 1 via _level_from bleibt).
--   6. Datenkorrektur: Ilayda Cetinkaya -> finanzbuchhalter, aktiv, reports_to GF.

-- ===========================================================================
-- 1. Position-Constraint
-- ===========================================================================
ALTER TABLE public.employees DROP CONSTRAINT IF EXISTS employees_position_check;
ALTER TABLE public.employees ADD CONSTRAINT employees_position_check
  CHECK (position IN ('geschaeftsfuehrer', 'manager', 'mitarbeiter', 'finanzbuchhalter'));

COMMENT ON COLUMN public.employees.position IS
  'geschaeftsfuehrer (Level 3) | manager (Level 2) | mitarbeiter (Level 1) | finanzbuchhalter (Level 1 + Lesezugriff Lohnbuchhaltung)';

-- ===========================================================================
-- 2. Helper
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.is_payroll()
  RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.employees
    WHERE auth_user_id = auth.uid() AND position = 'finanzbuchhalter'
  );
$$;
GRANT EXECUTE ON FUNCTION public.is_payroll() TO authenticated;
COMMENT ON FUNCTION public.is_payroll() IS
  'TRUE wenn der eingeloggte User die Position finanzbuchhalter hat (Lesezugriff Lohnbuchhaltung).';

CREATE OR REPLACE FUNCTION public.is_chef_or_payroll()
  RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT public.is_chef() OR public.is_payroll();
$$;
GRANT EXECUTE ON FUNCTION public.is_chef_or_payroll() TO authenticated;
COMMENT ON FUNCTION public.is_chef_or_payroll() IS
  'Lese-Gate: Chef (GF/Manager) ODER Finanzbuchhalter. Nur fuer lesende RPCs (Stunden, Urlaub, Abwesenheiten).';

-- ===========================================================================
-- 3. Lese-RPCs: Gate umstellen (dynamisch, Live-Definition bleibt erhalten)
-- ===========================================================================
DO $m$
DECLARE
  r     record;
  v_def text;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname
    FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace
      AND p.proname IN (
        'get_employee_balance', 'get_time_entries', 'get_absence_summary',
        'get_vacation_balance', 'get_vacation_overview', 'get_employee_vacation_months',
        'get_archive_employees', 'get_employee_archive', 'get_employee_archive_days',
        'get_employee_archive_entries', 'get_employee_archive_monthly',
        'get_month_completion_facts', 'mobile_work_list', 'pauschal_list',
        'get_team_absences'
      )
  LOOP
    v_def := pg_get_functiondef(r.oid);
    IF v_def NOT LIKE '%public.is_chef()%' THEN
      RAISE NOTICE 'skip % (kein is_chef-Gate)', r.proname;
      CONTINUE;
    END IF;
    v_def := replace(v_def, 'public.is_chef()', 'public.is_chef_or_payroll()');
    IF r.proname = 'get_team_absences' THEN
      v_def := replace(v_def,
        'AND public._my_level() > public._level_of(a.employee_id)',
        'AND (public.is_payroll() OR public._my_level() > public._level_of(a.employee_id))');
    END IF;
    EXECUTE v_def;
    RAISE NOTICE 'patched %', r.proname;
  END LOOP;
END $m$;

-- ===========================================================================
-- 4. get_all_employees_month_hours: SECURITY DEFINER + explizites Gate
-- ===========================================================================
DO $m$
DECLARE
  v_oid oid;
  v_def text;
BEGIN
  SELECT p.oid INTO v_oid FROM pg_proc p
  WHERE p.pronamespace = 'public'::regnamespace
    AND p.proname = 'get_all_employees_month_hours';
  v_def := pg_get_functiondef(v_oid);
  IF v_def NOT LIKE '%SECURITY DEFINER%' THEN
    v_def := replace(v_def, E' STABLE\n SET search_path', E' STABLE SECURITY DEFINER\n SET search_path');
  END IF;
  IF v_def NOT LIKE '%is_chef_or_payroll%' THEN
    v_def := replace(v_def,
      'WHERE e.is_active = true AND e.position != ''geschaeftsfuehrer''',
      'WHERE public.is_chef_or_payroll() AND e.is_active = true AND e.position != ''geschaeftsfuehrer''');
  END IF;
  IF v_def NOT LIKE '%SECURITY DEFINER%' OR v_def NOT LIKE '%is_chef_or_payroll%' THEN
    RAISE EXCEPTION 'get_all_employees_month_hours: Muster nicht gefunden';
  END IF;
  EXECUTE v_def;
END $m$;

-- ===========================================================================
-- 5. admin_update_employee (2 Overloads) + admin_create_employee
-- ===========================================================================
DO $m$
DECLARE
  r     record;
  v_def text;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname
    FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace
      AND p.proname IN ('admin_update_employee', 'admin_create_employee')
  LOOP
    v_def := pg_get_functiondef(r.oid);
    IF v_def NOT LIKE '%(''geschaeftsfuehrer'', ''manager'', ''mitarbeiter'')%' THEN
      RAISE EXCEPTION '%: Positionsliste nicht gefunden', r.proname;
    END IF;
    v_def := replace(v_def,
      '(''geschaeftsfuehrer'', ''manager'', ''mitarbeiter'')',
      '(''geschaeftsfuehrer'', ''manager'', ''mitarbeiter'', ''finanzbuchhalter'')');
    EXECUTE v_def;
  END LOOP;
END $m$;

-- ===========================================================================
-- 6. Datenkorrektur: neue Finanzbuchhalterin
-- ===========================================================================
UPDATE public.employees
SET position = 'finanzbuchhalter',
    is_active = true,
    reports_to = COALESCE(reports_to, 'a134ea96-b8ae-45af-8f7b-1a960d882d13'),
    reports_to_ids = CASE WHEN COALESCE(array_length(reports_to_ids, 1), 0) = 0
                          THEN ARRAY['a134ea96-b8ae-45af-8f7b-1a960d882d13']::uuid[]
                          ELSE reports_to_ids END,
    updated_at = now()
WHERE id = 'c3b996ce-d787-4904-819b-a17cdc1faaf7';
