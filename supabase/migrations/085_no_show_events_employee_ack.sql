-- Migration 085: No-Show-Events persistieren, damit der Mitarbeiter am selben
-- Tag wie der Chef ein bestaetigungspflichtiges Pop-up bekommt.

CREATE TABLE IF NOT EXISTS public.no_show_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  event_date date NOT NULL,
  planned_from text,
  planned_to text,
  created_at timestamptz NOT NULL DEFAULT now(),
  acknowledged_at timestamptz,
  UNIQUE (employee_id, event_date)
);
ALTER TABLE public.no_show_events ENABLE ROW LEVEL SECURITY;
-- Kein direkter Zugriff: alles laeuft ueber SECURITY DEFINER RPCs.

-- Nächtlich (aus notify-scheduled): No-Shows von gestern persistieren +
-- zurueckgeben (fuer den Chef-Push). Idempotent pro (Mitarbeiter, Tag).
CREATE OR REPLACE FUNCTION public.record_yesterday_no_shows()
RETURNS TABLE(employee_id uuid, employee_name text,
              planned_from text, planned_to text)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_yday date := (now() AT TIME ZONE 'Europe/Berlin')::date - 1;
BEGIN
  INSERT INTO public.no_show_events (employee_id, event_date, planned_from, planned_to)
  SELECT ns.employee_id, v_yday, ns.planned_from, ns.planned_to
  FROM public.get_no_shows_internal() ns
  ON CONFLICT (employee_id, event_date) DO NOTHING;

  RETURN QUERY
  SELECT e.id, e.name, nse.planned_from, nse.planned_to
  FROM public.no_show_events nse
  JOIN public.employees e ON e.id = nse.employee_id
  WHERE nse.event_date = v_yday;
END; $$;
REVOKE ALL ON FUNCTION public.record_yesterday_no_shows() FROM public;
GRANT EXECUTE ON FUNCTION public.record_yesterday_no_shows() TO service_role;

-- Mitarbeiter: eigene noch nicht bestaetigte No-Shows.
CREATE OR REPLACE FUNCTION public.get_my_unacked_no_shows()
RETURNS TABLE(id uuid, event_date date, planned_from text, planned_to text)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT nse.id, nse.event_date, nse.planned_from, nse.planned_to
  FROM public.no_show_events nse
  WHERE nse.employee_id = public.current_employee_id()
    AND nse.acknowledged_at IS NULL
  ORDER BY nse.event_date DESC;
$$;
GRANT EXECUTE ON FUNCTION public.get_my_unacked_no_shows() TO authenticated;

-- Mitarbeiter: alle eigenen offenen No-Shows als bestaetigt markieren.
CREATE OR REPLACE FUNCTION public.ack_my_no_shows()
RETURNS void
LANGUAGE sql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  UPDATE public.no_show_events
  SET acknowledged_at = now()
  WHERE employee_id = public.current_employee_id()
    AND acknowledged_at IS NULL;
$$;
GRANT EXECUTE ON FUNCTION public.ack_my_no_shows() TO authenticated;
