-- Migration 036: Wochenplan-Einreichungen durch Mitarbeiter (Grundgerüst für spätere App)
--
-- Zweck: Eine spätere Mitarbeiter-App soll erlauben, Wochenplan-Wünsche/Verfügbarkeiten
-- einzureichen und die eigenen Ist/Soll/Differenz-Stunden read-only zu sehen.
-- Diese Tabelle ist die Datenbasis dafür. UI + App-Auth folgen später.
--
-- WICHTIG (Zukunfts-Entscheidung, NICHT in dieser Migration umgesetzt):
-- Der Check-in/out (`/api/zeiterfassung/toggle`) bleibt KIOSK-exklusiv und gerätegebunden
-- (Header `x-kiosk-token`), um Buddy-Punching zu verhindern. Die spätere App darf NICHT
-- vom Handy einchecken. Sie nutzt einen GETRENNTEN Zugriffsweg (z.B. Magic-Link via
-- `employees.email` oder eine Per-Mitarbeiter-Token-Spalte) mit eigenem Header
-- (`x-app-token`), der niemals die toggle-Route erreichen darf. Schreibzugriff auf
-- diese Tabelle läuft ausschließlich serverseitig über den Service-Role-Client.

CREATE TABLE employee_schedule_requests (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id  UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  week_start   DATE NOT NULL,                              -- Montag der Zielwoche
  availability JSONB NOT NULL DEFAULT '{}'::jsonb,         -- z.B. {"mon":{"from":"09:00","to":"17:00"}, ...}
  note         TEXT,
  status       TEXT NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (employee_id, week_start)
);

CREATE INDEX idx_esr_employee ON employee_schedule_requests (employee_id, week_start);

ALTER TABLE employee_schedule_requests ENABLE ROW LEVEL SECURITY;

-- Dashboard/Admin (authenticated) liest alle Einreichungen
CREATE POLICY "esr_select_authenticated" ON employee_schedule_requests
  FOR SELECT TO authenticated USING (true);

-- Schreiben ausschließlich über Service-Role (App-API geht serverseitig über Route + Token,
-- KEIN direkter Client-Write vom Handy) — konsistent mit dem übrigen Zeiterfassungs-Stack
CREATE POLICY "esr_write_service_role" ON employee_schedule_requests
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- updated_at-Trigger (generische Funktion aus Migration 018 wiederverwenden)
CREATE TRIGGER esr_updated_at
  BEFORE UPDATE ON employee_schedule_requests
  FOR EACH ROW EXECUTE FUNCTION update_employees_updated_at();
