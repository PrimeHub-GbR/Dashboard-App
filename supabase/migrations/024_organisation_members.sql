-- Migration 024: Organisation Members (Organigramm)
-- Feature: Organisation Tab — Hierarchie + Stammdaten

CREATE TABLE org_members (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name       TEXT NOT NULL,
  last_name        TEXT NOT NULL,
  position         TEXT NOT NULL CHECK (position IN ('geschaeftsfuehrer', 'manager', 'mitarbeiter')),
  reports_to       UUID REFERENCES org_members(id) ON DELETE SET NULL,
  birth_date       DATE,
  work_address     TEXT,
  home_address     TEXT,
  auth_user_id     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  display_order    INTEGER NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_org_members_position   ON org_members(position);
CREATE INDEX idx_org_members_reports_to ON org_members(reports_to);

ALTER TABLE org_members ENABLE ROW LEVEL SECURITY;

-- SELECT: alle authentifizierten Nutzer dürfen lesen
CREATE POLICY "org_members_select"
  ON org_members FOR SELECT
  USING (auth.role() = 'authenticated');

-- INSERT/UPDATE/DELETE: nur über Service Role Key (Backend übernimmt Berechtigungslogik)

-- Seed: Geschäftsführer (reports_to = NULL)
INSERT INTO org_members (first_name, last_name, position, display_order)
VALUES
  ('Mohammed', 'Ozdorf',       'geschaeftsfuehrer', 0),
  ('Seydi Çetin', 'Taya',      'geschaeftsfuehrer', 1);

-- Seed: Manager (reports_to = erster GF, wird nach Insert gesetzt)
DO $$
DECLARE
  gf_id UUID;
BEGIN
  SELECT id INTO gf_id FROM org_members WHERE last_name = 'Ozdorf' LIMIT 1;
  INSERT INTO org_members (first_name, last_name, position, reports_to, display_order)
  VALUES ('Mikhail', 'Bataev', 'manager', gf_id, 0);
END $$;
