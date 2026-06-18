-- Migration 118: GF-Frist-WhatsApp-Erinnerung — interne RPC + taeglicher Cron.
--
-- Idee: notify-scheduled (mode 'gf_frist_reminders') ruft get_gf_due_reminders_internal()
-- auf. Diese liefert pro faelliger Frist (innerhalb "X Tage vorher", noch nicht
-- in der App abgehakt) die GF-Empfaenger mit Telefonnummer — ABER nur einmal pro
-- Periode: ein separater Ack-Key 'fristwa:<id>:<due>' verhindert das erneute
-- Senden. Wird die Frist in der App abgehakt (frist:<id>:<due> gesetzt), faellt
-- sie aus der Liste -> keine weitere WhatsApp.

CREATE OR REPLACE FUNCTION public.get_gf_due_reminders_internal()
  RETURNS TABLE(
    reminder_id uuid, title text, next_due_date date, days_until integer,
    gf_employee_id uuid, gf_name text, gf_phone text)
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
AS $fn$
  WITH due AS (
    SELECT r.id, r.title, r.next_due_date,
           (r.next_due_date - (now() AT TIME ZONE 'Europe/Berlin')::date) AS days_until
    FROM public.gf_reminders r
    WHERE (r.next_due_date - (now() AT TIME ZONE 'Europe/Berlin')::date)
            BETWEEN 0 AND r.remind_days_before
      -- noch nicht in der App abgehakt (geteilter Ack)
      AND NOT EXISTS (
        SELECT 1 FROM public.notification_acks na
        WHERE na.notif_key = public.gf_reminder_ack_key(r.id, r.next_due_date))
      -- WhatsApp fuer diese Periode noch nicht verschickt
      AND NOT EXISTS (
        SELECT 1 FROM public.notification_acks na
        WHERE na.notif_key = 'fristwa:' || r.id::text || ':' || to_char(r.next_due_date,'YYYY-MM-DD'))
  )
  SELECT d.id, d.title, d.next_due_date, d.days_until,
         e.id, e.name, e.phone
  FROM due d
  JOIN public.employees e
    ON NOT e.is_demo
   AND e.position = 'geschaeftsfuehrer'
   AND e.phone IS NOT NULL;
$fn$;
REVOKE ALL ON FUNCTION public.get_gf_due_reminders_internal() FROM public;
GRANT EXECUTE ON FUNCTION public.get_gf_due_reminders_internal() TO service_role;

-- Markiert eine Periode als "WhatsApp verschickt" (vom Edge-Service aufgerufen).
CREATE OR REPLACE FUNCTION public.mark_gf_reminder_whatsapp_sent(p_id uuid, p_due date)
  RETURNS void LANGUAGE plpgsql SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
AS $fn$
BEGIN
  INSERT INTO public.notification_acks (notif_key, acknowledged_by)
  VALUES ('fristwa:' || p_id::text || ':' || to_char(p_due,'YYYY-MM-DD'), NULL)
  ON CONFLICT (notif_key) DO NOTHING;
END; $fn$;
REVOKE ALL ON FUNCTION public.mark_gf_reminder_whatsapp_sent(uuid, date) FROM public;
GRANT EXECUTE ON FUNCTION public.mark_gf_reminder_whatsapp_sent(uuid, date) TO service_role;

-- Taeglicher Cron 06:10 UTC (~08:10 Berlin). Service-Role-Key aus dem Vault
-- (analog Mig 083/088/093 — Schluessel bereits vorhanden).
SELECT cron.unschedule('notify-gf-frist-reminders')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'notify-gf-frist-reminders');

SELECT cron.schedule(
  'notify-gf-frist-reminders',
  '10 6 * * *',
  $cmd$
  SELECT net.http_post(
    url := 'https://tcqdyzmhwyfamzyeyskj.supabase.co/functions/v1/notify-scheduled',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || COALESCE(
        (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key'), '')
    ),
    body := jsonb_build_object('mode', 'gf_frist_reminders')
  );
  $cmd$
);
