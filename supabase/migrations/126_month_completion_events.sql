-- Migration 126: Dedupe-Event für die "Stunden voll"-Benachrichtigung.
--
-- Pro Mitarbeiter + Monat darf höchstens EIN Event existieren (Unique). Damit
-- wird die Benachrichtigung nur beim erstmaligen Erreichen des Monats-Solls
-- ausgelöst (Kiosk-Checkout) und in der App nur solange als Popup gezeigt, bis
-- der Mitarbeiter sie quittiert (acked_at).
--
-- period_month = erster Tag des Berlin-Monats (date), in dem das Soll erreicht
-- wurde.
--
-- Zugriff:
--   * Schreiben/Idempotenz nur via SECURITY DEFINER RPCs.
--   * record_month_completion -> nur Service-Role (Kiosk-Checkout). Idempotent.
--   * get_my_pending_completion / ack_month_completion -> App (authenticated),
--     immer nur eigener Datensatz.

CREATE TABLE IF NOT EXISTS public.month_completion_events (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id  uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  period_month date NOT NULL,
  reached_at   timestamptz NOT NULL DEFAULT now(),
  acked_at     timestamptz,
  CONSTRAINT month_completion_unique UNIQUE (employee_id, period_month)
);

CREATE INDEX IF NOT EXISTS month_completion_events_employee_idx
  ON public.month_completion_events (employee_id);

ALTER TABLE public.month_completion_events ENABLE ROW LEVEL SECURITY;
-- Kein direkter Zugriff: alles via SECURITY DEFINER RPCs. Service-Role darf alles.
CREATE POLICY "month_completion_events_service"
  ON public.month_completion_events FOR ALL TO service_role
  USING (true) WITH CHECK (true);

COMMENT ON TABLE public.month_completion_events IS
  'Dedupe je Mitarbeiter+Monat für die "Stunden voll"-Benachrichtigung. Anlage idempotent via record_month_completion (Service-Role/Kiosk). acked_at = vom Mitarbeiter in der App quittiert.';

-- ===========================================================================
-- RPC: record_month_completion — idempotent ein Event anlegen (Service-Role)
--   Gibt TRUE zurück, wenn das Event NEU angelegt wurde (-> Push auslösen),
--   FALSE, wenn für den Monat bereits eines existierte.
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.record_month_completion(
  p_employee_id  uuid,
  p_period_month date
)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_inserted boolean := false;
BEGIN
  -- Nur Service-Role (Kiosk-Checkout). Authentifizierte User dürfen nicht.
  IF auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.month_completion_events (employee_id, period_month)
  VALUES (p_employee_id, date_trunc('month', p_period_month)::date)
  ON CONFLICT (employee_id, period_month) DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN v_inserted;
END;
$$;
GRANT EXECUTE ON FUNCTION public.record_month_completion(uuid, date) TO service_role;

COMMENT ON FUNCTION public.record_month_completion(uuid, date) IS
  'Legt idempotent ein month_completion_event an (Service-Role/Kiosk). TRUE wenn neu (Push auslösen), FALSE wenn bereits vorhanden.';

-- ===========================================================================
-- RPC: get_my_pending_completion — ungeacktes Event + Facts (App)
--   Liefert höchstens eine Zeile (das jüngste ungeackte Event des Users) plus
--   die zugehörigen Facts aus get_month_completion_facts.
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.get_my_pending_completion()
RETURNS TABLE (
  event_id            uuid,
  period_month        date,
  reached_at          timestamptz,
  ist_minutes         integer,
  soll_minutes        integer,
  worked_days         integer,
  avg_minutes_per_day integer,
  break_minutes       integer,
  vacation_days       integer,
  sick_days           integer,
  unpaid_days         integer,
  completed_tasks     integer
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_emp uuid;
  v_evt public.month_completion_events;
  v_start date;
  v_end   date;
BEGIN
  v_emp := public.current_employee_id();
  IF v_emp IS NULL THEN RETURN; END IF;

  SELECT * INTO v_evt
  FROM public.month_completion_events e
  WHERE e.employee_id = v_emp
    AND e.acked_at IS NULL
  ORDER BY e.reached_at DESC
  LIMIT 1;

  IF NOT FOUND THEN RETURN; END IF;

  v_start := v_evt.period_month;
  v_end   := (date_trunc('month', v_evt.period_month) + interval '1 month - 1 day')::date;

  RETURN QUERY
  SELECT
    v_evt.id, v_evt.period_month, v_evt.reached_at,
    f.ist_minutes, f.soll_minutes, f.worked_days, f.avg_minutes_per_day,
    f.break_minutes, f.vacation_days, f.sick_days, f.unpaid_days, f.completed_tasks
  FROM public.get_month_completion_facts(v_emp, v_start, v_end) f;
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_my_pending_completion() TO authenticated;

COMMENT ON FUNCTION public.get_my_pending_completion() IS
  'App-Start-Popup: jüngstes ungeacktes "Stunden voll"-Event des eingeloggten Mitarbeiters inkl. Facts. Leer, wenn keins offen.';

-- ===========================================================================
-- RPC: ack_month_completion — Event quittieren (App)
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.ack_month_completion()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_emp uuid;
BEGIN
  v_emp := public.current_employee_id();
  IF v_emp IS NULL THEN RETURN; END IF;

  UPDATE public.month_completion_events
  SET acked_at = now()
  WHERE employee_id = v_emp
    AND acked_at IS NULL;
END;
$$;
GRANT EXECUTE ON FUNCTION public.ack_month_completion() TO authenticated;

COMMENT ON FUNCTION public.ack_month_completion() IS
  'App: quittiert alle offenen "Stunden voll"-Events des eingeloggten Mitarbeiters (setzt acked_at).';
