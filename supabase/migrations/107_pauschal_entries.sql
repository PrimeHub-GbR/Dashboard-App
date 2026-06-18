-- Migration 107: Pauschale Stunden mit 2-GF-Genehmigungs-Workflow
--
-- Fachlich: Einem Mitarbeiter koennen pauschale Stunden UNABHAENGIG von Tagen
-- gutgeschrieben werden (z. B. Dienstreise als Pauschale). Eingabe nur in
-- 30-Minuten-Schritten. Pauschalstunden fliessen ZUSAETZLICH zu den getemperten
-- Zeiten in die Stundenauswertung ein (get_employee_balance,
-- get_all_employees_month_hours).
--
-- Genehmigungs-Routine (zwingend):
--   * Traegt ein MANAGER ein  -> ALLE GF muessen einzeln bestaetigen.
--   * Traegt ein GF ein       -> alle ANDEREN GF muessen bestaetigen.
--   GFs werden dynamisch ueber employees.position = 'geschaeftsfuehrer' bestimmt
--   (aktuell zwei). Die benoetigten Genehmiger werden beim Anlegen als Snapshot
--   gespeichert (required_approver_ids), damit der Workflow stabil bleibt, auch
--   wenn sich die GF-Menge spaeter aendert. Erst wenn ALLE benoetigten
--   Genehmigungen vorliegen -> status 'approved' (wirksam). Solange 'pending'.
--
-- Modell des GF-Genehmigungs-Status:
--   pauschal_entries.status            -> 'pending' | 'approved' | 'rejected'
--   pauschal_entries.required_approver_ids uuid[]  -> employee-ids der noetigen GF
--   pauschal_approvals (entry_id, approved_by_employee_id) -> 1 Zeile je GF-Ja
--   status wird 'approved' sobald required_approver_ids ⊆ {erteilte Genehmiger}.

