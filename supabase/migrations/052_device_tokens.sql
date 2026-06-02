-- Migration 052: Geräte-Tokens für Push-Benachrichtigungen (Mitarbeiter-App)
--
-- Jedes Handy meldet beim App-Start seinen FCM-Token. Beim Zuweisen einer
-- Aufgabe lädt die Edge Function `notify-task-assigned` die Tokens der
-- zugewiesenen Mitarbeitenden und sendet über Firebase Cloud Messaging.
--
-- Schreiben ausschliesslich über die RPCs register_device_token /
-- unregister_device_token (SECURITY DEFINER, an current_employee_id gebunden).
-- Die Edge Function liest mit Service-Role (umgeht RLS).

CREATE TABLE IF NOT EXISTS public.device_tokens (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  token       TEXT NOT NULL UNIQUE,
  platform    TEXT NOT NULL CHECK (platform IN ('ios','android')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS device_tokens_employee_idx
  ON public.device_tokens(employee_id);

ALTER TABLE public.device_tokens ENABLE ROW LEVEL SECURITY;

-- Lesen: Chef alle, Mitarbeiter eigene (Schreiben läuft über RPCs)
CREATE POLICY "device_tokens_select_role_or_self" ON public.device_tokens
FOR SELECT TO authenticated
USING (
  public.is_admin_or_manager()
  OR employee_id = public.current_employee_id()
);

-- =========================================================================
-- RPC: Token registrieren (Upsert). Ein Token gehört immer dem zuletzt
-- eingeloggten Mitarbeiter dieses Geräts (Gerätewechsel/Account-Wechsel).
-- =========================================================================
CREATE OR REPLACE FUNCTION public.register_device_token(
  p_token    TEXT,
  p_platform TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_emp UUID := public.current_employee_id();
BEGIN
  IF v_emp IS NULL THEN
    RAISE EXCEPTION 'Kein verknuepfter Mitarbeiter-Account';
  END IF;
  IF p_platform NOT IN ('ios','android') THEN
    RAISE EXCEPTION 'Ungueltige Plattform: %', p_platform;
  END IF;

  INSERT INTO public.device_tokens (employee_id, token, platform)
  VALUES (v_emp, p_token, p_platform)
  ON CONFLICT (token) DO UPDATE
    SET employee_id = v_emp,
        platform    = p_platform,
        updated_at  = now();
END;
$$;

GRANT EXECUTE ON FUNCTION public.register_device_token(TEXT, TEXT) TO authenticated;

-- =========================================================================
-- RPC: Token abmelden (z. B. beim Logout).
-- =========================================================================
CREATE OR REPLACE FUNCTION public.unregister_device_token(p_token TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  DELETE FROM public.device_tokens WHERE token = p_token;
END;
$$;

GRANT EXECUTE ON FUNCTION public.unregister_device_token(TEXT) TO authenticated;

COMMENT ON TABLE public.device_tokens IS
  'FCM-Geräte-Tokens pro Mitarbeiter für Push-Benachrichtigungen (Aufgaben-Zuweisung).';
