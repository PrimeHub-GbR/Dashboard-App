-- Migration 057: Urlaubskontingent pro Mitarbeiter
-- Chef trägt Jahresanspruch + Eintrittsdatum ein; daraus wird der anteilige
-- Anspruch fürs laufende Jahr (pro-rata bei unterjährigem Eintritt) und der
-- Resturlaub (Anspruch minus genehmigte Urlaubstage) berechnet.

ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS vacation_days_per_year integer,
  ADD COLUMN IF NOT EXISTS entry_date date;

COMMENT ON COLUMN public.employees.vacation_days_per_year IS
  'Jahres-Urlaubsanspruch in Arbeitstagen (vom Chef gesetzt).';
COMMENT ON COLUMN public.employees.entry_date IS
  'Eintrittsdatum — Basis für anteiligen Urlaubsanspruch im Eintrittsjahr.';

-- admin_update_employee um Urlaubstage + Eintrittsdatum erweitern (COALESCE).
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
  p_reports_to      UUID    DEFAULT NULL,
  p_vacation_days   INTEGER DEFAULT NULL,
  p_entry_date      DATE    DEFAULT NULL
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
$$;

GRANT EXECUTE ON FUNCTION public.admin_update_employee(
  UUID, NUMERIC, JSONB, TEXT, BOOLEAN, TEXT, TEXT, TEXT, TEXT, DATE, UUID, INTEGER, DATE
) TO authenticated;

-- RPC: Urlaubssaldo eines Mitarbeiters fürs Jahr.
CREATE OR REPLACE FUNCTION public.get_vacation_balance(
  p_employee_id uuid,
  p_year        integer DEFAULT NULL
)
RETURNS TABLE (
  year          integer,
  full_days     integer,
  entitlement   integer,
  used          integer,
  remaining     integer
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_year    integer := COALESCE(p_year, EXTRACT(YEAR FROM now())::integer);
  v_full    integer;
  v_entry   date;
  v_sched   jsonb;
  v_ent     integer;
  v_used    integer;
BEGIN
  IF NOT (p_employee_id = public.current_employee_id() OR public.is_chef()) THEN
    RAISE EXCEPTION 'Keine Berechtigung';
  END IF;

  SELECT vacation_days_per_year, entry_date, weekly_schedule
    INTO v_full, v_entry, v_sched
  FROM public.employees WHERE id = p_employee_id;

  v_full := COALESCE(v_full, 0);

  IF v_entry IS NULL OR EXTRACT(YEAR FROM v_entry)::int < v_year THEN
    v_ent := v_full;
  ELSIF EXTRACT(YEAR FROM v_entry)::int > v_year THEN
    v_ent := 0;
  ELSE
    v_ent := ROUND(v_full * (12 - EXTRACT(MONTH FROM v_entry)::int + 1) / 12.0);
  END IF;

  SELECT COUNT(*)::int INTO v_used
  FROM (
    SELECT gs::date AS d
    FROM public.absence_requests a
    CROSS JOIN LATERAL generate_series(
      GREATEST(a.start_date, make_date(v_year, 1, 1)),
      LEAST(a.end_date, make_date(v_year, 12, 31)),
      interval '1 day'
    ) AS gs
    WHERE a.employee_id = p_employee_id
      AND a.type = 'urlaub'
      AND a.status = 'approved'
  ) days
  WHERE COALESCE((v_sched ->> (
    CASE EXTRACT(ISODOW FROM d)::int
      WHEN 1 THEN 'mon' WHEN 2 THEN 'tue' WHEN 3 THEN 'wed'
      WHEN 4 THEN 'thu' WHEN 5 THEN 'fri' WHEN 6 THEN 'sat' ELSE 'sun'
    END))::numeric, 0) > 0;

  RETURN QUERY SELECT v_year, v_full, v_ent, COALESCE(v_used, 0),
                      v_ent - COALESCE(v_used, 0);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_vacation_balance(uuid, integer) TO authenticated;
