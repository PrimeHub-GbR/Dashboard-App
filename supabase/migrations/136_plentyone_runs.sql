-- Migration: PlentyONE-Migrationslaeufe
-- Feature: features/plentyone/overview.md
--
-- Ein Lauf = ein Amazon-Export, der durch zwei parallele N8N-Workflows geschickt wird:
--   Strang "csv"   -> plentyONE_Import_final.csv
--   Strang "cover" -> ZIP-Pakete a 250 Cover
-- Es werden hoechstens 3 Laeufe aufbewahrt.

CREATE TABLE IF NOT EXISTS plentyone_runs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Eingabe
  input_path      TEXT NOT NULL,
  input_name      TEXT NOT NULL,
  zeilen_limit    INTEGER,

  -- Gesamtstatus: running | success | partial | failed
  status          TEXT NOT NULL DEFAULT 'running',

  -- Strang 1: Metadaten-CSV
  csv_status      TEXT NOT NULL DEFAULT 'running',
  csv_path        TEXT,
  csv_error       TEXT,

  -- Strang 2: Cover
  cover_status    TEXT NOT NULL DEFAULT 'running',
  cover_error     TEXT,
  cover_pakete    JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- Auswertung fuer die Anzeige
  stats           JSONB NOT NULL DEFAULT '{}'::jsonb,
  hinweise        JSONB NOT NULL DEFAULT '[]'::jsonb,
  hinweise_gesamt INTEGER NOT NULL DEFAULT 0,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT plentyone_runs_status_chk
    CHECK (status IN ('running', 'success', 'partial', 'failed')),
  CONSTRAINT plentyone_runs_csv_status_chk
    CHECK (csv_status IN ('running', 'success', 'failed')),
  CONSTRAINT plentyone_runs_cover_status_chk
    CHECK (cover_status IN ('running', 'success', 'failed'))
);

CREATE INDEX IF NOT EXISTS idx_plentyone_runs_created_at
  ON plentyone_runs (created_at DESC);

DROP TRIGGER IF EXISTS plentyone_runs_updated_at ON plentyone_runs;
CREATE TRIGGER plentyone_runs_updated_at
  BEFORE UPDATE ON plentyone_runs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ---------------------------------------------------------------------------
-- Gesamtstatus aus den beiden Straengen ableiten
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION plentyone_run_gesamtstatus()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.csv_status = 'running' OR NEW.cover_status = 'running' THEN
    NEW.status := 'running';
  ELSIF NEW.csv_status = 'success' AND NEW.cover_status = 'success' THEN
    NEW.status := 'success';
  ELSIF NEW.csv_status = 'failed' AND NEW.cover_status = 'failed' THEN
    NEW.status := 'failed';
  ELSE
    NEW.status := 'partial';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS plentyone_runs_status_sync ON plentyone_runs;
CREATE TRIGGER plentyone_runs_status_sync
  BEFORE INSERT OR UPDATE OF csv_status, cover_status ON plentyone_runs
  FOR EACH ROW EXECUTE FUNCTION plentyone_run_gesamtstatus();

-- ---------------------------------------------------------------------------
-- Laeuft ein Lauf noch? Die VLB erlaubt nur 2 Sessions - ein Lauf belegt beide,
-- ein zweiter parallel gestarteter Lauf wuerde mit HTTP 401 abbrechen.
-- Laeufe aelter als 2 Stunden gelten als verwaist und blockieren nicht mehr.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION plentyone_lauf_aktiv()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM plentyone_runs
    WHERE status = 'running'
      AND created_at > NOW() - INTERVAL '2 hours'
  );
$$;

-- ---------------------------------------------------------------------------
-- Aufbewahrung: nur die 3 neuesten Laeufe. Gibt die Storage-Pfade der
-- geloeschten Laeufe zurueck, damit die API die Dateien mit aufraeumen kann.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION plentyone_retention(behalten INTEGER DEFAULT 3)
RETURNS TABLE (geloescht UUID, input_path TEXT, csv_path TEXT, cover_pakete JSONB)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH alt AS (
    SELECT r.id FROM plentyone_runs r
    ORDER BY r.created_at DESC
    OFFSET GREATEST(behalten, 0)
  )
  DELETE FROM plentyone_runs d
  USING alt
  WHERE d.id = alt.id
  RETURNING d.id, d.input_path, d.csv_path, d.cover_pakete;
END;
$$;

-- ---------------------------------------------------------------------------
-- RLS: lesen duerfen admin und manager, schreiben nur der Service-Role-Key
-- ---------------------------------------------------------------------------
ALTER TABLE plentyone_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS plentyone_runs_select ON plentyone_runs;
CREATE POLICY plentyone_runs_select
  ON plentyone_runs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role IN ('admin', 'manager')
    )
  );

-- INSERT/UPDATE/DELETE laufen ausschliesslich ueber die API mit dem
-- Service-Role-Key (umgeht RLS). Bewusst keine Policy dafuer.

COMMENT ON TABLE plentyone_runs IS
  'Migrationslaeufe Amazon -> PlentyONE. Max. 3 Stueck, siehe plentyone_retention().';
