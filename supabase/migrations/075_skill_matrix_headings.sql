-- Migration 075: Skill-Matrix Neustrukturierung
-- Jede Überschrift wird zu einem einzelnen, bewertbaren Skill (name = category,
-- damit die UI sie als flache Zeile ohne separate Gruppen-Überschrift rendert).
-- "Software" bleibt eine Kategorie mit mehreren Unterpunkten.
-- Alle alten Detail-Skills + deren Bewertungen werden gelöscht (CASCADE).

-- 1. Alle operativen Skills entfernen (alles außer der Software-Kategorie)
DELETE FROM public.skills WHERE category <> 'Software';

-- 2. Neue Einzel-Skills anlegen (name == category → flache Zeile in der UI)
INSERT INTO public.skills (name, category, sort_order) VALUES
  ('Listing & Warenanmeldung Amazon', 'Listing & Warenanmeldung Amazon', 10),
  ('Bücher',                          'Bücher',                          20),
  ('Kosmetik',                        'Kosmetik',                        30),
  ('3D-Druck',                        '3D-Druck',                        40),
  ('Kerzen',                          'Kerzen',                          50),
  ('Lager',                           'Lager',                           60),
  ('Führerschein Klasse B',           'Führerschein Klasse B',           70)
ON CONFLICT (name) DO NOTHING;

-- 3. Software-Reihenfolge fixieren (bleibt Gruppe mit Unterpunkten)
UPDATE public.skills SET sort_order = 80 WHERE name = 'Seller Central';
UPDATE public.skills SET sort_order = 81 WHERE name = 'Fusion 360';
UPDATE public.skills SET sort_order = 82 WHERE name = 'Bambu Studio';