-- ===========================================================================
-- 1. Tabelle: pauschal_entries
-- ===========================================================================
CREATE TABLE IF NOT EXISTS public.pauschal_entries (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id           uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  minutes               integer NOT NULL CHECK (minutes > 0 AND minutes % 30 = 0),
  datum                 date NOT NULL,
  grund                 text NOT NULL DEFAULT '',
  status                text NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending', 'approved', 'rejected')),
  -- Snapshot der noetigen Genehmiger (employee-ids der GF) beim Anlegen.
  required_approver_ids uuid[] NOT NULL DEFAULT '{}',
  created_by            uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by_employee_id uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  decided_at            timestamptz,
  decided_by            uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reject_reason         text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pauschal_entries_employee_idx
  ON public.pauschal_entries (employee_id);
CREATE INDEX IF NOT EXISTS pauschal_entries_status_idx
  ON public.pauschal_entries (status);
CREATE INDEX IF NOT EXISTS pauschal_entries_datum_idx
  ON public.pauschal_entries (datum);

ALTER TABLE public.pauschal_entries ENABLE ROW LEVEL SECURITY;
-- Kein direkter Zugriff: alles laeuft ueber SECURITY DEFINER RPCs. Service-Role
-- (Web-API gated per Rollencheck) darf alles.
CREATE POLICY "pauschal_entries_service"
  ON public.pauschal_entries FOR ALL TO service_role
  USING (true) WITH CHECK (true);

COMMENT ON TABLE public.pauschal_entries IS
  'Pauschale Stunden (Dienstreise o.ae.) mit 2-GF-Genehmigung. minutes in 30-Min-Schritten. Zugriff nur via SECURITY DEFINER RPCs.';

-- ===========================================================================
-- 2. Tabelle: pauschal_approvals — eine Zeile je GF-Genehmigung
-- ===========================================================================
CREATE TABLE IF NOT EXISTS public.pauschal_approvals (
  entry_id                uuid NOT NULL REFERENCES public.pauschal_entries(id) ON DELETE CASCADE,
  approved_by             uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  approved_by_employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  approved_at             timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (entry_id, approved_by_employee_id)
);

ALTER TABLE public.pauschal_approvals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pauschal_approvals_service"
  ON public.pauschal_approvals FOR ALL TO service_role
  USING (true) WITH CHECK (true);

COMMENT ON TABLE public.pauschal_approvals IS
  'Einzelne GF-Genehmigungen je Pauschal-Eintrag (idempotent: 1 Zeile pro GF). status=approved sobald alle required_approver_ids vertreten sind.';

-- ===========================================================================
-- 3. Helper: ist der eingeloggte User Geschaeftsfuehrer? (Position GF ODER
--    Rolle admin) — strenger als is_chef(), weil nur GF genehmigen darf.
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.is_gf()
  RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT
    EXISTS (SELECT 1 FROM public.user_roles
            WHERE user_id = auth.uid() AND role = 'admin')
    OR EXISTS (SELECT 1 FROM public.employees
               WHERE auth_user_id = auth.uid()
                 AND position = 'geschaeftsfuehrer');
$$;
GRANT EXECUTE ON FUNCTION public.is_gf() TO authenticated;

COMMENT ON FUNCTION public.is_gf() IS
  'TRUE wenn der aktuelle User Geschaeftsfuehrer ist (Position geschaeftsfuehrer ODER Rolle admin). Nur GF darf Pauschal-Eintraege genehmigen.';

-- employee-id des eingeloggten Users (lokaler Helper).
CREATE OR REPLACE FUNCTION public._pauschal_my_employee_id()
  RETURNS uuid
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT id FROM public.employees WHERE auth_user_id = auth.uid() LIMIT 1;
$$;

-- ===========================================================================
-- 4. RPC: pauschal_create — Pauschal-Eintrag anlegen
--    Gate: is_admin_or_manager() ODER is_chef() (Manager + GF).
--    Bestimmt die benoetigten Genehmiger dynamisch (GFs ausser Eintragendem,
--    falls Eintragender GF ist; sonst alle GFs).
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.pauschal_create(
  p_employee_id uuid,
  p_minutes     integer,
  p_datum       date,
  p_grund       text DEFAULT ''
)
  RETURNS public.pauschal_entries
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_row        public.pauschal_entries;
  v_creator    uuid := public._pauschal_my_employee_id();
  v_creator_gf boolean := public.is_gf();
  v_required   uuid[];
BEGIN
  IF NOT public.is_chef() THEN
    RAISE EXCEPTION 'insufficient_privilege: nur Manager/GF' USING ERRCODE = '42501';
  END IF;
  IF p_minutes IS NULL OR p_minutes <= 0 OR p_minutes % 30 <> 0 THEN
    RAISE EXCEPTION 'minutes muss > 0 und ein Vielfaches von 30 sein' USING ERRCODE = '22023';
  END IF;
  IF p_datum IS NULL THEN
    RAISE EXCEPTION 'datum erforderlich' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.employees WHERE id = p_employee_id) THEN
    RAISE EXCEPTION 'employee not found: %', p_employee_id USING ERRCODE = 'P0002';
  END IF;

  -- Benoetigte Genehmiger = alle GF, ausser dem Eintragenden (falls GF).
  SELECT COALESCE(array_agg(e.id), '{}')
  INTO v_required
  FROM public.employees e
  WHERE e.position = 'geschaeftsfuehrer'
    AND e.is_active
    AND (NOT v_creator_gf OR e.id <> v_creator);

  INSERT INTO public.pauschal_entries (
    employee_id, minutes, datum, grund, status,
    required_approver_ids, created_by, created_by_employee_id
  ) VALUES (
    p_employee_id, p_minutes, p_datum, COALESCE(btrim(p_grund), ''),
    -- Falls KEIN Genehmiger noetig (z. B. einziger GF traegt sich selbst ein):
    -- sofort wirksam.
    CASE WHEN array_length(v_required, 1) IS NULL THEN 'approved' ELSE 'pending' END,
    v_required, auth.uid(), v_creator
  )
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;
GRANT EXECUTE ON FUNCTION public.pauschal_create(uuid, integer, date, text) TO authenticated;

