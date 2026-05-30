-- Migration 044: Trigger der employees.auth_user_id automatisch setzt
--
-- Wenn ein neuer auth.users-Eintrag mit raw_user_meta_data.employee_id
-- entsteht (durch auth.admin.inviteUserByEmail mit data: { employee_id }),
-- verknuepfen wir den employee-Datensatz mit dem Auth-User. Dadurch greift
-- ab dem ersten Login der Mitarbeiter-RLS-Self-Access.

CREATE OR REPLACE FUNCTION public.handle_new_auth_user_for_employee()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_employee_id UUID;
BEGIN
  v_employee_id := NULLIF(NEW.raw_user_meta_data ->> 'employee_id', '')::UUID;
  IF v_employee_id IS NOT NULL THEN
    UPDATE public.employees
    SET auth_user_id = NEW.id
    WHERE id = v_employee_id
      AND auth_user_id IS NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_link_employee ON auth.users;

CREATE TRIGGER on_auth_user_created_link_employee
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_auth_user_for_employee();

COMMENT ON FUNCTION public.handle_new_auth_user_for_employee() IS
  'Verknuepft auth.users.id mit employees.id, wenn raw_user_meta_data.employee_id beim Anlegen gesetzt ist. Genutzt vom Mitarbeiter-Invite-Flow.';
