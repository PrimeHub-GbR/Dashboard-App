-- Aufgaben-Haupttabelle
CREATE TABLE tasks (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title         TEXT NOT NULL,
  description   TEXT,
  status        TEXT NOT NULL DEFAULT 'todo'
                  CHECK (status IN ('todo','in_progress','in_review','done','blocked')),
  priority      TEXT NOT NULL DEFAULT 'medium'
                  CHECK (priority IN ('high','medium','low')),
  due_date      DATE,
  reminder_at   TIMESTAMPTZ,
  reminder_email TEXT,
  reminder_sent BOOLEAN DEFAULT FALSE,
  created_by    UUID REFERENCES auth.users(id),
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  completed_at  TIMESTAMPTZ
);

-- Zuweisung: Tasks <-> Mitarbeiter (many-to-many)
CREATE TABLE task_assignees (
  task_id     UUID REFERENCES tasks(id) ON DELETE CASCADE,
  employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,
  PRIMARY KEY (task_id, employee_id)
);

-- RLS aktivieren
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_assignees ENABLE ROW LEVEL SECURITY;

-- Policies: Authentifizierte User duerfen alles (Single-Tenant)
CREATE POLICY "authenticated full access tasks"
  ON tasks FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated full access task_assignees"
  ON task_assignees FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Index fuer Performance
CREATE INDEX tasks_status_idx ON tasks(status);
CREATE INDEX tasks_due_date_idx ON tasks(due_date);
CREATE INDEX tasks_assignees_employee_idx ON task_assignees(employee_id);
