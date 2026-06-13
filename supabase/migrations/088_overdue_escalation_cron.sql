-- Migration 088: taeglicher Cron — ueberfaellige Aufgaben auf Prio 'high'
-- setzen + Eskalation an Chefs/GF (06:00 UTC ~ 08:00 Berlin).
SELECT cron.unschedule('escalate-overdue-tasks')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'escalate-overdue-tasks');

SELECT cron.schedule(
  'escalate-overdue-tasks',
  '0 6 * * *',
  $cmd$
  SELECT net.http_post(
    url := 'https://tcqdyzmhwyfamzyeyskj.supabase.co/functions/v1/notify-scheduled',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || COALESCE(
        (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key'), '')
    ),
    body := jsonb_build_object('mode', 'overdue_tasks')
  );
  $cmd$
);
