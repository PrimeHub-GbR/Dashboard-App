-- Migration 100
-- Planungssperre pro Mitarbeiter (Override).
--   Bisher (Mig 081): globale Sperre "laufende + naechste Woche" (fest 2 Wochen).
--   Neu: pro Mitarbeiter konfigurierbarer Sperr-Horizont in Wochen.
--     employees.schedule_freeze_weeks:
--       NULL = Standardverhalten (2 Wochen, wie bisher)
--       0    = keine Sperre (Mitarbeiter darf jede Woche bearbeiten)
--       n>0  = laufende Woche + (n-1) weitere Wochen sind fixiert
--   RPC admin_set_employee_freeze setzt den Override (is_admin_or_manager-gated).
--   Der Trigger aus Mig 081 wird so angepasst, dass der Override beruecksichtigt wird.

-- 1) Override-Spalte. NULL = Standard (2 Wochen).
ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS schedule_freeze_weeks int;

COMMENT ON COLUMN public.employees.schedule_freeze_weeks IS
  'Override fuer die Planungssperre in Wochen. NULL = Standard (2 Wochen / laufende + naechste). 0 = keine Sperre. n = laufende + (n-1) weitere Wochen fixiert.';

-- 2) Trigger neu: Override statt fester 2 Wochen beruecksichtigen.
CREATE OR REPLACE FUNCTION public.enforce_schedule_freeze()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_this_monday date := current_date - (EXTRACT(ISODOW FROM current_date)::int - 1);
  v_weeks int;
BEGIN
  -- Chef/Manager duerfen immer (laeuft ueber admin_edit_employee_day).
  IF public.is_chef() THEN RETURN NEW; END IF;

  -- Override des betroffenen Mitarbeiters lesen. NULL -> Standard 2 Wochen.
  SELECT COALESCE(e.schedule_freeze_weeks, 2) INTO v_weeks
  FROM public.employees e
  WHERE e.id = NEW.employee_id;

  v_weeks := COALESCE(v_weeks, 2);

  -- 0 Wochen -> keine Sperre.
  IF v_weeks <= 0 THEN RETURN NEW; END IF;

  -- Laufende + (v_weeks-1) weitere Wochen sind fix: aenderbar erst ab
  -- Montag + v_weeks*7. (v_weeks=2 -> Montag+14 = altes Verhalten.)
  IF NEW.week_start < v_this_monday + (v_weeks * 7) THEN
    RAISE EXCEPTION 'Diese Woche ist fixiert. Kurzfristige Aenderungen bitte direkt mit dem Chef absprechen.';
  END IF;
  RETURN NEW;
END; $$;

-- Trigger neu anlegen (idempotent).
DROP TRIGGER IF EXISTS trg_enforce_schedule_freeze ON public.employee_schedule_requests;
CREATE TRIGGER trg_enforce_schedule_freeze
  BEFORE INSERT OR UPDATE ON public.employee_schedule_requests
  FOR EACH ROW EXECUTE FUNCTION public.enforce_schedule_freeze();

-- 3) RPC: Override pro Mitarbeiter setzen (nur Admin/Manager).
--    p_weeks NULL -> Standard; 0 -> keine Sperre; n>0 -> n Wochen.
CREATE OR REPLACE FUNCTION public.admin_set_employee_freeze(
  p_employee_id uuid,
  p_weeks int
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF NOT public.is_admin_or_manager() THEN
    RAISE EXCEPTION 'Nur Geschaeftsfuehrung/Manager duerfen die Planungssperre aendern.';
  END IF;
  IF p_weeks IS NOT NULL AND p_weeks < 0 THEN
    RAISE EXCEPTION 'Sperr-Wochen duerfen nicht negativ sein.';
  END IF;

  UPDATE public.employees
  SET schedule_freeze_weeks = p_weeks
  WHERE id = p_employee_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Mitarbeiter nicht gefunden.';
  END IF;
END; $$;

GRANT EXECUTE ON FUNCTION public.admin_set_employee_freeze(uuid, int) TO authenticated;
