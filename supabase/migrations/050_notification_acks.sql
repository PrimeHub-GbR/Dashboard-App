-- Migration 050: Generischer Bestätigungs-Speicher für das Notification-Center
--
-- Das Notification-Center aggregiert Meldungen aus mehreren Quellen (Profil-
-- Änderungen, Zeiterfassungs-Review-Fälle, Überstunden). Manche Meldungen
-- lösen sich automatisch auf (z. B. wenn ein offener Zeiteintrag korrigiert
-- wird). Andere muss der Admin/Manager aktiv "zur Kenntnis nehmen".
--
-- Diese Tabelle speichert solche expliziten Bestätigungen für Meldungs-Typen,
-- die KEINE eigene Bestätigungs-Spalte haben (Überstunden, dismisste Stale-
-- Einträge). Profil-Änderungen nutzen weiterhin employee_profile_changes.
-- acknowledged_at; needs_review-Fälle nutzen time_entries.needs_review.
--
-- Der Schlüssel `notif_key` ist stabil pro Meldung, z. B.:
--   overtime:<employee_id>:<YYYY-MM>
--   ztstale:<time_entry_id>

CREATE TABLE IF NOT EXISTS public.notification_acks (
  notif_key       TEXT PRIMARY KEY,
  acknowledged_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  acknowledged_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

ALTER TABLE public.notification_acks ENABLE ROW LEVEL SECURITY;

-- Admin/Manager liest alle Bestätigungen
CREATE POLICY "nack_select_role"
  ON public.notification_acks
  FOR SELECT TO authenticated
  USING (public.is_admin_or_manager());

-- Schreiben ausschliesslich über Service-Role (API gated per Rollencheck)
CREATE POLICY "nack_write_service"
  ON public.notification_acks
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

COMMENT ON TABLE public.notification_acks IS
  'Explizite "zur Kenntnis genommen"-Bestätigungen des Notification-Centers für Meldungs-Typen ohne eigene Ack-Spalte (Überstunden, dismisste Stale-Zeiteinträge).';
