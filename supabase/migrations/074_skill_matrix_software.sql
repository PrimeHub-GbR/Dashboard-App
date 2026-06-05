-- Migration 074: Skill-Matrix — Kategorie "Software"
-- Fügt eine neue Kategorie mit gängigen Software-Tools hinzu (idempotent).

INSERT INTO public.skills (name, category, sort_order) VALUES
  ('Seller Central', 'Software', 80),
  ('Fusion 360',     'Software', 81),
  ('Bambu Studio',   'Software', 82)
ON CONFLICT (name) DO NOTHING;
