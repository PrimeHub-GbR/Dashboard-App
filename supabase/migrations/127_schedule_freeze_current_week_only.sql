-- Migration 127
-- Planungssperre vereinfacht: NUR die laufende Woche ist fixiert.
--   Bisher (Mig 081/100): laufende + naechste Woche gesperrt (Montag+14),
--   plus pro-Mitarbeiter-Override (employees.schedule_freeze_weeks).
--   Neu: Mitarbeiter duerfen ab der NAECHSTEN Woche wieder selbst planen —
--   Sperr-Grenze = Montag der laufenden Woche + 7 Tage. Chef darf immer.
--   Der manuelle Override wird KOMPLETT entfernt (RPC + Spalte).

-- 1) Trigger neu: nur laufende Woche fixiert, keine Override-Logik.
CREATE OR REPLACE FUNCTION public.enforce_schedule_freeze()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_this_monday date := current_date - (EXTRACT(ISODOW FROM current_date)::int - 1);
BEGIN
  -- Chef/Manager duerfen immer (laeuft ueber admin_edit_employee_day).
  IF public.is_chef() THEN RETURN NEW; END IF;
  -- Nur die laufende Woche ist fix: aenderbar ab Montag+7 (naechste Woche).
  IF NEW.week_start < v_this_monday + 7 THEN
    RAISE EXCEPTION 'Diese Woche ist fixiert. Kurzfristige Aenderungen bitte direkt mit dem Chef absprechen.';
  END IF;
  RETURN NEW;
END; $$;

-- Trigger neu anlegen (idempotent).
DROP TRIGGER IF EXISTS trg_enforce_schedule_freeze ON public.employee_schedule_requests;
CREATE TRIGGER trg_enforce_schedule_freeze
  BEFORE INSERT OR UPDATE ON public.employee_schedule_requests
  FOR EACH ROW EXECUTE FUNCTION public.enforce_schedule_freeze();

-- 2) Manuellen Override entfernen: RPC + Spalte (Mig 100 rueckgebaut).
DROP FUNCTION IF EXISTS public.admin_set_employee_freeze(uuid, int);

ALTER TABLE public.employees
  DROP COLUMN IF EXISTS schedule_freeze_weeks;
