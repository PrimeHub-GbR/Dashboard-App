-- Migration 034: WhatsApp Kommunikation — message_logs Tabelle
-- Feature: kommunikation/whatsapp

CREATE TABLE message_logs (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at       timestamptz NOT NULL DEFAULT now(),
  sent_by          uuid REFERENCES auth.users(id),
  recipient_id     uuid REFERENCES employees(id),
  recipient_phone  text NOT NULL,
  message_text     text NOT NULL,
  context          text NOT NULL CHECK (context IN ('manual', 'aufgabe', 'zeiterfassung')),
  context_ref_id   uuid,
  status           text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
  error_message    text,
  n8n_triggered_at timestamptz
);

-- Indizes für Performance-relevante Queries
CREATE INDEX idx_message_logs_created_at    ON message_logs (created_at DESC);
CREATE INDEX idx_message_logs_recipient_id  ON message_logs (recipient_id);
CREATE INDEX idx_message_logs_status        ON message_logs (status);
CREATE INDEX idx_message_logs_context       ON message_logs (context);

-- Row Level Security aktivieren
ALTER TABLE message_logs ENABLE ROW LEVEL SECURITY;

-- Admin: sieht und verwaltet alle Einträge
CREATE POLICY "message_logs_admin_all"
  ON message_logs
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid()
        AND role = 'admin'
    )
  );

-- Manager: sieht nur eigene gesendete Nachrichten
CREATE POLICY "message_logs_manager_own"
  ON message_logs
  FOR SELECT
  USING (
    sent_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid()
        AND role IN ('admin', 'manager')
    )
  );
