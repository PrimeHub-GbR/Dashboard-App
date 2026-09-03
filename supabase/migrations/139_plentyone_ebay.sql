-- Migration: eBay-Vollautomatisierung ueber PlentyONE
-- Feature: features/plentyone/ebay-vollautomatisierung.md
--
-- Zwei Bausteine:
--   1) Export-Fenster je Lauf  - PlentyONE holt die CSVs selbst per URL ab. Ohne Fenster
--      wuerde ein naechtlicher Zeitplan dieselbe alte CSV immer wieder einspielen und
--      gepflegte PlentyONE-Daten ueberschreiben. Ausserhalb des Fensters liefert die
--      Route nur noch die Kopfzeile -> der Import ist ein No-Op.
--   2) Statusberichte der eBay-Kette (verified-Pruefung + Preis-Guard aus n8n).

-- ---------------------------------------------------------------------------
-- 1) Export-Fenster
-- ---------------------------------------------------------------------------
ALTER TABLE plentyone_runs
  ADD COLUMN IF NOT EXISTS export_freigabe BOOLEAN     NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS export_abrufe   INTEGER     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS export_zuletzt  TIMESTAMPTZ;

COMMENT ON COLUMN plentyone_runs.export_freigabe IS
  'Solange true und der Lauf juenger als 7 Tage ist, liefert /api/plentyone/export die Daten aus.';

-- Zaehlt einen Abruf mit. Atomar, damit parallele Zeitplaene nicht gegeneinander zaehlen.
CREATE OR REPLACE FUNCTION plentyone_export_quittieren(lauf UUID)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE plentyone_runs
     SET export_abrufe = export_abrufe + 1,
         export_zuletzt = NOW()
   WHERE id = lauf;
$$;

-- ---------------------------------------------------------------------------
-- 2) Statusberichte der eBay-Kette
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS plentyone_ebay_berichte (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  erstellt_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- true = Pruefung vollstaendig gruen und kein Listing ohne Buchpreisbindungspreis
  ok            BOOLEAN NOT NULL DEFAULT FALSE,

  -- {artikel, ohne_listing, listings, geprueft_ok, geprueft_fehler, merkmale, ohne_bpb_preis}
  zahlen        JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- [{mlid, item_id, titel, grund}] - Pruefung fehlgeschlagen
  probleme      JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- [{mlid, item_id, titel, grund}] - bewusst nicht erzeugt (Autor/Titel/Preis fehlt)
  uebersprungen JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- Klartext-Zusammenfassung aus n8n, wird unveraendert angezeigt
  text          TEXT
);

CREATE INDEX IF NOT EXISTS idx_plentyone_ebay_berichte_erstellt
  ON plentyone_ebay_berichte (erstellt_at DESC);

-- Aufbewahrung: die letzten 20 Berichte reichen fuer den Verlauf.
CREATE OR REPLACE FUNCTION plentyone_ebay_berichte_retention()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM plentyone_ebay_berichte
   WHERE id IN (
     SELECT id FROM plentyone_ebay_berichte
      ORDER BY erstellt_at DESC
      OFFSET 20
   );
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS plentyone_ebay_berichte_aufraeumen ON plentyone_ebay_berichte;
CREATE TRIGGER plentyone_ebay_berichte_aufraeumen
  AFTER INSERT ON plentyone_ebay_berichte
  FOR EACH STATEMENT EXECUTE FUNCTION plentyone_ebay_berichte_retention();

-- ---------------------------------------------------------------------------
-- RLS: lesen duerfen admin und manager, schreiben nur der Service-Role-Key
-- ---------------------------------------------------------------------------
ALTER TABLE plentyone_ebay_berichte ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS plentyone_ebay_berichte_select ON plentyone_ebay_berichte;
CREATE POLICY plentyone_ebay_berichte_select
  ON plentyone_ebay_berichte FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role IN ('admin', 'manager')
    )
  );

COMMENT ON TABLE plentyone_ebay_berichte IS
  'Statusberichte der eBay-Kette aus n8n. Max. 20 Stueck, siehe plentyone_ebay_berichte_retention().';