COMMENT ON FUNCTION public.pauschal_create(uuid, integer, date, text) IS
  'Legt einen Pauschal-Eintrag an (Manager/GF). Bestimmt benoetigte GF-Genehmiger (alle GF ausser Eintragendem falls GF). 0 noetige -> sofort approved.';

-- ===========================================================================
-- 5. RPC: pauschal_approve — aktueller GF genehmigt einen Eintrag
--    Setzt status='approved' sobald alle required_approver_ids vorliegen.
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.pauschal_approve(p_entry_id uuid)
  RETURNS public.pauschal_entries
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_row       public.pauschal_entries;
  v_me        uuid := public._pauschal_my_employee_id();
  v_required  uuid[];
  v_have_all  boolean;
BEGIN
  IF NOT public.is_gf() THEN
    RAISE EXCEPTION 'insufficient_privilege: nur Geschaeftsfuehrung darf genehmigen' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_row FROM public.pauschal_entries WHERE id = p_entry_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'pauschal_entry not found: %', p_entry_id USING ERRCODE = 'P0002';
  END IF;
  IF v_row.status <> 'pending' THEN
    RAISE EXCEPTION 'Eintrag bereits entschieden (%).', v_row.status USING ERRCODE = '22023';
  END IF;

  v_required := v_row.required_approver_ids;
  IF NOT (v_me = ANY (v_required)) THEN
    RAISE EXCEPTION 'Du bist kein benoetigter Genehmiger fuer diesen Eintrag' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.pauschal_approvals (entry_id, approved_by, approved_by_employee_id)
  VALUES (p_entry_id, auth.uid(), v_me)
  ON CONFLICT (entry_id, approved_by_employee_id) DO NOTHING;

  -- Liegen ALLE benoetigten Genehmigungen vor?
  SELECT NOT EXISTS (
    SELECT 1 FROM unnest(v_required) AS r(id)
    WHERE NOT EXISTS (
      SELECT 1 FROM public.pauschal_approvals pa
      WHERE pa.entry_id = p_entry_id AND pa.approved_by_employee_id = r.id
    )
  ) INTO v_have_all;

  IF v_have_all THEN
    UPDATE public.pauschal_entries
    SET status = 'approved', decided_at = now(), decided_by = auth.uid(),
        updated_at = now()
    WHERE id = p_entry_id
    RETURNING * INTO v_row;
  END IF;

  RETURN v_row;
END;
$$;
GRANT EXECUTE ON FUNCTION public.pauschal_approve(uuid) TO authenticated;

COMMENT ON FUNCTION public.pauschal_approve(uuid) IS
  'Aktueller GF genehmigt einen Pauschal-Eintrag (idempotent). status -> approved sobald alle required_approver_ids vorliegen.';

-- ===========================================================================
-- 6. RPC: pauschal_reject — ein GF lehnt ab (sofort rejected, unwirksam)
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.pauschal_reject(p_entry_id uuid, p_reason text DEFAULT NULL)
  RETURNS public.pauschal_entries
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_row public.pauschal_entries;
  v_me  uuid := public._pauschal_my_employee_id();
