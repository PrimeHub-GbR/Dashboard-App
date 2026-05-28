-- Migration 037: Vergessene Abmeldung / 10h-Überschreitung
--
-- Wenn ein Mitarbeiter vergisst auszustempeln, lief die Buchung bisher weiter und wurde beim
-- nächsten Login auf "jetzt" ausgestempelt → absurde Stundenzahlen. Künftig wird ein solcher
-- Eintrag erkannt (live), nur vorgemerkt (zählt nicht, da offen) und vom Mitarbeiter am Kiosk
-- nachgetragen. needs_review markiert nachgetragene/kontrollbedürftige Einträge für den Admin.
--
-- Hinweis: corrected_by bleibt beim Kiosk-Self-Service NULL (= vom Mitarbeiter nachgetragen),
-- unterscheidbar von einer Admin-Korrektur (dort wird corrected_by gesetzt).

ALTER TABLE time_entries
  ADD COLUMN needs_review BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX idx_time_entries_needs_review
  ON time_entries (employee_id) WHERE needs_review = true;

-- Maximale Schichtdauer (Stunden), ab der eine offene Buchung als "vergessene Abmeldung" gilt.
-- Eigene Einstellung — overtime_threshold_hours ist bereits für monatliche Überstunden belegt.
ALTER TABLE time_tracking_settings
  ADD COLUMN max_shift_hours NUMERIC(4,2) NOT NULL DEFAULT 10.0;
