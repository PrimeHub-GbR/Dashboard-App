-- Migration: feste Hersteller-IDs fuer PlentyONE
-- Feature: features/plentyone/overview.md
--
-- Ohne feste IDs vergibt PlentyONE selbst (belegt am 07.09.2026: Piper wurde 5
-- statt 4). Dann weiss ein spaeterer Lauf nicht mehr, welcher Verlag welche ID
-- hat - und gleicht der Import ueber die ID ab, legt er beim zweiten Mal alles
-- doppelt an.
--
-- Der Migrationslauf ist zustandslos, deshalb liegt die Zuordnung hier. Ein
-- Verlag behaelt seine ID fuer immer; neue Verlage bekommen die naechste freie.
-- Ohne diese Tabelle wuerde jede Sortimentserweiterung alle bestehenden IDs
-- verschieben, weil alphabetisch neu durchnummeriert wuerde.
--
-- IDs 1-3 sind in PlentyONE von anderen Herstellern belegt (Exclusive Leather,
-- A & C Design, PrimeStone) - deshalb faengt die Vergabe bei 4 an.
CREATE TABLE IF NOT EXISTS plentyone_hersteller_ids (
  name       TEXT PRIMARY KEY,
  plenty_id  INTEGER NOT NULL UNIQUE CHECK (plenty_id >= 4),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE plentyone_hersteller_ids IS
  'Verlag -> feste PlentyONE-Hersteller-ID. Einmal vergeben, nie geaendert.';

ALTER TABLE plentyone_hersteller_ids ENABLE ROW LEVEL SECURITY;

-- Lesen duerfen angemeldete Nutzer; geschrieben wird ausschliesslich vom
-- N8N-Lauf ueber den Service-Key, der RLS ohnehin umgeht.
DROP POLICY IF EXISTS "hersteller_ids_lesen" ON plentyone_hersteller_ids;
CREATE POLICY "hersteller_ids_lesen" ON plentyone_hersteller_ids
  FOR SELECT TO authenticated USING (true);
