-- Migration 064: Demo-Filter für Abwesenheits-RPCs, Chef-Urlaubsvergabe,
-- manuelle Schichtplanung (planned_shifts).
--
-- 1) get_team_absences / get_chef_absence_notifications /
--    get_chef_archived_absences bekommen p_include_demo (Default false) und
--    blenden Demo-Mitarbeiter (employees.is_demo) aus, solange nicht explizit
--    eingeblendet — analog zu get_all_employees_month_hours (Migration 063).
-- 2) chef_assign_absence: Chef trägt einem Mitarbeiter eine sofort genehmigte
--    Abwesenheit ein (harte Resturlaub-Prüfung bei Urlaub).
-- 3) planned_shifts: vom Chef manuell geplante Schichten (überschreiben in der
--    Wochenansicht tageweise die eingereichte Verfügbarkeit).

-- ============================================================ 1) Demo-Filter

DROP FUNCTION IF EXISTS public.get_team_absences(date, date);
CREATE FUNCTION public.get_team_absences(
  p_from date,
  p_to date,
  p_include_demo boolean DEFAULT false
)
RETURNS TABLE(
  id uuid, employee_id uuid, start_date date, end_date date,
  type text, status text, reviewer_name text, reviewed_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT a.id, a.employee_id, a.start_date, a.end_date, a.type, a.status,
         r.name, a.reviewed_at
  FROM public.absence_requests a
  JOIN public.employees e ON e.id = a.employee_id
  LEFT JOIN public.employees r ON r.id = a.reviewed_by
  WHERE public.is_chef()
    AND (p_include_demo OR NOT e.is_demo)
    AND a.status IN ('pending', 'approved', 'cancel_requested')
    AND a.start_date <= p_to AND a.end_date >= p_from
  ORDER BY a.start_date;
$$;
GRANT EXECUTE ON FUNCTION public.get_team_absences(date, date, boolean) TO authenticated;

DROP FUNCTION IF EXISTS public.get_chef_absence_notifications();
CREATE FUNCTION public.get_chef_absence_notifications(
  p_include_demo boolean DEFAULT false
)
RETURNS TABLE(
  id uuid, employee_id uuid, employee_name text, employee_color text,
  start_date date, end_date date, type text, status text, note text,
  created_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT a.id, a.employee_id, e.name, e.color,
         a.start_date, a.end_date, a.type, a.status, a.note, a.created_at
  FROM public.absence_requests a
  JOIN public.employees e ON e.id = a.employee_id
  WHERE public.is_chef()
    AND (p_include_demo OR NOT e.is_demo)
    AND a.status IN ('pending','cancel_requested')
  ORDER BY a.created_at DESC
  LIMIT 50;
$$;
GRANT EXECUTE ON FUNCTION public.get_chef_absence_notifications(boolean) TO authenticated;

DROP FUNCTION IF EXISTS public.get_chef_archived_absences();
CREATE FUNCTION public.get_chef_archived_absences(
  p_include_demo boolean DEFAULT false
)
RETURNS TABLE(
  id uuid, employee_id uuid, employee_name text, employee_color text,
  start_date date, end_date date, type text, status text, note text,
  decision_note text, reviewed_at timestamptz, reviewer_name text
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT a.id, a.employee_id, e.name, e.color,
         a.start_date, a.end_date, a.type, a.status, a.note,
         a.decision_note, a.reviewed_at, r.name
  FROM public.absence_requests a
  JOIN public.employees e ON e.id = a.employee_id
  LEFT JOIN public.employees r ON r.id = a.reviewed_by
  WHERE public.is_chef()
    AND (p_include_demo OR NOT e.is_demo)
    AND a.status IN ('rejected', 'cancelled')
  ORDER BY a.reviewed_at DESC NULLS LAST
  LIMIT 100;
$$;
GRANT EXECUTE ON FUNCTION public.get_chef_archived_absences(boolean) TO authenticated;

-- ===================================================== 2) Chef-Urlaubsvergabe

-- Chef trägt einem Mitarbeiter eine sofort genehmigte Abwesenheit ein.
-- Bei Urlaub harte Resturlaub-Prüfung (wie beim Mitarbeiter-Antrag).
CREATE OR REPLACE FUNCTION public.chef_assign_absence(
  p_employee_id uuid,
  p_start date,
  p_end date,
  p_type text,
  p_note text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_chef uuid;
  v_id   uuid;
  v_req  integer;
  v_remaining integer;
BEGIN
  IF NOT public.is_chef() THEN RAISE EXCEPTION 'Keine Berechtigung'; END IF;
  IF p_type NOT IN ('urlaub','krankheit','sonstige') THEN
    RAISE EXCEPTION 'Ungültiger Abwesenheitstyp';
  END IF;
  IF p_end < p_start THEN RAISE EXCEPTION 'Enddatum vor Startdatum'; END IF;

  SELECT id INTO v_chef FROM public.employees WHERE auth_user_id = auth.uid();

  IF p_type = 'urlaub' THEN
    v_req := public._absence_workdays(p_employee_id, p_start, p_end);
    SELECT remaining INTO v_remaining
      FROM public.get_vacation_balance(p_employee_id, EXTRACT(YEAR FROM p_start)::int);
    IF v_req > COALESCE(v_remaining, 0) THEN
      RAISE EXCEPTION 'Nicht genug Resturlaub: % Arbeitstag(e), nur % offen',
        v_req, COALESCE(v_remaining, 0) USING ERRCODE = '22023';
    END IF;
  END IF;

  INSERT INTO public.absence_requests
    (employee_id, start_date, end_date, type, note, status, reviewed_by, reviewed_at)
  VALUES
    (p_employee_id, p_start, p_end, p_type,
     NULLIF(btrim(coalesce(p_note,'')),''), 'approved', v_chef, now())
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.chef_assign_absence(uuid, date, date, text, text) TO authenticated;

-- ====================================================== 3) Manuelle Schichten

CREATE TABLE IF NOT EXISTS public.planned_shifts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  shift_date  date NOT NULL,
  start_time  time NOT NULL,
  end_time    time NOT NULL,
  created_by  uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_planned_shifts_date ON public.planned_shifts (shift_date);
CREATE INDEX IF NOT EXISTS idx_planned_shifts_emp_date ON public.planned_shifts (employee_id, shift_date);

ALTER TABLE public.planned_shifts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS planned_shifts_chef_all ON public.planned_shifts;
CREATE POLICY planned_shifts_chef_all ON public.planned_shifts
  FOR ALL USING (public.is_chef()) WITH CHECK (public.is_chef());

DROP POLICY IF EXISTS planned_shifts_self_read ON public.planned_shifts;
CREATE POLICY planned_shifts_self_read ON public.planned_shifts
  FOR SELECT USING (employee_id = public.current_employee_id());

-- Chef: mehrere Tage auf einmal für einen Mitarbeiter planen. Gibt Anzahl.
CREATE OR REPLACE FUNCTION public.create_planned_shifts(
  p_employee_id uuid,
  p_dates date[],
  p_start time,
  p_end time
)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_chef uuid;
  v_d    date;
  v_n    integer := 0;
BEGIN
  IF NOT public.is_chef() THEN RAISE EXCEPTION 'Keine Berechtigung'; END IF;
  IF p_end <= p_start THEN RAISE EXCEPTION 'Endzeit muss nach Startzeit liegen'; END IF;
  SELECT id INTO v_chef FROM public.employees WHERE auth_user_id = auth.uid();

  FOREACH v_d IN ARRAY p_dates LOOP
    INSERT INTO public.planned_shifts (employee_id, shift_date, start_time, end_time, created_by)
    VALUES (p_employee_id, v_d, p_start, p_end, v_chef);
    v_n := v_n + 1;
  END LOOP;
  RETURN v_n;
END;
$$;
GRANT EXECUTE ON FUNCTION public.create_planned_shifts(uuid, date[], time, time) TO authenticated;

-- Chef: geplante Schichten in einem Zeitraum (Demo-Filter wie oben).
CREATE OR REPLACE FUNCTION public.get_team_planned_shifts(
  p_from date,
  p_to date,
  p_include_demo boolean DEFAULT false
)
RETURNS TABLE(
  id uuid, employee_id uuid, shift_date date, start_time time, end_time time
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT s.id, s.employee_id, s.shift_date, s.start_time, s.end_time
  FROM public.planned_shifts s
  JOIN public.employees e ON e.id = s.employee_id
  WHERE public.is_chef()
    AND (p_include_demo OR NOT e.is_demo)
    AND s.shift_date BETWEEN p_from AND p_to
  ORDER BY s.shift_date, s.start_time;
$$;
GRANT EXECUTE ON FUNCTION public.get_team_planned_shifts(date, date, boolean) TO authenticated;

-- Chef: eine geplante Schicht löschen.
CREATE OR REPLACE FUNCTION public.delete_planned_shift(p_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF NOT public.is_chef() THEN RAISE EXCEPTION 'Keine Berechtigung'; END IF;
  DELETE FROM public.planned_shifts WHERE id = p_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.delete_planned_shift(uuid) TO authenticated;
