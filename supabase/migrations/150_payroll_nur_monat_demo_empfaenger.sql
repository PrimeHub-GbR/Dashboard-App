-- Migration 150: Finanzbuchhaltung nur Monatsuebersicht + Demo als Fristen-Empfaenger
--
-- Fachlich:
--   * Die Finanzbuchhaltung (is_payroll) darf NUR die Monatsuebersicht sehen:
--     Name, Ist/Soll-Stunden und genehmigte Urlaubstage des Monats. Keine
--     Stempelzeiten, keine Tagesdetails, kein Resturlaub, keine Archive.
--     -> Lese-Gates aus Mig 147 fuer die Detail-RPCs zurueck auf is_chef().
--     Es bleiben fuer Payroll: get_all_employees_month_hours, get_employee_balance,
--     get_absence_summary (genehmigte Urlaubstage je Monat).
--   * Der Demo-Mitarbeiter (is_demo) ist als Fristen-Empfaenger waehlbar, wenn
--     der Demo-Schalter in der App aktiv ist (p_include_demo). Damit kann die
--     GF wiederkehrende Aufgaben in der Demo-Ansicht testen.

-- ===========================================================================
-- 1. Payroll-Gate von den Detail-RPCs entfernen (dynamisch, Live-Definition)
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
        'get_time_entries', 'get_vacation_balance', 'get_vacation_overview',
        'get_employee_vacation_months', 'get_archive_employees',
        'get_employee_archive', 'get_employee_archive_days',
        'get_employee_archive_entries', 'get_employee_archive_monthly',
        'get_month_completion_facts', 'mobile_work_list', 'pauschal_list',
        'get_team_absences'
      )
  LOOP
    v_def := pg_get_functiondef(r.oid);
    IF v_def NOT LIKE '%public.is_chef_or_payroll()%' THEN
      RAISE NOTICE 'skip % (kein Payroll-Gate)', r.proname;
      CONTINUE;
    END IF;
    v_def := replace(v_def, 'public.is_chef_or_payroll()', 'public.is_chef()');
    IF r.proname = 'get_team_absences' THEN
      v_def := replace(v_def,
        'AND (public.is_payroll() OR public._my_level() > public._level_of(a.employee_id))',
        'AND public._my_level() > public._level_of(a.employee_id)');
    END IF;
    EXECUTE v_def;
    RAISE NOTICE 'reverted %', r.proname;
  END LOOP;
END $m$;

-- ===========================================================================
-- 2. Demo-Mitarbeiter als Fristen-Empfaenger (optional per Parameter)
-- ===========================================================================
DROP FUNCTION IF EXISTS public.get_reminder_recipient_options();
CREATE FUNCTION public.get_reminder_recipient_options(p_include_demo boolean DEFAULT false)
  RETURNS TABLE(id uuid, name text, "position" text, is_demo boolean)
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
AS $fn$
  SELECT e.id, e.name, e.position, e.is_demo
  FROM public.employees e
  WHERE public.is_gf()
    AND e.is_active
    AND (p_include_demo OR NOT e.is_demo)
  ORDER BY
    CASE e.position
      WHEN 'geschaeftsfuehrer' THEN 0
      WHEN 'manager' THEN 1
      WHEN 'finanzbuchhalter' THEN 2
      ELSE 3
    END,
    e.name;
$fn$;
GRANT EXECUTE ON FUNCTION public.get_reminder_recipient_options(boolean) TO authenticated;

-- Validierung: aktive Mitarbeiter, Demo erlaubt (nur zum Testen sinnvoll).
CREATE OR REPLACE FUNCTION public._gf_normalize_recipients(p_ids uuid[])
  RETURNS uuid[]
  LANGUAGE plpgsql STABLE
  SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE
  v_valid uuid[];
  v_input integer;
BEGIN
  SELECT count(DISTINCT x) INTO v_input FROM unnest(COALESCE(p_ids, '{}'::uuid[])) AS x;
  SELECT array_agg(DISTINCT e.id) INTO v_valid
  FROM unnest(COALESCE(p_ids, '{}'::uuid[])) AS x(id)
  JOIN public.employees e ON e.id = x.id
  WHERE e.is_active;
  IF v_valid IS NULL OR cardinality(v_valid) < 1 THEN
    RAISE EXCEPTION 'Mindestens ein Empfaenger erforderlich';
  END IF;
  IF cardinality(v_valid) <> v_input THEN
    RAISE EXCEPTION 'Nur aktive Mitarbeiter sind als Empfaenger zulaessig';
  END IF;
  RETURN v_valid;
END;
$fn$;
