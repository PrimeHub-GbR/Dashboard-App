-- Migration 049: Chef-Modus — Mitarbeiter anlegen + Kiosk-PIN setzen (App)
--
-- Ergaenzt Migration 048 um zwei SECURITY-DEFINER-RPCs, damit Geschaefts-
-- fuehrer/Manager direkt aus der Flutter-App neue Mitarbeiter anlegen und die
-- Kiosk-PIN je Mitarbeiter zuruecksetzen koennen. Gate: is_admin_or_manager().
-- PIN-Hash = SHA-256 hex (identisch zum Kiosk-Login, vgl. set-pin/route.ts).

-- =========================================================================
-- admin_create_employee
-- =========================================================================
CREATE OR REPLACE FUNCTION public.admin_create_employee(
  p_name            TEXT,
  p_position        TEXT    DEFAULT 'mitarbeiter',
  p_target_hours    NUMERIC DEFAULT 160,
  p_weekly_schedule JSONB   DEFAULT NULL,
  p_color           TEXT    DEFAULT NULL,
  p_phone           TEXT    DEFAULT NULL,
  p_email           TEXT    DEFAULT NULL,
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
    color, phone, email, reports_to, created_by
  ) VALUES (
    btrim(p_name),
    p_position,
    COALESCE(p_target_hours, 160),
    COALESCE(p_weekly_schedule,
      '{"mon":8,"tue":8,"wed":8,"thu":8,"fri":8,"sat":0,"sun":0}'::jsonb),
    COALESCE(p_color, '#22c55e'),
    p_phone,
    p_email,
    p_reports_to,
    auth.uid()
  )
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_create_employee(
  TEXT, TEXT, NUMERIC, JSONB, TEXT, TEXT, TEXT, UUID
) TO authenticated;

COMMENT ON FUNCTION public.admin_create_employee IS
  'Chef-Modus: legt einen neuen Mitarbeiter an (pin bleibt NULL -> wird beim ersten Kiosk-Check-in oder via admin_set_pin vergeben). Gate: is_admin_or_manager().';


-- =========================================================================
-- admin_set_pin
-- p_pin NULL  -> PIN zuruecksetzen (Mitarbeiter vergibt beim Check-in neu)
-- p_pin '1234'-> neue Kiosk-PIN setzen (SHA-256 hex, wie Kiosk-Login)
-- =========================================================================
CREATE OR REPLACE FUNCTION public.admin_set_pin(
  p_id  UUID,
  p_pin TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.is_admin_or_manager() THEN
    RAISE EXCEPTION 'insufficient_privilege: nur Admin/Manager'
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
$$;

GRANT EXECUTE ON FUNCTION public.admin_set_pin(UUID, TEXT) TO authenticated;

COMMENT ON FUNCTION public.admin_set_pin IS
  'Chef-Modus: setzt/zuruecksetzt die Kiosk-PIN eines Mitarbeiters (SHA-256 hex). NULL = zuruecksetzen. Gate: is_admin_or_manager().';
