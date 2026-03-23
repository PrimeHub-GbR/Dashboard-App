-- Migration 022: Wochenplan pro Mitarbeiter für Soll-Kurve im Dashboard

ALTER TABLE employees
ADD COLUMN weekly_schedule JSONB NOT NULL DEFAULT '{"mon":8,"tue":8,"wed":8,"thu":8,"fri":8,"sat":0,"sun":0}'::jsonb;

COMMENT ON COLUMN employees.weekly_schedule IS
  'Geplante Arbeitsstunden pro Wochentag. Keys: mon,tue,wed,thu,fri,sat,sun. Werte in Stunden (z.B. 8.0).
   Wird für die Soll-Kurve im Dashboard-Chart verwendet.';
