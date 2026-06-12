-- Migration 083: Cron-Jobs fuer die zeitgesteuerten Pushes.
-- Der Service-Role-Key kommt aus dem Vault (Name 'service_role_key') — KEIN
-- Secret im Repo. Solange der Vault-Eintrag fehlt, liefert der Call 401 (kein
-- Push, aber harmlos). Der User legt den Vault-Eintrag einmalig an:
--   select vault.create_secret('<SERVICE_ROLE_KEY>', 'service_role_key');
-- Voraussetzung: extensions pg_cron + pg_net aktiv.

SELECT cron.unschedule('notify-no-shows')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'notify-no-shows');
SELECT cron.unschedule('notify-planning-due')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'notify-planning-due');

-- No-Shows: taeglich 23:30 UTC (= 00:30/01:30 Berlin, nach Mitternacht).
SELECT cron.schedule(
  'notify-no-shows',
  '30 23 * * *',
  $cmd$
  SELECT net.http_post(
    url := 'https://tcqdyzmhwyfamzyeyskj.supabase.co/functions/v1/notify-scheduled',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || COALESCE(
        (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key'), '')
    ),
    body := jsonb_build_object('mode', 'no_shows')
  );
  $cmd$
);

-- Planungs-Erinnerung: am 20. um 07:00 UTC (~09:00 Berlin).
SELECT cron.schedule(
  'notify-planning-due',
  '0 7 20 * *',
  $cmd$
  SELECT net.http_post(
    url := 'https://tcqdyzmhwyfamzyeyskj.supabase.co/functions/v1/notify-scheduled',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || COALESCE(
        (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key'), '')
    ),
    body := jsonb_build_object('mode', 'planning_due')
  );
  $cmd$
);
