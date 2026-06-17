-- Migration 099: WhatsApp-Vorlage für Aufgaben-Eskalation.
--
-- Wird vom Eskalations-Button (App, nur Chef/Manager) genutzt, um einen
-- Mitarbeiter bei überfälliger Aufgabe seriös + auffordernd anzuschreiben.
-- Status LOCAL_PENDING → muss in der Vorlagen-UI bei Meta eingereicht/genehmigt
-- werden, bevor der Versand außerhalb des 24h-Fensters funktioniert.
-- {{1}} = Vorname, {{2}} = Aufgabentitel.

INSERT INTO public.whatsapp_templates
  (name, display_name, category, language, body_text, variables_count, example_values, status)
VALUES (
  'aufgabe_eskalation',
  'Aufgabe — Eskalation (überfällig)',
  'UTILITY',
  'de',
  E'🔴 ESKALATION – Aufgabe überfällig\n\nHallo {{1}}, deine Aufgabe »{{2}}« ist überfällig.\n\nDiese Nachricht wurde vom Management ausgelöst und ist eine verbindliche Aufforderung, die Aufgabe jetzt zu bearbeiten, abzulehnen oder mit einem Kommentar zu verschieben.\n\nBitte reagiere umgehend in der PrimeHub-App.',
  2,
  '["Max", "Regale auffüllen"]'::jsonb,
  'LOCAL_PENDING'
)
ON CONFLICT (name) DO NOTHING;
