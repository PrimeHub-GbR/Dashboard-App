-- Migration 026: org_members mit employees zusammenführen
-- org_members Tabelle löschen, employees um Org-Spalten erweitern

-- 1. org_members entfernen (Daten wurden dort nur temporär geseeded)
DROP TABLE IF EXISTS org_members CASCADE;

-- 2. employees erweitern
ALTER TABLE employees
  ADD COLUMN position      TEXT NOT NULL DEFAULT 'mitarbeiter'
    CHECK (position IN ('geschaeftsfuehrer', 'manager', 'mitarbeiter')),
  ADD COLUMN reports_to    UUID REFERENCES employees(id) ON DELETE SET NULL,
  ADD COLUMN birth_date    DATE,
  ADD COLUMN work_address  TEXT,
  ADD COLUMN home_address  TEXT,
  ADD COLUMN auth_user_id  UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- 3. pin nullable machen (Geschäftsführer haben keine Kiosk-PIN)
ALTER TABLE employees ALTER COLUMN pin DROP NOT NULL;

-- 4. Index für schnelle Hierarchie-Abfragen
CREATE INDEX idx_employees_position   ON employees(position);
CREATE INDEX idx_employees_reports_to ON employees(reports_to);

-- 5. Seed: Geschäftsführer (is_active=false → erscheinen NICHT im Kiosk)
INSERT INTO employees (name, position, is_active, color, target_hours_per_month, weekly_schedule)
VALUES
  ('Mohammed Ozdorf',   'geschaeftsfuehrer', false, '#f59e0b', 0,
   '{"mon":0,"tue":0,"wed":0,"thu":0,"fri":0,"sat":0,"sun":0}'),
  ('Seydi Çetin Taya', 'geschaeftsfuehrer', false, '#8b5cf6', 0,
   '{"mon":0,"tue":0,"wed":0,"thu":0,"fri":0,"sat":0,"sun":0}');

-- 6. Seed: Manager (is_active=true → erscheint im Kiosk, PIN wird nachträglich gesetzt)
DO $$
DECLARE
  gf_id UUID;
BEGIN
  SELECT id INTO gf_id FROM employees WHERE name = 'Mohammed Ozdorf' LIMIT 1;
  INSERT INTO employees (name, position, is_active, color, target_hours_per_month, weekly_schedule, reports_to)
  VALUES (
    'Mikhail Bataev', 'manager', true, '#3b82f6', 160,
    '{"mon":8,"tue":8,"wed":8,"thu":8,"fri":8,"sat":0,"sun":0}',
    gf_id
  );
END $$;
