-- Migration: Hersteller-CSV als dritte Ausgabe des CSV-Strangs
-- Feature: features/plentyone/overview.md
--
-- PlentyONE fuehrt Hersteller als eigene Stammdaten mit eigenem Import-Typ; der
-- Artikelimport kann sie nur referenzieren, nicht anlegen. Fehlt der Hersteller,
-- bleibt "Artikel >> Hersteller-ID" leer - und ohne Herstellerangabe darf nach
-- Art. 19 GPSR kein Angebot online stehen. Am 07.09.2026 liefen deshalb 50
-- eBay-Listings ohne jede Herstellerangabe, weil diese Datei von Hand gebaut
-- werden musste und schlicht nie gebaut wurde.
ALTER TABLE plentyone_runs ADD COLUMN IF NOT EXISTS hersteller_path TEXT;