BEGIN
  IF NOT public.is_gf() THEN
    RAISE EXCEPTION 'insufficient_privilege: nur Geschaeftsfuehrung darf ablehnen' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_row FROM public.pauschal_entries WHERE id = p_entry_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'pauschal_entry not found: %', p_entry_id USING ERRCODE = 'P0002';
  END IF;
  IF v_row.status <> 'pending' THEN
    RAISE EXCEPTION 'Eintrag bereits entschieden (%).', v_row.status USING ERRCODE = '22023';
  END IF;
  IF NOT (v_me = ANY (v_row.required_approver_ids)) THEN
    RAISE EXCEPTION 'Du bist kein benoetigter Genehmiger fuer diesen Eintrag' USING ERRCODE = '42501';
  END IF;

  UPDATE public.pauschal_entries
  SET status = 'rejected', decided_at = now(), decided_by = auth.uid(),
      reject_reason = NULLIF(btrim(COALESCE(p_reason, '')), ''), updated_at = now()
  WHERE id = p_entry_id
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;
GRANT EXECUTE ON FUNCTION public.pauschal_reject(uuid, text) TO authenticated;

COMMENT ON FUNCTION public.pauschal_reject(uuid, text) IS
  'Ein benoetigter GF lehnt einen Pauschal-Eintrag ab -> status rejected (unwirksam).';

-- ===========================================================================
-- 7. RPC: pauschal_list — Eintraege eines Mitarbeiters (fuer Anzeige)
--    Chef sieht alle; Mitarbeiter nur eigene.
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.pauschal_list(
  p_employee_id uuid DEFAULT NULL,
  p_from        date DEFAULT NULL,
  p_to          date DEFAULT NULL
)
  RETURNS TABLE(
    id uuid, employee_id uuid, employee_name text, minutes integer,
    datum date, grund text, status text,
    required_count integer, approved_count integer,
    created_by_name text, created_at timestamptz
  )
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT pe.id, pe.employee_id, e.name, pe.minutes, pe.datum, pe.grund, pe.status,
         COALESCE(array_length(pe.required_approver_ids, 1), 0)::int,
         (SELECT COUNT(*)::int FROM public.pauschal_approvals pa WHERE pa.entry_id = pe.id),
         creator.name, pe.created_at
  FROM public.pauschal_entries pe
  JOIN public.employees e ON e.id = pe.employee_id
  LEFT JOIN public.employees creator ON creator.id = pe.created_by_employee_id
  WHERE (
      public.is_chef()
      OR pe.employee_id = public._pauschal_my_employee_id()
    )
    AND (p_employee_id IS NULL OR pe.employee_id = p_employee_id)
    AND (p_from IS NULL OR pe.datum >= p_from)
    AND (p_to IS NULL OR pe.datum <= p_to)
  ORDER BY pe.datum DESC, pe.created_at DESC
  LIMIT 200;
$$;
GRANT EXECUTE ON FUNCTION public.pauschal_list(uuid, date, date) TO authenticated;

COMMENT ON FUNCTION public.pauschal_list(uuid, date, date) IS
  'Pauschal-Eintraege fuer Anzeige. Chef sieht alle, Mitarbeiter nur eigene. Inkl. required_count/approved_count fuer den Genehmigungs-Fortschritt.';

-- ===========================================================================
-- 8. RPC: pauschal_delete — Eintrag loeschen (Chef)
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.pauschal_delete(p_entry_id uuid)
  RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF NOT public.is_chef() THEN
    RAISE EXCEPTION 'insufficient_privilege: nur Manager/GF' USING ERRCODE = '42501';
  END IF;
  DELETE FROM public.pauschal_entries WHERE id = p_entry_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'pauschal_entry not found: %', p_entry_id USING ERRCODE = 'P0002';
  END IF;
END;
$$;
GRANT EXECUTE ON FUNCTION public.pauschal_delete(uuid) TO authenticated;

