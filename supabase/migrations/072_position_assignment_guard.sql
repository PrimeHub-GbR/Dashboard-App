-- Migration 072: Eskalationsschutz bei der Positionsvergabe.
-- Ergaenzt admin_update_employee (beide Overloads) um die Regel: man darf keine
-- Position vergeben, die >= dem eigenen Level liegt. Ein Manager kann also
-- niemanden zum Manager oder Geschaeftsfuehrer machen. Die GF (Level 3) darf
-- jede Position vergeben. Baut auf 071 (Stammdaten-Hierarchie) auf.

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
  IF NOT public.is_admin_or_manager() THEN
    RAISE EXCEPTION 'insufficient_privilege: nur Admin/Manager'
      USING ERRCODE = '42501';
  END IF;

  -- Hierarchie: nur Stammdaten von niedrigerem Level aendern. GF-Ebene darf
  -- sich gegenseitig/selbst verwalten (keine hoehere Instanz).
  IF NOT (public._my_level() > public._level_of(p_id)
          OR (public._my_level() = 3 AND public._level_of(p_id) = 3)) THEN
    RAISE EXCEPTION 'insufficient_privilege: keine Berechtigung fuer diese Stammdaten (Hierarchie)'
      USING ERRCODE = '42501';
  END IF;

  IF p_position IS NOT NULL
     AND p_position NOT IN ('geschaeftsfuehrer', 'manager', 'mitarbeiter') THEN
    RAISE EXCEPTION 'invalid position: %', p_position USING ERRCODE = '22023';
  END IF;

  -- Eskalationsschutz: keine Position >= eigenem Level vergeben. GF (3) frei.
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

-- Aeltere 11-Param-Variante ebenfalls absichern (falls noch referenziert).
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
  IF NOT public.is_admin_or_manager() THEN
    RAISE EXCEPTION 'insufficient_privilege: nur Admin/Manager'
      USING ERRCODE = '42501';
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

  -- Eskalationsschutz: keine Position >= eigenem Level vergeben. GF (3) frei.
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
