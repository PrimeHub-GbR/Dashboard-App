-- Migration 119: WhatsApp-Vorlage gf_frist_erinnerung (bei Meta eingereicht).
-- Meta-Template-ID: 1282375937021440 (Status PENDING zum Zeitpunkt der Einreichung).
INSERT INTO public.whatsapp_templates
  (name, display_name, category, language, body_text, variables_count,
   example_values, status, meta_template_id)
SELECT
  'gf_frist_erinnerung',
  'GF-Frist Erinnerung',
  'UTILITY', 'de',
  'Erinnerung: {{1}} ist in {{2}} Tagen fällig (Stichtag {{3}}). Bitte erledigen.',
  3,
  '["USt-Voranmeldung","5","10.07.2026"]'::jsonb,
  'PENDING',
  '1282375937021440'
WHERE NOT EXISTS (
  SELECT 1 FROM public.whatsapp_templates WHERE name = 'gf_frist_erinnerung');
