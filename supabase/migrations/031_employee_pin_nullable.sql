-- Migration 031: PIN optional machen (Self-Setup beim ersten Einchecken)
-- Der Mitarbeiter setzt seine eigene PIN beim ersten Kiosk-Besuch.
-- NULL = PIN noch nicht gesetzt → Kiosk zeigt "Neue PIN vergeben"-Flow

ALTER TABLE employees ALTER COLUMN pin DROP NOT NULL;

-- Index bleibt erhalten (NULL-Werte werden bei Gleichheitsabfragen ohnehin ignoriert)
