-- Migration 095: WhatsApp bei Fälligkeit von Aufgaben.
--
-- Spalte due_notified_at verhindert Doppel-Benachrichtigung. RPC liefert die
-- heute (oder überfällig) fälligen, offenen Aufgaben je Mitarbeiter + den
-- Vorgesetzten (Ersteller) und markiert sie sofort als gemeldet (idempotent).
-- Naechtlich/morgens via Cron -> Edge Function notify-scheduled (Modus tasks_due).

ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS due_notified_at timestamptz;

CREATE OR REPLACE FUNCTION public.get_and_mark_tasks_due()
  RETURNS TABLE(
    task_id uuid, task_title text, due_date date,
    employee_id uuid, employee_name text, employee_phone text,
    supervisor_employee_id uuid
  )
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_today date := (now() AT TIME ZONE 'Europe/Berlin')::date;
BEGIN
  RETURN QUERY
  SELECT t.id, t.title, t.due_date,
         e.id, e.name, e.phone,
         sup.id
  FROM public.tasks t
  JOIN public.task_assignees ta ON ta.task_id = t.id
  JOIN public.employees e ON e.id = ta.employee_id AND NOT e.is_demo
  LEFT JOIN public.employees sup ON sup.auth_user_id = t.created_by
  WHERE t.due_date IS NOT NULL
    AND t.due_date <= v_today
    AND t.status <> 'done'
    AND t.due_notified_at IS NULL
    AND COALESCE(t.is_demo, false) = false;

  -- Einmalig markieren (auch Aufgaben ohne Assignee/Telefon, damit der Lauf
  -- nicht jeden Tag erneut feuert).
  UPDATE public.tasks t SET due_notified_at = now()
  WHERE t.due_date IS NOT NULL
    AND t.due_date <= v_today
    AND t.status <> 'done'
    AND t.due_notified_at IS NULL
    AND COALESCE(t.is_demo, false) = false;
END; $function$;

REVOKE ALL ON FUNCTION public.get_and_mark_tasks_due() FROM public;
GRANT EXECUTE ON FUNCTION public.get_and_mark_tasks_due() TO service_role;

-- Cron: morgens 06:00 UTC (~08:00 Berlin). Service-Role-Key aus dem Vault.
SELECT cron.unschedule('notify-tasks-due')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'notify-tasks-due');

SELECT cron.schedule(
  'notify-tasks-due',
  '0 6 * * *',
  $cmd$
  SELECT net.http_post(
    url := 'https://tcqdyzmhwyfamzyeyskj.supabase.co/functions/v1/notify-scheduled',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || COALESCE(
        (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key'), '')
    ),
    body := jsonb_build_object('mode', 'tasks_due')
  );
  $cmd$
);
