-- Migration: Straenge eines PlentyONE-Laufs einzeln startbar
-- Feature: features/plentyone/overview.md
--
-- Bisher starteten CSV- und Cover-Strang immer gemeinsam. Der Cover-Strang
-- braucht bei 2.000 Titeln Stunden, die CSV fuenf Minuten - und ein Fehler in
-- einem Strang zwang zum Neustart beider. Neuer Strang-Status "pending":
-- der Strang wurde fuer diesen Lauf (noch) nicht angestossen.

ALTER TABLE plentyone_runs DROP CONSTRAINT IF EXISTS plentyone_runs_csv_status_chk;
ALTER TABLE plentyone_runs ADD CONSTRAINT plentyone_runs_csv_status_chk
  CHECK (csv_status IN ('pending', 'running', 'success', 'failed'));

ALTER TABLE plentyone_runs DROP CONSTRAINT IF EXISTS plentyone_runs_cover_status_chk;
ALTER TABLE plentyone_runs ADD CONSTRAINT plentyone_runs_cover_status_chk
  CHECK (cover_status IN ('pending', 'running', 'success', 'failed'));

-- Gesamtstatus: "pending"-Straenge zaehlen nicht mit. Laeuft einer -> running;
-- sind alle gestarteten fertig -> success/failed/partial wie bisher.
CREATE OR REPLACE FUNCTION plentyone_run_gesamtstatus()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n_running INTEGER := 0;
  n_success INTEGER := 0;
  n_failed  INTEGER := 0;
BEGIN
  IF NEW.csv_status = 'running' THEN n_running := n_running + 1; END IF;
  IF NEW.cover_status = 'running' THEN n_running := n_running + 1; END IF;
  IF NEW.csv_status = 'success' THEN n_success := n_success + 1; END IF;
  IF NEW.cover_status = 'success' THEN n_success := n_success + 1; END IF;
  IF NEW.csv_status = 'failed' THEN n_failed := n_failed + 1; END IF;
  IF NEW.cover_status = 'failed' THEN n_failed := n_failed + 1; END IF;

  IF n_running > 0 THEN
    NEW.status := 'running';
  ELSIF n_failed = 0 THEN
    -- nur Erfolge (oder noch gar nichts gestartet - dann ist der Lauf frisch)
    NEW.status := CASE WHEN n_success > 0 THEN 'success' ELSE 'running' END;
  ELSIF n_success = 0 THEN
    NEW.status := 'failed';
  ELSE
    NEW.status := 'partial';
  END IF;
  RETURN NEW;
END;
$$;
