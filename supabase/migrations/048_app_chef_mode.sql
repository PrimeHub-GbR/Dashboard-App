-- Migration 048: Chef-Modus fuer die Mitarbeiter-App
--
-- Die Flutter-App schreibt direkt via Supabase (anon/authenticated). employees
-- und time_entries sind aber nur fuer service_role beschreibbar. Statt breite
-- UPDATE-Policies zu oeffnen, kapseln wir die Chef-Schreibzugriffe in
-- SECURITY DEFINER-Funktionen mit internem is_admin_or_manager()-Gate und
-- fester Feld-Whitelist. Lesen laeuft weiter ueber die bestehenden
-- RLS-Policies (Migration 041), die Admin/Manager Vollzugriff geben.

-- =========================================================================
-- admin_update_employee
-- Aktualisiert gesperrte Stammdaten eines Mitarbeiters. NULL-Argumente
-- lassen das jeweilige Feld unveraendert (COALESCE-Pattern).
-- =========================================================================
CREATE OR REPLACE FUNCTION public.admin_update_employee(
  p_id              UUID,
  p_target_hours    NUMERIC DEFAULT NULL,
  p_weekly_schedule JSONB   DEFAULT NULL,
  p_position        TEXT    DEFAULT NULL,
  p_is_active       BOOLEAN DEFAULT NULL,
  p_color           TEXT    DEFAULT NULL,
  p_phone           TEXT    DEFAULT NULL,
  p_email           TEXT    DEFAULT NULL,
  p_home_address    TEXT    DEFAULT NULL,
  p_birth_date      DATE    DEFAULT NULL,
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

  IF p_position IS NOT NULL
     AND p_position NOT IN ('geschaeftsfuehrer', 'manager', 'mitarbeiter') THEN
    RAISE EXCEPTION 'invalid position: %', p_position USING ERRCODE = '22023';
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
$$;

GRANT EXECUTE ON FUNCTION public.admin_update_employee(
  UUID, NUMERIC, JSONB, TEXT, BOOLEAN, TEXT, TEXT, TEXT, TEXT, DATE, UUID
) TO authenticated;

COMMENT ON FUNCTION public.admin_update_employee IS
  'Chef-Modus: aktualisiert gesperrte Mitarbeiter-Stammdaten. Gate: is_admin_or_manager(). NULL-Argumente bleiben unveraendert.';


-- =========================================================================
-- admin_upsert_time_entry
-- Legt einen Zeiteintrag an oder korrigiert ihn. break_minutes wird nach
-- ArbZG aus der Bruttodauer berechnet (vgl. src/lib/zeiterfassung/arbzg.ts):
--   <= 360 Min -> 0 | 361..540 -> 30 | > 540 -> 45.
-- Bei offenem Eintrag (checked_out NULL) bleibt break_minutes = 0.
-- p_id NULL => INSERT, sonst UPDATE.
-- =========================================================================
CREATE OR REPLACE FUNCTION public.admin_upsert_time_entry(
  p_id          UUID,
  p_employee_id UUID,
  p_checked_in  TIMESTAMPTZ,
  p_checked_out TIMESTAMPTZ DEFAULT NULL,
  p_note        TEXT        DEFAULT NULL
)
RETURNS public.time_entries
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row   public.time_entries;
  v_gross INTEGER;
  v_break INTEGER := 0;
BEGIN
  IF NOT public.is_admin_or_manager() THEN
    RAISE EXCEPTION 'insufficient_privilege: nur Admin/Manager'
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
$$;

GRANT EXECUTE ON FUNCTION public.admin_upsert_time_entry(
  UUID, UUID, TIMESTAMPTZ, TIMESTAMPTZ, TEXT
) TO authenticated;

COMMENT ON FUNCTION public.admin_upsert_time_entry IS
  'Chef-Modus: legt einen Zeiteintrag an oder korrigiert ihn inkl. ArbZG-Pausenberechnung. Gate: is_admin_or_manager().';


-- =========================================================================
-- admin_delete_time_entry
-- =========================================================================
CREATE OR REPLACE FUNCTION public.admin_delete_time_entry(p_id UUID)
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

  DELETE FROM public.time_entries WHERE id = p_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'time_entry not found: %', p_id USING ERRCODE = 'P0002';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_delete_time_entry(UUID) TO authenticated;

COMMENT ON FUNCTION public.admin_delete_time_entry IS
  'Chef-Modus: loescht einen Zeiteintrag. Gate: is_admin_or_manager().';
