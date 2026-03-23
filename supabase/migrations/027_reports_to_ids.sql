-- Migration 027: reports_to_ids Array für mehrere Vorgesetzte
-- Mikhail Bataev reportet zu beiden Geschäftsführern

ALTER TABLE employees ADD COLUMN reports_to_ids UUID[] NOT NULL DEFAULT '{}';

-- Bestehende reports_to Werte in Array migrieren
UPDATE employees SET reports_to_ids = ARRAY[reports_to] WHERE reports_to IS NOT NULL;

-- Mikhail Bataev: reportet zu beiden GFs
DO $$
DECLARE
  mikhail_id UUID;
  gf1_id     UUID;
  gf2_id     UUID;
BEGIN
  SELECT id INTO mikhail_id FROM employees WHERE name = 'Mikhail Bataev' LIMIT 1;
  SELECT id INTO gf1_id     FROM employees WHERE name = 'Mohammed Ozdorf' LIMIT 1;
  SELECT id INTO gf2_id     FROM employees WHERE name ILIKE '%Taya%' LIMIT 1;

  IF mikhail_id IS NOT NULL AND gf1_id IS NOT NULL AND gf2_id IS NOT NULL THEN
    UPDATE employees
    SET reports_to_ids = ARRAY[gf1_id, gf2_id]
    WHERE id = mikhail_id;
  END IF;
END $$;
