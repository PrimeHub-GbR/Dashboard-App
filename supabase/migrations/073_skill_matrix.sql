-- Migration 073: Skill-Matrix
-- Kompetenz-Matrix: welcher Mitarbeiter/Chef/Manager welche Arbeit beherrscht,
-- gerade lernt oder noch nicht kann. 3-Stufen-Modell.
--
-- Stufen (status):
--   'kann'  = beherrscht die Arbeit
--   'lernt' = gerade in Einarbeitung
--   (keine Zeile) = kann (noch) nicht
--
-- Sichtbarkeit: alle authentifizierten Nutzer sehen die komplette Matrix.
-- Bearbeitung: nur Chef/Admin + Manager (erzwungen in den API-Routes via
-- Service-Role nach Rollencheck — analog zu /api/organisation).

-- ---------------------------------------------------------------------------
-- 1. Skill-Katalog
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.skills (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  category    TEXT NOT NULL DEFAULT 'Sonstiges',
  sort_order  INTEGER NOT NULL DEFAULT 0,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (name)
);

-- ---------------------------------------------------------------------------
-- 2. Mitarbeiter-Skill-Zuordnung
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.employee_skills (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id  UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  skill_id     UUID NOT NULL REFERENCES public.skills(id)    ON DELETE CASCADE,
  status       TEXT NOT NULL DEFAULT 'kann' CHECK (status IN ('kann', 'lernt')),
  updated_by   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (employee_id, skill_id)
);

CREATE INDEX IF NOT EXISTS idx_employee_skills_employee ON public.employee_skills(employee_id);
CREATE INDEX IF NOT EXISTS idx_employee_skills_skill    ON public.employee_skills(skill_id);

-- ---------------------------------------------------------------------------
-- 3. RLS — alle dürfen lesen, Schreiben nur über Service-Role (API)
-- ---------------------------------------------------------------------------
ALTER TABLE public.skills          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_skills ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "skills_select_all" ON public.skills;
CREATE POLICY "skills_select_all" ON public.skills
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "employee_skills_select_all" ON public.employee_skills;
CREATE POLICY "employee_skills_select_all" ON public.employee_skills
  FOR SELECT TO authenticated USING (true);

-- Keine INSERT/UPDATE/DELETE-Policies → Schreiben ausschließlich via
-- Service-Role-Key in den API-Routes (nach Admin/Manager-Rollencheck).

-- ---------------------------------------------------------------------------
-- 4. updated_at automatisch pflegen
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_skills_touch ON public.skills;
CREATE TRIGGER trg_skills_touch
  BEFORE UPDATE ON public.skills
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- 5. Seed der aktuellen Skills (idempotent)
-- ---------------------------------------------------------------------------
INSERT INTO public.skills (name, category, sort_order) VALUES
  ('Versandaufträge erstellen',                  'Versand',   10),

  ('Bücher schleifen',                           'Bücher',    20),
  ('Bücher schneiden',                           'Bücher',    21),
  ('Bücher folieren',                            'Bücher',    22),

  ('Kosmetik folieren',                          'Kosmetik',  30),

  ('3D CAD konstruieren',                        '3D-Druck',  40),
  ('3D Filament wechseln',                       '3D-Druck',  41),
  ('3D Drucker bedienen',                        '3D-Druck',  42),
  ('3D Druckaufträge starten',                   '3D-Druck',  43),
  ('3D Produktverpackung',                       '3D-Druck',  44),

  ('Kerze Betongießen',                          'Kerzen',    50),
  ('Kerze Wachsgießen',                          'Kerzen',    51),
  ('Kerze Produktveredelung und Versiegelung',   'Kerzen',    52),
  ('Kerze Produktverpackung',                    'Kerzen',    53),

  ('Warenannahme',                               'Lager',     60),
  ('Warenabgabe',                                'Lager',     61),

  ('Führerschein Klasse B',                      'Sonstiges', 70)
ON CONFLICT (name) DO NOTHING;
