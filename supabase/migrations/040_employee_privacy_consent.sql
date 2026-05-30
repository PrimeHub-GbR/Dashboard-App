-- Migration 040: DSGVO-Bestätigung beim ersten Portal-Login
--
-- Zweck: Wenn ein Mitarbeitender das Mitarbeiter-Portal (PWA, /portal)
-- zum ersten Mal nutzt, muss die Datenschutzerklärung bestätigt werden.
-- Wir merken uns den Zeitpunkt der Zustimmung pro Mitarbeitendem.
--
-- Verhalten:
-- - NULL  → noch nie zugestimmt → Frontend zeigt Datenschutz-Dialog beim Login
-- - Datum → bereits zugestimmt → kein Dialog mehr
--
-- Hinweis: Bei späterer Änderung der Datenschutzerklärung kann die Spalte
-- zurückgesetzt werden (UPDATE employees SET privacy_accepted_at = NULL), um
-- alle Mitarbeitenden zur erneuten Zustimmung aufzufordern.

ALTER TABLE employees
  ADD COLUMN privacy_accepted_at TIMESTAMPTZ;

COMMENT ON COLUMN employees.privacy_accepted_at IS
  'Zeitpunkt der Zustimmung zur Portal-Datenschutzerklärung. NULL = noch nicht zugestimmt.';
