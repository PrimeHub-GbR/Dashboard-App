-- Migration 065: Mitarbeiter-Benachrichtigungen (In-App "Was ist neu").
--
-- get_my_pending_notifications: liefert dem eingeloggten Mitarbeiter alle neuen,
-- noch nicht bestätigten Ereignisse — zugewiesene offene Aufgaben, entschiedene
-- Abwesenheiten (genehmigt/abgelehnt bzw. vom Chef eingetragen), geplante
-- Schichten. Bestätigung über ack_my_notifications (mitarbeiter-eigene Keys,
-- daher unabhängig von der is_chef-gebundenen ack_notification).

CREATE OR REPLACE FUNCTION public.get_my_pending_notifications()
RETURNS TABLE(
  kind text, ref_id uuid, title text, subtitle text,
  event_at timestamptz, ack_key text
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  WITH me AS (SELECT public.current_employee_id() AS eid)
  -- Offene zugewiesene Aufgaben
  SELECT 'task'::text, t.id,
         t.title,
         'Neue Aufgabe'::text,
         t.created_at,
         'seen:task:' || t.id::text || ':' || (SELECT eid FROM me)::text
  FROM public.tasks t
  JOIN public.task_assignees ta ON ta.task_id = t.id
  WHERE ta.employee_id = (SELECT eid FROM me)
    AND t.status <> 'done'
    AND t.created_at > now() - interval '60 days'
    AND NOT EXISTS (
      SELECT 1 FROM public.notification_acks na
      WHERE na.notif_key = 'seen:task:' || t.id::text || ':' || (SELECT eid FROM me)::text
    )
  UNION ALL
  -- Entschiedene Abwesenheiten (genehmigt/abgelehnt; inkl. vom Chef eingetragene)
  SELECT 'absence'::text, a.id,
         CASE a.type WHEN 'urlaub' THEN 'Urlaub'
                     WHEN 'krankheit' THEN 'Krankheit'
                     ELSE 'Freistellung' END
         || ' ' ||
         CASE a.status WHEN 'approved' THEN 'genehmigt'
                       WHEN 'rejected' THEN 'abgelehnt'
                       ELSE a.status END,
         to_char(a.start_date,'DD.MM.') || '-' || to_char(a.end_date,'DD.MM.'),
         COALESCE(a.reviewed_at, a.created_at),
         'seen:absence:' || a.id::text || ':' || (SELECT eid FROM me)::text
  FROM public.absence_requests a
  WHERE a.employee_id = (SELECT eid FROM me)
    AND a.status IN ('approved','rejected')
    AND a.reviewed_at IS NOT NULL
    AND a.reviewed_at > now() - interval '60 days'
    AND NOT EXISTS (
      SELECT 1 FROM public.notification_acks na
      WHERE na.notif_key = 'seen:absence:' || a.id::text || ':' || (SELECT eid FROM me)::text
    )
  UNION ALL
  -- Geplante Schichten (ab heute)
  SELECT 'shift'::text, s.id,
         'Neue Schicht'::text,
         to_char(s.shift_date,'DD.MM.') || '  ' ||
           to_char(s.start_time,'HH24:MI') || '-' || to_char(s.end_time,'HH24:MI'),
         s.created_at,
         'seen:shift:' || s.id::text || ':' || (SELECT eid FROM me)::text
  FROM public.planned_shifts s
  WHERE s.employee_id = (SELECT eid FROM me)
    AND s.shift_date >= current_date
    AND NOT EXISTS (
      SELECT 1 FROM public.notification_acks na
      WHERE na.notif_key = 'seen:shift:' || s.id::text || ':' || (SELECT eid FROM me)::text
    )
  ORDER BY 5 DESC
  LIMIT 50;
$$;
GRANT EXECUTE ON FUNCTION public.get_my_pending_notifications() TO authenticated;

-- Bestätigt (markiert als gesehen) mehrere Notif-Keys für den eingeloggten User.
CREATE OR REPLACE FUNCTION public.ack_my_notifications(p_keys text[])
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE k text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Nicht eingeloggt'; END IF;
  FOREACH k IN ARRAY p_keys LOOP
    INSERT INTO public.notification_acks (notif_key, acknowledged_by)
    VALUES (k, auth.uid())
    ON CONFLICT (notif_key) DO NOTHING;
  END LOOP;
END;
$$;
GRANT EXECUTE ON FUNCTION public.ack_my_notifications(text[]) TO authenticated;
