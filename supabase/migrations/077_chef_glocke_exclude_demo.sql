-- Migration 077: Demo-Aufgaben aus der Chef-Glocke ausschliessen.
-- Die Demo-Aufgabe "Versandetiketten drucken" (is_demo=true) tauchte als
-- erledigte Aufgabe in der Glocke auf; bei jedem Demo-Reset bekam sie eine
-- neue ID -> der Ack-Key (taskdone:<id>) aenderte sich -> Meldung kam trotz
-- Quittierung erneut. Demo-Aufgaben gehoeren nie in die echte Chef-Glocke.

CREATE OR REPLACE FUNCTION public.get_chef_task_notifications()
RETURNS TABLE(task_id uuid, title text, completed_at timestamp with time zone,
  completed_by uuid, completer_name text, completer_color text, acknowledged boolean)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT
    t.id, t.title, t.completed_at, t.completed_by, e.name, e.color,
    EXISTS (
      SELECT 1 FROM public.notification_acks na
      WHERE na.notif_key = 'taskdone:' || t.id::text
    )
  FROM public.tasks t
  JOIN public.employees e ON e.id = t.completed_by
  WHERE public.is_chef()
    AND t.status = 'done'
    AND t.completed_by IS NOT NULL
    AND t.completed_at IS NOT NULL
    AND t.completed_at >= now() - interval '30 days'
    AND COALESCE(t.is_demo, false) = false
  ORDER BY t.completed_at DESC
  LIMIT 50;
$function$;
