-- Migration 040: DSGVO-Bestätigung beim ersten Portal-Login
--
-- HINWEIS: Diese Spalte wurde im Rahmen eines Portal-PWA-Versuchs angelegt,
-- der wieder zurückgerollt wurde. Die Spalte bleibt erhalten, weil sie:
-- 1) bereits auf der Prod-DB angewendet ist (additiv, kein Schaden),
-- 2) für die geplante native Flutter-Mitarbeiter-App weiterhin nützlich ist
--    (DSGVO-Zustimmung beim Erst-Login).
--
-- Verhalten:
-- - NULL  → noch nie zugestimmt → künftige App zeigt Datenschutz-Dialog
-- - Datum → bereits zugestimmt

ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS privacy_accepted_at TIMESTAMPTZ;

COMMENT ON COLUMN employees.privacy_accepted_at IS
  'Zeitpunkt der Zustimmung zur Datenschutzerklärung. NULL = noch nicht zugestimmt.';
