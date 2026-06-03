-- Migration 056: Abwesenheitsanträge (Urlaub / Krankheit / Sonstige) mit
-- Genehmigungs-Workflow für die Mitarbeiter-App.
--
-- Mitarbeitende beantragen in der App eine Abwesenheit für einen Zeitraum.
-- Chefs (GF/Manager) sehen den Antrag in der Glocke + in der Team-Planung und
-- genehmigen oder lehnen ihn ab. Mitarbeitende sehen den Status (pending/
-- approved/rejected) in ihrer Planung.
--
-- Abgrenzung zu employee_schedule_requests: Das ist die *Verfügbarkeits*-
-- Angabe (kein Genehmigungs-Workflow). Abwesenheit ist ein eigener,
-- genehmigungspflichtiger Vorgang -> eigene Tabelle.

-- =========================================================================
-- 1. Tabelle
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.absence_requests (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id   uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  start_date    date NOT NULL,
  end_date      date NOT NULL,
  type          text NOT NULL CHECK (type IN ('urlaub', 'krankheit', 'sonstige')),
  status        text NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'approved', 'rejected')),
  note          text,                 -- Begründung des Mitarbeiters (optional)
  decision_note text,                 -- Begründung des Chefs (z. B. bei Ablehnung)
  reviewed_by   uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  reviewed_at   timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT absence_range_valid CHECK (end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS absence_requests_employee_idx
  ON public.absence_requests (employee_id, start_date);
CREATE INDEX IF NOT EXISTS absence_requests_status_idx
  ON public.absence_requests (status, start_date);

COMMENT ON TABLE public.absence_requests IS
  'Genehmigungspflichtige Abwesenheitsanträge (Urlaub/Krankheit/Sonstige) aus der Mitarbeiter-App.';

-- =========================================================================
-- 2. RLS
-- =========================================================================
ALTER TABLE public.absence_requests ENABLE ROW LEVEL SECURITY;

-- Mitarbeitende sehen ihre eigenen Anträge; Chefs sehen alle.
CREATE POLICY "absence_select_self_or_chef"
  ON public.absence_requests
  FOR SELECT TO authenticated
  USING (
    employee_id = public.current_employee_id()
    OR public.is_chef()
  );

-- Mitarbeitende legen eigene Anträge an (immer als 'pending').
CREATE POLICY "absence_insert_self"
  ON public.absence_requests
  FOR INSERT TO authenticated
  WITH CHECK (
    employee_id = public.current_employee_id()
    AND status = 'pending'
  );

-- Mitarbeitende dürfen einen noch offenen eigenen Antrag zurückziehen.
CREATE POLICY "absence_delete_self_pending"
  ON public.absence_requests
  FOR DELETE TO authenticated
  USING (
    employee_id = public.current_employee_id()
    AND status = 'pending'
  );

-- Service-Role (Web-Dashboard) hat Vollzugriff.
CREATE POLICY "absence_service_all"
  ON public.absence_requests
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- =========================================================================
-- 3. RPC: Antrag stellen (Mitarbeiter)
-- =========================================================================
CREATE OR REPLACE FUNCTION public.submit_absence_request(
  p_start date,
  p_end   date,
  p_type  text,
  p_note  text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_emp uuid;
  v_id  uuid;
BEGIN
  v_emp := public.current_employee_id();
  IF v_emp IS NULL THEN
    RAISE EXCEPTION 'Kein Mitarbeiter-Datensatz';
  END IF;
  IF p_type NOT IN ('urlaub', 'krankheit', 'sonstige') THEN
    RAISE EXCEPTION 'Ungültiger Abwesenheitstyp';
  END IF;
  IF p_end < p_start THEN
    RAISE EXCEPTION 'Enddatum vor Startdatum';
  END IF;

  INSERT INTO public.absence_requests (employee_id, start_date, end_date, type, note)
  VALUES (v_emp, p_start, p_end, p_type, NULLIF(btrim(coalesce(p_note, '')), ''))
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_absence_request(date, date, text, text) TO authenticated;

-- =========================================================================
-- 4. RPC: Antrag entscheiden (Chef)
-- =========================================================================
CREATE OR REPLACE FUNCTION public.decide_absence_request(
  p_id      uuid,
  p_approve boolean,
  p_note    text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_reviewer uuid;
BEGIN
  IF NOT public.is_chef() THEN
    RAISE EXCEPTION 'Keine Berechtigung';
  END IF;

  SELECT id INTO v_reviewer FROM public.employees WHERE auth_user_id = auth.uid();

  UPDATE public.absence_requests
  SET status        = CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END,
      decision_note = NULLIF(btrim(coalesce(p_note, '')), ''),
      reviewed_by   = v_reviewer,
      reviewed_at   = now()
  WHERE id = p_id
    AND status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Antrag nicht gefunden oder bereits entschieden';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.decide_absence_request(uuid, boolean, text) TO authenticated;

-- =========================================================================
-- 5. RPC: offene Anträge für die Chef-Glocke (inkl. Antragsteller-Infos)
-- =========================================================================
CREATE OR REPLACE FUNCTION public.get_chef_absence_notifications()
RETURNS TABLE (
  id             uuid,
  employee_id    uuid,
  employee_name  text,
  employee_color text,
  start_date     date,
  end_date       date,
  type           text,
  note           text,
  created_at     timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    a.id, a.employee_id, e.name, e.color,
    a.start_date, a.end_date, a.type, a.note, a.created_at
  FROM public.absence_requests a
  JOIN public.employees e ON e.id = a.employee_id
  WHERE public.is_chef()
    AND a.status = 'pending'
  ORDER BY a.created_at DESC
  LIMIT 50;
$$;

GRANT EXECUTE ON FUNCTION public.get_chef_absence_notifications() TO authenticated;

-- =========================================================================
-- 6. RPC: Abwesenheiten einer Woche/eines Zeitraums fürs Team (Chef)
--    Für die Team-Planungsansicht: alle Anträge, die den Zeitraum berühren.
-- =========================================================================
CREATE OR REPLACE FUNCTION public.get_team_absences(
  p_from date,
  p_to   date
)
RETURNS TABLE (
  id             uuid,
  employee_id    uuid,
  start_date     date,
  end_date       date,
  type           text,
  status         text
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT a.id, a.employee_id, a.start_date, a.end_date, a.type, a.status
  FROM public.absence_requests a
  WHERE public.is_chef()
    AND a.start_date <= p_to
    AND a.end_date   >= p_from
  ORDER BY a.start_date;
$$;

GRANT EXECUTE ON FUNCTION public.get_team_absences(date, date) TO authenticated;
