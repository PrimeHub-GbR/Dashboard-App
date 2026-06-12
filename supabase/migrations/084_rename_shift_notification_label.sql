-- Migration 084: "Neue Schicht" -> "Neu eingeplant" in der Mitarbeiter-
-- Benachrichtigung. Wir nutzen keinen "Schicht"-Begriff und titeln niemanden
-- als "Chef" — der Manager plant den Mitarbeiter einfach ein.
CREATE OR REPLACE FUNCTION public.get_my_pending_notifications()
 RETURNS TABLE(kind text, ref_id uuid, title text, subtitle text, event_at timestamp with time zone, ack_key text)
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
  SELECT 'shift'::text, s.id, 'Neu eingeplant'::text,
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
