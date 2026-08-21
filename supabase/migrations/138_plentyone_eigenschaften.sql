-- Migration: Eigenschaften-CSV als zweite Ausgabe des CSV-Strangs
-- Feature: features/plentyone/overview.md
--
-- PlentyONE transportiert je Import-Zeile genau EINE Eigenschaft (ID + Wert bzw.
-- Auswahl-ID). Mehrere Spalten auf "Eigenschaften >> Wert" zu mappen ist deshalb
-- nicht moeglich -> eigene Datei mit einer Zeile je Artikel und Eigenschaft.
ALTER TABLE plentyone_runs ADD COLUMN IF NOT EXISTS eigenschaften_path TEXT;
