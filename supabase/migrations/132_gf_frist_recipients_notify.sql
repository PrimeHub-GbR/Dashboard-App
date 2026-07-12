-- Migration 132: GF-Frist-Erinnerungen (Cron -> notify-scheduled, Modus
-- 'gf_frist_reminders') auf die Empfaengerliste der Frist umstellen.
--
-- WhatsApp + Push gehen nur noch an employees, die in
-- gf_reminders.recipient_employee_ids stehen (statt an alle GF).
-- Spaltennamen bleiben unveraendert (gf_employee_id/gf_name/gf_phone),
-- damit die Edge Function notify-scheduled nicht angefasst werden muss.
-- Der Telefon-Filter entfaellt: Empfaenger ohne Telefonnummer bekommen
-- weiterhin den App-Push (die Edge Function behandelt phone=null korrekt).

CREATE OR REPLACE FUNCTION public.get_gf_due_reminders_internal()
  RETURNS TABLE(
    reminder_id uuid, title text, next_due_date date, days_until integer,
    gf_employee_id uuid, gf_name text, gf_phone text)
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
AS $fn$
  WITH due AS (
    SELECT r.id, r.title, r.next_due_date, r.recipient_employee_ids,
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
    ON e.id = ANY(d.recipient_employee_ids)
   AND NOT e.is_demo;
$fn$;
REVOKE ALL ON FUNCTION public.get_gf_due_reminders_internal() FROM public;
GRANT EXECUTE ON FUNCTION public.get_gf_due_reminders_internal() TO service_role;
