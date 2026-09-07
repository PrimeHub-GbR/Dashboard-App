-- Migration: Verlag -> PlentyONE-Hersteller-ID
-- Feature: features/plentyone/overview.md
--
-- Anders als der zurueckgenommene Versuch aus 141 gibt diese Tabelle NICHTS vor:
-- PlentyONE vergibt die IDs selbst, hier stehen sie nur gespiegelt.
--
-- Gebraucht werden sie vom Artikelimport. Dessen Zielfeld "Artikel >>
-- Hersteller-ID" ist numerisch und lehnt den Verlagsnamen ab ("muss eine ganze
-- Zahl sein", 07.09.2026); ein Textfeld fuer den Herstellernamen gibt es nicht.
-- Der Migrationslauf hat keine PlentyONE-Zugaenge und kommt an die IDs nicht
-- heran - der eBay-Bericht schon, der liest /rest/items/manufacturers ohnehin
-- fuer den GPSR-Guard. Er meldet Name und ID mit, das Dashboard schreibt sie
-- hierher, der Migrationslauf liest.
--
-- Damit pflegt sich die Zuordnung selbst: ein neu angelegter Verlag steht nach
-- dem naechsten Bericht drin.
CREATE TABLE IF NOT EXISTS plentyone_hersteller_ids (
  name       TEXT PRIMARY KEY,
  plenty_id  INTEGER NOT NULL,
  gesehen_am TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE plentyone_hersteller_ids IS
  'Spiegel der PlentyONE-Hersteller-IDs. Wird vom eBay-Bericht gepflegt, vom Migrationslauf gelesen.';

ALTER TABLE plentyone_hersteller_ids ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "hersteller_ids_lesen" ON plentyone_hersteller_ids;
CREATE POLICY "hersteller_ids_lesen" ON plentyone_hersteller_ids
  FOR SELECT TO authenticated USING (true);
