-- Migration: Cover-Bestand der PlentyONE-Migration
-- Feature: features/plentyone/overview.md
--
-- Eine Zeile je ISBN: wann das Cover aus der VLB geladen wurde, in welchem
-- ZIP-Paket es liegt und ob es schon im PlentyONE-Dateimanager ist. Kuenftige
-- Laeufe laden nur Cover, die hier nicht mit status='ok' stehen. Die ZIPs
-- liegen run-unabhaengig unter workflow-results/plentyone/cover/ und werden
-- von der Lauf-Retention nicht geloescht.

CREATE TABLE IF NOT EXISTS plentyone_cover (
  isbn                  TEXT PRIMARY KEY CHECK (isbn ~ '^[0-9]{13}$'),
  titel                 TEXT,
  status                TEXT NOT NULL CHECK (status IN ('ok', 'fehlt')),
  grund                 TEXT,
  paket                 TEXT,
  paket_pfad            TEXT,
  run_id                UUID REFERENCES plentyone_runs(id) ON DELETE SET NULL,
  geladen_am            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  plenty_hochgeladen_am TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_plentyone_cover_run_id     ON plentyone_cover (run_id);
CREATE INDEX IF NOT EXISTS idx_plentyone_cover_status     ON plentyone_cover (status);
CREATE INDEX IF NOT EXISTS idx_plentyone_cover_geladen_am ON plentyone_cover (geladen_am DESC);

DROP TRIGGER IF EXISTS plentyone_cover_updated_at ON plentyone_cover;
CREATE TRIGGER plentyone_cover_updated_at
  BEFORE UPDATE ON plentyone_cover
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ---------------------------------------------------------------------------
-- Bekannte Cover als ein Array (PostgREST kappt Listen bei 1000 Zeilen)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION plentyone_cover_bekannt()
RETURNS TEXT[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(array_agg(isbn ORDER BY isbn), ARRAY[]::TEXT[])
  FROM plentyone_cover
  WHERE status = 'ok';
$$;

-- ---------------------------------------------------------------------------
-- Ein fertiges Paket eintragen. p_cover: [{isbn, titel, ok, grund}]
-- Ein vorhandenes 'ok' wird nie auf 'fehlt' zurueckgesetzt - ein VLB-401
-- mitten im Lauf darf den Bestand nicht loeschen.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION plentyone_cover_melden(
  p_run        UUID,
  p_paket      TEXT,
  p_paket_pfad TEXT,
  p_cover      JSONB
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n INTEGER;
BEGIN
  WITH eingang AS (
    SELECT
      c->>'isbn'                                   AS isbn,
      NULLIF(c->>'titel', '')                      AS titel,
      CASE WHEN (c->>'ok')::BOOLEAN THEN 'ok' ELSE 'fehlt' END AS status,
      NULLIF(c->>'grund', '')                      AS grund
    FROM jsonb_array_elements(p_cover) AS c
    WHERE c->>'isbn' ~ '^[0-9]{13}$'
  ),
  geschrieben AS (
    INSERT INTO plentyone_cover (isbn, titel, status, grund, paket, paket_pfad, run_id, geladen_am)
    SELECT isbn, titel, status, grund,
           CASE WHEN status = 'ok' THEN p_paket      END,
           CASE WHEN status = 'ok' THEN p_paket_pfad END,
           p_run, NOW()
    FROM eingang
    ON CONFLICT (isbn) DO UPDATE SET
      titel      = COALESCE(EXCLUDED.titel, plentyone_cover.titel),
      status     = EXCLUDED.status,
      grund      = EXCLUDED.grund,
      paket      = EXCLUDED.paket,
      paket_pfad = EXCLUDED.paket_pfad,
      run_id     = EXCLUDED.run_id,
      geladen_am = EXCLUDED.geladen_am,
      -- neu geladen = noch nicht wieder in PlentyONE
      plenty_hochgeladen_am = CASE WHEN EXCLUDED.status = 'ok' THEN NULL
                                   ELSE plentyone_cover.plenty_hochgeladen_am END
    WHERE EXCLUDED.status = 'ok' OR plentyone_cover.status <> 'ok'
    RETURNING 1
  )
  SELECT COUNT(*) INTO n FROM geschrieben;
  RETURN n;
END;
$$;

-- ---------------------------------------------------------------------------
-- RLS: lesen duerfen admin und manager, schreiben nur der Service-Role-Key
-- ---------------------------------------------------------------------------
ALTER TABLE plentyone_cover ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS plentyone_cover_select ON plentyone_cover;
CREATE POLICY plentyone_cover_select
  ON plentyone_cover FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role IN ('admin', 'manager')
    )
  );

-- ---------------------------------------------------------------------------
-- Zaehler fuer die Kopfzeile des Bestands
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION plentyone_cover_zaehler()
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'ok',          COUNT(*) FILTER (WHERE status = 'ok'),
    'fehlt',       COUNT(*) FILTER (WHERE status = 'fehlt'),
    'hochgeladen', COUNT(*) FILTER (WHERE status = 'ok' AND plenty_hochgeladen_am IS NOT NULL)
  )
  FROM plentyone_cover;
$$;
