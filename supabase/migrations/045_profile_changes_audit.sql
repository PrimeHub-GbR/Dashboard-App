-- Migration 045: Audit-Log fuer Mitarbeiter-Profil-Aenderungen
--
-- Mitarbeitende koennen aus der App ihre E-Mail, Telefonnummer und Adresse
-- selbst aendern. Jede Aenderung wird in `employee_profile_changes` geloggt
-- und dem Manager/Admin im Dashboard angezeigt (Badge + Liste). Manager kann
-- die Aenderung als gesehen markieren.

CREATE TABLE IF NOT EXISTS public.employee_profile_changes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id     UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  field_name      TEXT NOT NULL,            -- 'email', 'phone', 'home_address'
  old_value       TEXT,
  new_value       TEXT,
  changed_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  acknowledged_at TIMESTAMPTZ,
  acknowledged_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_epc_unack
  ON public.employee_profile_changes (changed_at DESC)
  WHERE acknowledged_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_epc_employee
  ON public.employee_profile_changes (employee_id, changed_at DESC);

ALTER TABLE public.employee_profile_changes ENABLE ROW LEVEL SECURITY;

-- Admin/Manager liest alles
CREATE POLICY "epc_select_role"
  ON public.employee_profile_changes
  FOR SELECT TO authenticated
  USING (public.is_admin_or_manager());

-- Schreiben ausschliesslich ueber Service-Role / Trigger
CREATE POLICY "epc_write_service"
  ON public.employee_profile_changes
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Authenticated darf UPDATE fuer Acknowledgement (Manager markiert gelesen)
CREATE POLICY "epc_ack_role"
  ON public.employee_profile_changes
  FOR UPDATE TO authenticated
  USING (public.is_admin_or_manager())
  WITH CHECK (public.is_admin_or_manager());

-- =========================================================================
-- Trigger: bei UPDATE auf employees.{email|phone|home_address} → Audit-Eintrag
-- =========================================================================
CREATE OR REPLACE FUNCTION public.log_employee_profile_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.email IS DISTINCT FROM OLD.email THEN
    INSERT INTO public.employee_profile_changes (employee_id, field_name, old_value, new_value)
    VALUES (NEW.id, 'email', OLD.email, NEW.email);
  END IF;

  IF NEW.phone IS DISTINCT FROM OLD.phone THEN
    INSERT INTO public.employee_profile_changes (employee_id, field_name, old_value, new_value)
    VALUES (NEW.id, 'phone', OLD.phone, NEW.phone);
  END IF;

  IF NEW.home_address IS DISTINCT FROM OLD.home_address THEN
    INSERT INTO public.employee_profile_changes (employee_id, field_name, old_value, new_value)
    VALUES (NEW.id, 'home_address', OLD.home_address, NEW.home_address);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_employee_profile_change ON public.employees;

CREATE TRIGGER on_employee_profile_change
  AFTER UPDATE OF email, phone, home_address ON public.employees
  FOR EACH ROW
  EXECUTE FUNCTION public.log_employee_profile_change();

-- =========================================================================
-- RPC: Mitarbeiter aktualisiert eigenes Profil
-- =========================================================================
CREATE OR REPLACE FUNCTION public.update_my_profile(
  p_phone TEXT DEFAULT NULL,
  p_home_address TEXT DEFAULT NULL,
  p_email TEXT DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  email TEXT,
  phone TEXT,
  home_address TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_employee_id UUID;
BEGIN
  v_employee_id := public.current_employee_id();
  IF v_employee_id IS NULL THEN
    RAISE EXCEPTION 'Kein verknuepfter Mitarbeiter-Datensatz';
  END IF;

  UPDATE public.employees e
  SET phone        = COALESCE(p_phone, e.phone),
      home_address = COALESCE(p_home_address, e.home_address),
      email        = COALESCE(p_email, e.email)
  WHERE e.id = v_employee_id;

  RETURN QUERY
  SELECT e.id, e.email, e.phone, e.home_address
  FROM public.employees e
  WHERE e.id = v_employee_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_my_profile(TEXT, TEXT, TEXT) TO authenticated;

COMMENT ON TABLE public.employee_profile_changes IS
  'Audit-Log: Aenderungen an employees.email/phone/home_address durch Mitarbeiter via App. Manager sieht im Dashboard.';
COMMENT ON FUNCTION public.update_my_profile(TEXT, TEXT, TEXT) IS
  'Mitarbeiter aendert eigenes Profil (Telefon, Adresse, E-Mail). Loggt automatisch im Audit-Trail.';
