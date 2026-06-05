-- Migration 073: Chef-RPCs positionsbewusst machen.
--
-- Problem: viele Mitarbeiter-/Zeit-RPCs gaten auf is_admin_or_manager()
-- (NUR user_roles.role). Ein Positions-Manager (position='manager', role=null)
-- wurde dadurch komplett ausgesperrt, obwohl er laut is_chef() Chef ist.
--
-- Loesung: diese RPCs gaten jetzt auf is_chef() (role ODER position). Mutierende
-- RPCs bekommen zusaetzlich den Hierarchie-Schutz (_my_level > _level_of Ziel),
-- damit ein Manager nur Untergebene aendern kann. CashFlow + Tasks (RLS via
-- is_admin_or_manager) bleiben BEWUSST rollenbasiert und unveraendert.

-- ============================================================ Lese-RPCs

-- get_employee_balance: Zugriff fuer Chef ODER self ODER direkter Report.
CREATE OR REPLACE FUNCTION public.get_employee_balance(
  p_employee_id uuid, p_period_start date, p_period_end date
)
RETURNS TABLE(employee_id uuid, period_start date, period_end date,
  ist_minutes integer, soll_minutes integer, diff_minutes integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_caller_emp_id UUID;
  v_schedule JSONB;
  v_ist_minutes INTEGER;
  v_soll_minutes INTEGER;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF p_period_end < p_period_start THEN
    RAISE EXCEPTION 'period_end must be >= period_start';
  END IF;

  v_caller_emp_id := public.current_employee_id();

  IF NOT (
    public.is_chef()
    OR p_employee_id = v_caller_emp_id
    OR EXISTS (SELECT 1 FROM public.employees WHERE id = p_employee_id AND reports_to = v_caller_emp_id)
  ) THEN
    RAISE EXCEPTION 'Access denied for employee %', p_employee_id;
  END IF;

  SELECT weekly_schedule INTO v_schedule FROM public.employees WHERE id = p_employee_id;
  IF v_schedule IS NULL THEN
    RAISE EXCEPTION 'Employee % not found', p_employee_id;
  END IF;

  WITH daily AS (
    SELECT
      (te.checked_in_at AT TIME ZONE 'Europe/Berlin')::date AS work_day,
      SUM(EXTRACT(EPOCH FROM (te.checked_out_at - te.checked_in_at)) / 60.0) AS gross,
      EXTRACT(EPOCH FROM (MAX(te.checked_out_at) - MIN(te.checked_in_at))) / 60.0 AS span
    FROM public.time_entries te
    WHERE te.employee_id = p_employee_id
      AND te.checked_in_at >= p_period_start::TIMESTAMPTZ
      AND te.checked_in_at < (p_period_end + 1)::TIMESTAMPTZ
      AND te.checked_out_at IS NOT NULL
    GROUP BY 1
  )
  SELECT COALESCE(SUM(
    gross - GREATEST(0,
      (CASE WHEN gross <= 360 THEN 0 WHEN gross <= 540 THEN 30 ELSE 45 END)
      - GREATEST(0, span - gross)
    )
  ), 0)::INTEGER
  INTO v_ist_minutes
  FROM daily;

  WITH days AS (
    SELECT generate_series(p_period_start, p_period_end, '1 day'::interval)::DATE AS d
  )
  SELECT COALESCE(SUM(
    (CASE EXTRACT(DOW FROM days.d)::INTEGER
      WHEN 1 THEN COALESCE((v_schedule->>'mon')::NUMERIC, 0)
      WHEN 2 THEN COALESCE((v_schedule->>'tue')::NUMERIC, 0)
      WHEN 3 THEN COALESCE((v_schedule->>'wed')::NUMERIC, 0)
      WHEN 4 THEN COALESCE((v_schedule->>'thu')::NUMERIC, 0)
      WHEN 5 THEN COALESCE((v_schedule->>'fri')::NUMERIC, 0)
      WHEN 6 THEN COALESCE((v_schedule->>'sat')::NUMERIC, 0)
      WHEN 0 THEN COALESCE((v_schedule->>'sun')::NUMERIC, 0)
      ELSE 0 END) * 60
  ), 0)::INTEGER
  INTO v_soll_minutes
  FROM days;

  RETURN QUERY SELECT p_employee_id, p_period_start, p_period_end,
    v_ist_minutes, v_soll_minutes, (v_ist_minutes - v_soll_minutes);
END;
$function$;

-- get_time_entries: Chef ODER self.
CREATE OR REPLACE FUNCTION public.get_time_entries(
  p_employee_id uuid, p_from timestamptz, p_to timestamptz
)
RETURNS TABLE(id uuid, checked_in_at timestamptz, checked_out_at timestamptz,
  break_minutes integer, note text, auth_method text, corrected boolean,
  corrector_name text)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT t.id, t.checked_in_at, t.checked_out_at, t.break_minutes, t.note,
         t.auth_method, (t.corrected_by IS NOT NULL), c.name
  FROM public.time_entries t
  LEFT JOIN public.employees c ON c.auth_user_id = t.corrected_by
  WHERE t.employee_id = p_employee_id
    AND t.checked_in_at >= p_from AND t.checked_in_at < p_to
    AND (public.is_chef()
         OR t.employee_id = public.current_employee_id())
  ORDER BY t.checked_in_at;
$function$;

-- get_employees_app_status: Chef.
CREATE OR REPLACE FUNCTION public.get_employees_app_status()
RETURNS TABLE(employee_id uuid, status text)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT e.id,
    CASE
      WHEN e.auth_user_id IS NULL THEN 'none'
      WHEN u.last_sign_in_at IS NOT NULL THEN 'active'
      ELSE 'pending'
    END AS status
  FROM employees e
  LEFT JOIN auth.users u ON u.id = e.auth_user_id
  WHERE public.is_chef();
$function$;

-- ===================================== admin_update_employee → is_chef()-Gate
-- (Hierarchie- + Eskalationsschutz bereits aus 071/072.)

CREATE OR REPLACE FUNCTION public.admin_update_employee(
  p_id uuid, p_target_hours numeric DEFAULT NULL::numeric,
  p_weekly_schedule jsonb DEFAULT NULL::jsonb, p_position text DEFAULT NULL::text,
  p_is_active boolean DEFAULT NULL::boolean, p_color text DEFAULT NULL::text,
  p_phone text DEFAULT NULL::text, p_email text DEFAULT NULL::text,
  p_home_address text DEFAULT NULL::text, p_birth_date date DEFAULT NULL::date,
  p_reports_to uuid DEFAULT NULL::uuid, p_vacation_days integer DEFAULT NULL::integer,
  p_entry_date date DEFAULT NULL::date
)
RETURNS employees
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_row public.employees;
BEGIN
  IF NOT public.is_chef() THEN
    RAISE EXCEPTION 'insufficient_privilege: nur Chef' USING ERRCODE = '42501';
  END IF;

  IF NOT (public._my_level() > public._level_of(p_id)
          OR (public._my_level() = 3 AND public._level_of(p_id) = 3)) THEN
    RAISE EXCEPTION 'insufficient_privilege: keine Berechtigung fuer diese Stammdaten (Hierarchie)'
      USING ERRCODE = '42501';
  END IF;

  IF p_position IS NOT NULL
     AND p_position NOT IN ('geschaeftsfuehrer', 'manager', 'mitarbeiter') THEN
    RAISE EXCEPTION 'invalid position: %', p_position USING ERRCODE = '22023';
  END IF;

  IF p_position IS NOT NULL
     AND public._my_level() < 3
     AND public._level_from(p_position, NULL) >= public._my_level() THEN
    RAISE EXCEPTION 'insufficient_privilege: Position zu hoch fuer Ihre Berechtigung'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.employees SET
    target_hours_per_month = COALESCE(p_target_hours, target_hours_per_month),
    weekly_schedule        = COALESCE(p_weekly_schedule, weekly_schedule),
    position               = COALESCE(p_position, position),
    is_active              = COALESCE(p_is_active, is_active),
    color                  = COALESCE(p_color, color),
    phone                  = COALESCE(p_phone, phone),
    email                  = COALESCE(p_email, email),
    home_address           = COALESCE(p_home_address, home_address),
    birth_date             = COALESCE(p_birth_date, birth_date),
    reports_to             = COALESCE(p_reports_to, reports_to),
    vacation_days_per_year = COALESCE(p_vacation_days, vacation_days_per_year),
    entry_date             = COALESCE(p_entry_date, entry_date),
    updated_at             = now()
  WHERE id = p_id
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'employee not found: %', p_id USING ERRCODE = 'P0002';
  END IF;

  RETURN v_row;
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_update_employee(
  p_id uuid, p_target_hours numeric DEFAULT NULL::numeric,
  p_weekly_schedule jsonb DEFAULT NULL::jsonb, p_position text DEFAULT NULL::text,
  p_is_active boolean DEFAULT NULL::boolean, p_color text DEFAULT NULL::text,
  p_phone text DEFAULT NULL::text, p_email text DEFAULT NULL::text,
  p_home_address text DEFAULT NULL::text, p_birth_date date DEFAULT NULL::date,
  p_reports_to uuid DEFAULT NULL::uuid
)
RETURNS employees
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_row public.employees;
BEGIN
  IF NOT public.is_chef() THEN
    RAISE EXCEPTION 'insufficient_privilege: nur Chef' USING ERRCODE = '42501';
  END IF;

  IF NOT (public._my_level() > public._level_of(p_id)
          OR (public._my_level() = 3 AND public._level_of(p_id) = 3)) THEN
    RAISE EXCEPTION 'insufficient_privilege: keine Berechtigung fuer diese Stammdaten (Hierarchie)'
      USING ERRCODE = '42501';
  END IF;

  IF p_position IS NOT NULL
     AND p_position NOT IN ('geschaeftsfuehrer', 'manager', 'mitarbeiter') THEN
    RAISE EXCEPTION 'invalid position: %', p_position USING ERRCODE = '22023';
  END IF;

  IF p_position IS NOT NULL
     AND public._my_level() < 3
     AND public._level_from(p_position, NULL) >= public._my_level() THEN
    RAISE EXCEPTION 'insufficient_privilege: Position zu hoch fuer Ihre Berechtigung'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.employees SET
    target_hours_per_month = COALESCE(p_target_hours, target_hours_per_month),
    weekly_schedule        = COALESCE(p_weekly_schedule, weekly_schedule),
    position               = COALESCE(p_position, position),
    is_active              = COALESCE(p_is_active, is_active),
    color                  = COALESCE(p_color, color),
    phone                  = COALESCE(p_phone, phone),
    email                  = COALESCE(p_email, email),
    home_address           = COALESCE(p_home_address, home_address),
    birth_date             = COALESCE(p_birth_date, birth_date),
    reports_to             = COALESCE(p_reports_to, reports_to),
    updated_at             = now()
  WHERE id = p_id
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'employee not found: %', p_id USING ERRCODE = 'P0002';
  END IF;

  RETURN v_row;
END;
$function$;

-- ===================================== admin_create_employee → is_chef() + Schutz

CREATE OR REPLACE FUNCTION public.admin_create_employee(
  p_name text, p_position text DEFAULT 'mitarbeiter'::text,
  p_target_hours numeric DEFAULT 160, p_weekly_schedule jsonb DEFAULT NULL::jsonb,
  p_color text DEFAULT NULL::text, p_phone text DEFAULT NULL::text,
  p_email text DEFAULT NULL::text, p_home_address text DEFAULT NULL::text,
  p_is_active boolean DEFAULT true, p_reports_to uuid DEFAULT NULL::uuid
)
RETURNS employees
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_row public.employees;
BEGIN
  IF NOT public.is_chef() THEN
    RAISE EXCEPTION 'insufficient_privilege: nur Chef' USING ERRCODE = '42501';
  END IF;

  IF p_name IS NULL OR length(btrim(p_name)) = 0 THEN
    RAISE EXCEPTION 'Name erforderlich' USING ERRCODE = '22023';
  END IF;

  IF p_position NOT IN ('geschaeftsfuehrer', 'manager', 'mitarbeiter') THEN
    RAISE EXCEPTION 'invalid position: %', p_position USING ERRCODE = '22023';
  END IF;

  -- Eskalationsschutz: keine Position >= eigenem Level anlegen. GF (3) frei.
  IF public._my_level() < 3
     AND public._level_from(p_position, NULL) >= public._my_level() THEN
    RAISE EXCEPTION 'insufficient_privilege: Position zu hoch fuer Ihre Berechtigung'
      USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.employees (
    name, position, target_hours_per_month, weekly_schedule,
    color, phone, email, home_address, is_active, reports_to, created_by
  ) VALUES (
    btrim(p_name),
    p_position,
    COALESCE(p_target_hours, 160),
    COALESCE(p_weekly_schedule,
      '{"mon":8,"tue":8,"wed":8,"thu":8,"fri":8,"sat":0,"sun":0}'::jsonb),
    COALESCE(p_color, '#22c55e'),
    p_phone,
    p_email,
    p_home_address,
    COALESCE(p_is_active, TRUE),
    p_reports_to,
    auth.uid()
  )
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$function$;

-- ===================================== admin_upsert_time_entry → is_chef() + Schutz

CREATE OR REPLACE FUNCTION public.admin_upsert_time_entry(
  p_id uuid, p_employee_id uuid, p_checked_in timestamptz,
  p_checked_out timestamptz DEFAULT NULL::timestamptz, p_note text DEFAULT NULL::text
)
RETURNS time_entries
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_row    public.time_entries;
  v_gross  INTEGER;
  v_break  INTEGER := 0;
  v_target uuid;
BEGIN
  IF NOT public.is_chef() THEN
    RAISE EXCEPTION 'insufficient_privilege: nur Chef' USING ERRCODE = '42501';
  END IF;

  -- Hierarchie: nur Zeiteintraege von Untergebenen korrigieren.
  v_target := COALESCE(
    (SELECT employee_id FROM public.time_entries WHERE id = p_id),
    p_employee_id);
  IF public._my_level() <= public._level_of(v_target) THEN
    RAISE EXCEPTION 'insufficient_privilege: keine Berechtigung fuer diesen Mitarbeiter (Hierarchie)'
      USING ERRCODE = '42501';
  END IF;

  IF p_checked_out IS NOT NULL THEN
    IF p_checked_out <= p_checked_in THEN
      RAISE EXCEPTION 'checked_out muss nach checked_in liegen'
        USING ERRCODE = '22023';
    END IF;
    v_gross := GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (p_checked_out - p_checked_in)) / 60)::INTEGER);
    v_break := CASE
                 WHEN v_gross <= 360 THEN 0
                 WHEN v_gross <= 540 THEN 30
                 ELSE 45
               END;
  END IF;

  IF p_id IS NULL THEN
    INSERT INTO public.time_entries (
      employee_id, checked_in_at, checked_out_at, break_minutes,
      note, auth_method, needs_review, corrected_by, corrected_at
    ) VALUES (
      p_employee_id, p_checked_in, p_checked_out, v_break,
      p_note, 'manual', true, auth.uid(), now()
    )
    RETURNING * INTO v_row;
  ELSE
    UPDATE public.time_entries SET
      checked_in_at  = p_checked_in,
      checked_out_at = p_checked_out,
      break_minutes  = v_break,
      note           = COALESCE(p_note, note),
      needs_review   = true,
      corrected_by   = auth.uid(),
      corrected_at   = now(),
      updated_at     = now()
    WHERE id = p_id
    RETURNING * INTO v_row;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'time_entry not found: %', p_id USING ERRCODE = 'P0002';
    END IF;
  END IF;

  RETURN v_row;
