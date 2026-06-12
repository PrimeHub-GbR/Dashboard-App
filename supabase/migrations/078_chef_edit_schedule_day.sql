-- Migration 078: Chef bearbeitet/loescht verplante Tage eines Mitarbeiters
-- (tageweise) und der Mitarbeiter erhaelt eine Pflicht-Bestaetigungs-Meldung.
-- Das bestehende Mitarbeiter-Benachrichtigungssystem (get_my_pending_
-- notifications, Migration 065) wird um die Art 'schedule' erweitert.

CREATE TABLE IF NOT EXISTS public.schedule_change_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  event_date  date NOT NULL,
  action      text NOT NULL CHECK (action IN ('changed','deleted')),
  detail      text,
  created_by  uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.schedule_change_events ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_sce_emp ON public.schedule_change_events (employee_id, created_at DESC);

-- Chef aendert/loescht die geplante Arbeitszeit eines Mitarbeiters fuer EINEN
-- Tag. p_from/p_to = NULL -> Tag loeschen. Vergangene Tage sind gesperrt.
CREATE OR REPLACE FUNCTION public.admin_edit_employee_day(
  p_employee_id uuid, p_date date, p_from text DEFAULT NULL, p_to text DEFAULT NULL
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp' AS $$
DECLARE
  v_chef uuid;
  v_monday date;
  v_keys text[] := ARRAY['mon','tue','wed','thu','fri','sat','sun'];
  v_key text;
  v_avail jsonb;
  v_action text;
  v_detail text;
BEGIN
  IF NOT public.is_chef() THEN RAISE EXCEPTION 'Keine Berechtigung'; END IF;
  IF public._my_level() <= public._level_of(p_employee_id) THEN
    RAISE EXCEPTION 'Keine Berechtigung fuer diesen Mitarbeiter (Hierarchie)';
  END IF;
  IF p_date < current_date THEN
    RAISE EXCEPTION 'Vergangene Tage koennen nicht geaendert werden';
  END IF;
  IF p_from IS NOT NULL AND p_to IS NOT NULL AND p_to <= p_from THEN
    RAISE EXCEPTION 'Endzeit muss nach Startzeit liegen';
  END IF;

  SELECT id INTO v_chef FROM public.employees WHERE auth_user_id = auth.uid();
  v_monday := p_date - (EXTRACT(ISODOW FROM p_date)::int - 1);
  v_key := v_keys[EXTRACT(ISODOW FROM p_date)::int];

  INSERT INTO public.employee_schedule_requests (employee_id, week_start, availability)
    VALUES (p_employee_id, v_monday, '{}'::jsonb)
    ON CONFLICT (employee_id, week_start) DO NOTHING;
  SELECT availability INTO v_avail FROM public.employee_schedule_requests
    WHERE employee_id = p_employee_id AND week_start = v_monday;
  v_avail := COALESCE(v_avail, '{}'::jsonb);

  IF p_from IS NULL OR p_to IS NULL THEN
    v_avail := v_avail - v_key;
    v_action := 'deleted';
    v_detail := to_char(p_date,'DD.MM.YYYY') || ': Arbeitszeit entfernt';
  ELSE
    v_avail := jsonb_set(v_avail, ARRAY[v_key],
                 jsonb_build_object('from', p_from, 'to', p_to), true);
    v_action := 'changed';
    v_detail := to_char(p_date,'DD.MM.YYYY') || ': ' || p_from || '-' || p_to;
  END IF;

  UPDATE public.employee_schedule_requests SET availability = v_avail
    WHERE employee_id = p_employee_id AND week_start = v_monday;

  INSERT INTO public.schedule_change_events (employee_id, event_date, action, detail, created_by)
    VALUES (p_employee_id, p_date, v_action, v_detail, v_chef);
END; $$;
GRANT EXECUTE ON FUNCTION public.admin_edit_employee_day(uuid, date, text, text) TO authenticated;

-- get_my_pending_notifications um Arbeitsplan-Aenderungen (schedule) erweitern.
CREATE OR REPLACE FUNCTION public.get_my_pending_notifications()
RETURNS TABLE(kind text, ref_id uuid, title text, subtitle text, event_at timestamptz, ack_key text)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  WITH me AS (SELECT public.current_employee_id() AS eid)
  SELECT 'task'::text, t.id, t.title, 'Neue Aufgabe'::text, t.created_at,
         'seen:task:' || t.id::text || ':' || (SELECT eid FROM me)::text
  FROM public.tasks t
  JOIN public.task_assignees ta ON ta.task_id = t.id
  WHERE ta.employee_id = (SELECT eid FROM me)
    AND t.status <> 'done' AND t.created_at > now() - interval '60 days'
    AND NOT EXISTS (SELECT 1 FROM public.notification_acks na
      WHERE na.notif_key = 'seen:task:' || t.id::text || ':' || (SELECT eid FROM me)::text)
  UNION ALL
  SELECT 'absence'::text, a.id,
         CASE a.type WHEN 'urlaub' THEN 'Urlaub' WHEN 'krankheit' THEN 'Krankheit' ELSE 'Freistellung' END
         || ' ' ||
         CASE a.status WHEN 'approved' THEN 'genehmigt' WHEN 'rejected' THEN 'abgelehnt' ELSE a.status END,
         to_char(a.start_date,'DD.MM.') || '-' || to_char(a.end_date,'DD.MM.'),
         COALESCE(a.reviewed_at, a.created_at),
         'seen:absence:' || a.id::text || ':' || (SELECT eid FROM me)::text
  FROM public.absence_requests a
  WHERE a.employee_id = (SELECT eid FROM me)
    AND a.status IN ('approved','rejected') AND a.reviewed_at IS NOT NULL
    AND a.reviewed_at > now() - interval '60 days'
    AND NOT EXISTS (SELECT 1 FROM public.notification_acks na
      WHERE na.notif_key = 'seen:absence:' || a.id::text || ':' || (SELECT eid FROM me)::text)
  UNION ALL
  SELECT 'shift'::text, s.id, 'Neue Schicht'::text,
         to_char(s.shift_date,'DD.MM.') || '  ' ||
           to_char(s.start_time,'HH24:MI') || '-' || to_char(s.end_time,'HH24:MI'),
         s.created_at,
         'seen:shift:' || s.id::text || ':' || (SELECT eid FROM me)::text
  FROM public.planned_shifts s
  WHERE s.employee_id = (SELECT eid FROM me) AND s.shift_date >= current_date
    AND NOT EXISTS (SELECT 1 FROM public.notification_acks na
      WHERE na.notif_key = 'seen:shift:' || s.id::text || ':' || (SELECT eid FROM me)::text)
  UNION ALL
  SELECT 'schedule'::text, sce.id, 'Arbeitsplan geändert'::text,
         sce.detail, sce.created_at,
         'seen:schedule:' || sce.id::text || ':' || (SELECT eid FROM me)::text
  FROM public.schedule_change_events sce
  WHERE sce.employee_id = (SELECT eid FROM me)
    AND sce.created_at > now() - interval '60 days'
    AND NOT EXISTS (SELECT 1 FROM public.notification_acks na
      WHERE na.notif_key = 'seen:schedule:' || sce.id::text || ':' || (SELECT eid FROM me)::text)
  ORDER BY 5 DESC
  LIMIT 50;
$function$;
