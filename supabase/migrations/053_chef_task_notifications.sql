-- Migration 053: Chef-Benachrichtigungen in der Mitarbeiter-App (Glocke)
--
-- GF/Manager sehen in der App eine Glocke mit "Aufgabe erledigt"-Meldungen
-- (gleiche Idee wie das Notification-Center im Web-Dashboard).
--
-- Warum RPCs statt direkter Queries?
--   * tasks-RLS + notification_acks-RLS haengen an is_admin_or_manager(), das
--     NUR user_roles prueft. Ein positions-basierter Chef (employees.position =
--     'geschaeftsfuehrer'/'manager' ohne user_roles-Eintrag) wuerde sonst weder
--     alle erledigten Aufgaben noch die Acks sehen.
--   * SECURITY DEFINER + eigener is_chef()-Check spiegelt exakt die App-Logik
--     (RoleInfo.isChef) und umgeht diese RLS-Sonderfaelle sauber.

-- =========================================================================
-- 1. Helper: "Chef" = Rolle admin/manager ODER Position gf/manager
-- =========================================================================
CREATE OR REPLACE FUNCTION public.is_chef()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role IN ('admin', 'manager')
    )
    OR EXISTS (
      SELECT 1 FROM public.employees
      WHERE auth_user_id = auth.uid()
        AND position IN ('geschaeftsfuehrer', 'manager')
    );
$$;

GRANT EXECUTE ON FUNCTION public.is_chef() TO authenticated;

COMMENT ON FUNCTION public.is_chef() IS
  'TRUE wenn der aktuelle User Chef ist (Rolle admin/manager ODER Position geschaeftsfuehrer/manager). Fuer die App-Glocke.';

-- =========================================================================
-- 2. RPC: von Mitarbeitern erledigte Aufgaben (letzte 30 Tage) + Ack-Status
-- =========================================================================
CREATE OR REPLACE FUNCTION public.get_chef_task_notifications()
RETURNS TABLE (
  task_id         uuid,
  title           text,
  completed_at    timestamptz,
  completed_by    uuid,
  completer_name  text,
  completer_color text,
  acknowledged    boolean
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    t.id,
    t.title,
    t.completed_at,
    t.completed_by,
    e.name,
    e.color,
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
  ORDER BY t.completed_at DESC
  LIMIT 50;
$$;

GRANT EXECUTE ON FUNCTION public.get_chef_task_notifications() TO authenticated;

COMMENT ON FUNCTION public.get_chef_task_notifications() IS
  'App-Glocke (nur Chef): von Mitarbeitern selbst abgehakte Aufgaben der letzten 30 Tage inkl. Ack-Status. Leere Liste fuer Nicht-Chefs.';

-- =========================================================================
-- 3. RPC: Meldung bestaetigen -> notification_acks (nur Chef)
--    notification_acks ist sonst service-role-only beschreibbar.
-- =========================================================================
CREATE OR REPLACE FUNCTION public.ack_notification(p_key text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.is_chef() THEN
    RAISE EXCEPTION 'Keine Berechtigung';
  END IF;
  INSERT INTO public.notification_acks (notif_key, acknowledged_by)
  VALUES (p_key, auth.uid())
  ON CONFLICT (notif_key) DO NOTHING;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ack_notification(text) TO authenticated;

COMMENT ON FUNCTION public.ack_notification(text) IS
  'Bestaetigt eine Notification (App-Glocke, nur Chef): schreibt notification_acks (sonst service-role-only). Key-Schema z.B. taskdone:<task_id>.';