END;
$function$;

-- ===================================== admin_delete_time_entry → is_chef() + Schutz

CREATE OR REPLACE FUNCTION public.admin_delete_time_entry(p_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_target uuid;
BEGIN
  IF NOT public.is_chef() THEN
    RAISE EXCEPTION 'insufficient_privilege: nur Chef' USING ERRCODE = '42501';
  END IF;

  SELECT employee_id INTO v_target FROM public.time_entries WHERE id = p_id;
  IF v_target IS NULL THEN
    RAISE EXCEPTION 'time_entry not found: %', p_id USING ERRCODE = 'P0002';
  END IF;
  IF public._my_level() <= public._level_of(v_target) THEN
    RAISE EXCEPTION 'insufficient_privilege: keine Berechtigung fuer diesen Mitarbeiter (Hierarchie)'
      USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.time_entries WHERE id = p_id;
END;
$function$;

-- ===================================== admin_set_pin → is_chef() + Schutz

CREATE OR REPLACE FUNCTION public.admin_set_pin(p_id uuid, p_pin text DEFAULT NULL::text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NOT public.is_chef() THEN
    RAISE EXCEPTION 'insufficient_privilege: nur Chef' USING ERRCODE = '42501';
  END IF;

  IF public._my_level() <= public._level_of(p_id) THEN
    RAISE EXCEPTION 'insufficient_privilege: keine Berechtigung fuer diesen Mitarbeiter (Hierarchie)'
      USING ERRCODE = '42501';
  END IF;

  IF p_pin IS NULL THEN
    UPDATE public.employees SET pin = NULL, updated_at = now() WHERE id = p_id;
  ELSE
    IF p_pin !~ '^\d{4,8}$' THEN
      RAISE EXCEPTION 'PIN muss 4-8 Ziffern sein' USING ERRCODE = '22023';
    END IF;
    UPDATE public.employees
      SET pin = encode(digest(p_pin, 'sha256'), 'hex'), updated_at = now()
      WHERE id = p_id;
  END IF;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'employee not found: %', p_id USING ERRCODE = 'P0002';
  END IF;
END;
$function$;