-- ===========================================================================
-- 9. Chef-Glocke: offene Pauschal-Genehmigungen fuer den eingeloggten GF
--    Zeigt NUR Eintraege, bei denen der aktuelle GF benoetigter Genehmiger ist
--    und noch nicht genehmigt hat. + 14-Tage-Historie der von IHM entschiedenen.
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.get_chef_pauschal_notifications()
  RETURNS TABLE(
    entry_id uuid, employee_id uuid, employee_name text, employee_color text,
    minutes integer, datum date, grund text, status text,
    created_by_name text, created_at timestamptz,
    required_count integer, approved_count integer,
    decided boolean, decided_at timestamptz
  )
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT pe.id, pe.employee_id, e.name, e.color, pe.minutes, pe.datum,
         pe.grund, pe.status, creator.name, pe.created_at,
         COALESCE(array_length(pe.required_approver_ids, 1), 0)::int,
         (SELECT COUNT(*)::int FROM public.pauschal_approvals pa WHERE pa.entry_id = pe.id),
         -- "decided" aus Sicht DIESES GF: hat er schon genehmigt ODER ist der
         -- Eintrag insgesamt entschieden?
         (pe.status <> 'pending'
          OR EXISTS (SELECT 1 FROM public.pauschal_approvals pa
                     WHERE pa.entry_id = pe.id
                       AND pa.approved_by_employee_id = public._pauschal_my_employee_id())),
         pe.decided_at
  FROM public.pauschal_entries pe
  JOIN public.employees e ON e.id = pe.employee_id AND NOT e.is_demo
  LEFT JOIN public.employees creator ON creator.id = pe.created_by_employee_id
  WHERE public.is_gf()
    AND public._pauschal_my_employee_id() = ANY (pe.required_approver_ids)
    AND (
      -- offen: noch pending UND von mir noch nicht genehmigt
      (pe.status = 'pending'
        AND NOT EXISTS (SELECT 1 FROM public.pauschal_approvals pa
                        WHERE pa.entry_id = pe.id
                          AND pa.approved_by_employee_id = public._pauschal_my_employee_id()))
      -- Historie: in den letzten 14 Tagen entschieden
      OR (pe.decided_at >= now() - interval '14 days')
    )
  ORDER BY (pe.status = 'pending') DESC, pe.created_at DESC
  LIMIT 80;
$$;
GRANT EXECUTE ON FUNCTION public.get_chef_pauschal_notifications() TO authenticated;

COMMENT ON FUNCTION public.get_chef_pauschal_notifications() IS
  'App-/Web-Glocke: offene Pauschal-Genehmigungen fuer den eingeloggten GF (er ist benoetigter Genehmiger) + 14-Tage-Historie.';

-- ===========================================================================
-- 10. Auswertung: get_employee_balance um genehmigte Pauschalstunden erweitern.
--     Pauschalstunden mit datum im Zeitraum werden zu ist_minutes addiert.
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.get_employee_balance(p_employee_id uuid, p_period_start date, p_period_end date)
  RETURNS TABLE(employee_id uuid, period_start date, period_end date, ist_minutes integer, soll_minutes integer, diff_minutes integer)
  LANGUAGE plpgsql
  STABLE SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_caller_emp_id UUID;
  v_schedule JSONB;
  v_ist_minutes INTEGER;
  v_soll_minutes INTEGER;
  v_pauschal_minutes INTEGER;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_period_end < p_period_start THEN RAISE EXCEPTION 'period_end must be >= period_start'; END IF;

  v_caller_emp_id := public.current_employee_id();
  IF NOT (
    public.is_chef()
    OR p_employee_id = v_caller_emp_id
    OR EXISTS (SELECT 1 FROM public.employees WHERE id = p_employee_id AND reports_to = v_caller_emp_id)
  ) THEN
    RAISE EXCEPTION 'Access denied for employee %', p_employee_id;
  END IF;

  SELECT weekly_schedule INTO v_schedule FROM public.employees WHERE id = p_employee_id;
  IF v_schedule IS NULL THEN RAISE EXCEPTION 'Employee % not found', p_employee_id; END IF;

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
      (GREATEST(0, LEAST(30, gross - 360)) + GREATEST(0, LEAST(15, gross - 540)))
      - GREATEST(0, span - gross)
    )
  ), 0)::INTEGER
  INTO v_ist_minutes
  FROM daily;

  -- Genehmigte Pauschalstunden mit datum im Zeitraum.
  SELECT COALESCE(SUM(pe.minutes), 0)::INTEGER
  INTO v_pauschal_minutes
  FROM public.pauschal_entries pe
  WHERE pe.employee_id = p_employee_id
    AND pe.status = 'approved'
    AND pe.datum BETWEEN p_period_start AND p_period_end;

  v_ist_minutes := v_ist_minutes + v_pauschal_minutes;

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

