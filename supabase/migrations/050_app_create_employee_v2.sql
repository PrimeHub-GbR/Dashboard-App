-- Migration 050: admin_create_employee erweitern um home_address + is_active
--
-- Der App-Anlege-Dialog macht Kontaktdaten (inkl. Adresse) verpflichtend und
-- bietet einen "Kiosk aktivieren"-Schalter. Daher bekommt die RPC zwei neue
-- Parameter. Alte Signatur wird vorher entfernt (sonst Overload-Ambiguitaet).

DROP FUNCTION IF EXISTS public.admin_create_employee(
  TEXT, TEXT, NUMERIC, JSONB, TEXT, TEXT, TEXT, UUID
);

CREATE OR REPLACE FUNCTION public.admin_create_employee(
  p_name            TEXT,
  p_position        TEXT    DEFAULT 'mitarbeiter',
  p_target_hours    NUMERIC DEFAULT 160,
  p_weekly_schedule JSONB   DEFAULT NULL,
  p_color           TEXT    DEFAULT NULL,
  p_phone           TEXT    DEFAULT NULL,
  p_email           TEXT    DEFAULT NULL,
  p_home_address    TEXT    DEFAULT NULL,
  p_is_active       BOOLEAN DEFAULT TRUE,
  p_reports_to      UUID    DEFAULT NULL
)
RETURNS public.employees
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row public.employees;
BEGIN
  IF NOT public.is_admin_or_manager() THEN
    RAISE EXCEPTION 'insufficient_privilege: nur Admin/Manager'
      USING ERRCODE = '42501';
  END IF;

  IF p_name IS NULL OR length(btrim(p_name)) = 0 THEN
    RAISE EXCEPTION 'Name erforderlich' USING ERRCODE = '22023';
  END IF;

  IF p_position NOT IN ('geschaeftsfuehrer', 'manager', 'mitarbeiter') THEN
    RAISE EXCEPTION 'invalid position: %', p_position USING ERRCODE = '22023';
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
$$;

GRANT EXECUTE ON FUNCTION public.admin_create_employee(
  TEXT, TEXT, NUMERIC, JSONB, TEXT, TEXT, TEXT, TEXT, BOOLEAN, UUID
) TO authenticated;

COMMENT ON FUNCTION public.admin_create_employee IS
  'Chef-Modus: legt einen neuen Mitarbeiter an (inkl. Adresse + Kiosk-Aktivstatus). pin bleibt NULL. Gate: is_admin_or_manager().';