-- ===========================================================================
-- 11. Monatsuebersicht: get_all_employees_month_hours um genehmigte Pauschal-
--     stunden erweitern (Spalte total_pauschal_minutes + work-Summe inkl.).
--     Return-Typ aendert sich -> DROP noetig.
-- ===========================================================================
DROP FUNCTION IF EXISTS public.get_all_employees_month_hours(integer, integer, boolean);
CREATE FUNCTION public.get_all_employees_month_hours(
  p_year integer, p_month integer, p_include_demo boolean DEFAULT false
)
RETURNS TABLE(
  employee_id uuid, employee_name text, employee_color text,
  target_hours_per_month numeric, total_work_minutes bigint,
  total_break_minutes bigint, total_pauschal_minutes bigint, entry_count bigint
)
LANGUAGE sql STABLE
SET search_path TO 'public', 'pg_temp'
AS $function$
  WITH daily AS (
    SELECT t.employee_id AS emp_id,
      (t.checked_in_at AT TIME ZONE 'Europe/Berlin')::date AS work_day,
      SUM(EXTRACT(EPOCH FROM (t.checked_out_at - t.checked_in_at)) / 60.0) AS gross,
      EXTRACT(EPOCH FROM (MAX(t.checked_out_at) - MIN(t.checked_in_at))) / 60.0 AS span,
      COUNT(*) AS cnt
    FROM time_entries t
    WHERE t.checked_out_at IS NOT NULL
      AND EXTRACT(YEAR FROM t.checked_in_at AT TIME ZONE 'Europe/Berlin') = p_year
      AND EXTRACT(MONTH FROM t.checked_in_at AT TIME ZONE 'Europe/Berlin') = p_month
    GROUP BY 1, 2
  ),
  per_emp AS (
    SELECT emp_id, SUM(gross) AS work_minutes,
      SUM(GREATEST(0, (CASE WHEN gross <= 360 THEN 0 WHEN gross <= 540 THEN 30 ELSE 45 END)
        - GREATEST(0, span - gross))) AS break_minutes,
      SUM(cnt) AS entry_count
    FROM daily GROUP BY emp_id
  ),
  pauschal AS (
    SELECT pe.employee_id AS emp_id, SUM(pe.minutes) AS pauschal_minutes
    FROM pauschal_entries pe
    WHERE pe.status = 'approved'
      AND EXTRACT(YEAR FROM pe.datum) = p_year
      AND EXTRACT(MONTH FROM pe.datum) = p_month
    GROUP BY pe.employee_id
  )
  SELECT e.id, e.name, e.color, e.target_hours_per_month,
    (COALESCE(pe.work_minutes, 0) + COALESCE(pa.pauschal_minutes, 0))::BIGINT,
    COALESCE(pe.break_minutes, 0)::BIGINT,
    COALESCE(pa.pauschal_minutes, 0)::BIGINT,
    COALESCE(pe.entry_count, 0)::BIGINT
  FROM employees e
  LEFT JOIN per_emp pe ON pe.emp_id = e.id
  LEFT JOIN pauschal pa ON pa.emp_id = e.id
  WHERE e.is_active = true AND e.position != 'geschaeftsfuehrer'
    AND (p_include_demo OR NOT e.is_demo)
  ORDER BY e.name;
$function$;
GRANT EXECUTE ON FUNCTION public.get_all_employees_month_hours(integer, integer, boolean) TO authenticated;
