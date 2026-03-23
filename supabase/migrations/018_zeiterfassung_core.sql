-- Migration 018: Zeiterfassungssystem — Kern-Tabellen
-- employees, time_entries, shift_plans

-- ============================================================
-- Tabelle: employees
-- Mitarbeiterstammdaten (nur Admin kann anlegen/löschen)
-- ============================================================
CREATE TABLE employees (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                    TEXT NOT NULL,
  pin                     TEXT NOT NULL,
  color                   TEXT NOT NULL DEFAULT '#22c55e',
  is_active               BOOLEAN NOT NULL DEFAULT true,
  target_hours_per_month  NUMERIC(5,2) NOT NULL DEFAULT 160.0,
  created_by              UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_employees_is_active ON employees (is_active);
CREATE INDEX idx_employees_pin ON employees (pin);

ALTER TABLE employees ENABLE ROW LEVEL SECURITY;

CREATE POLICY "employees_select_authenticated" ON employees
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "employees_insert_service_role" ON employees
  FOR INSERT TO service_role WITH CHECK (true);

CREATE POLICY "employees_update_service_role" ON employees
  FOR UPDATE TO service_role USING (true);

CREATE POLICY "employees_delete_service_role" ON employees
  FOR DELETE TO service_role USING (true);

CREATE OR REPLACE FUNCTION update_employees_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER employees_updated_at
  BEFORE UPDATE ON employees
  FOR EACH ROW EXECUTE FUNCTION update_employees_updated_at();


-- ============================================================
-- Tabelle: time_entries
-- Zeitbuchungen (Check-in / Check-out)
-- Zeiten in UTC gespeichert, Anzeige in Europe/Berlin
-- ============================================================
CREATE TABLE time_entries (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id     UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  checked_in_at   TIMESTAMPTZ NOT NULL,
  checked_out_at  TIMESTAMPTZ,
  break_minutes   INTEGER NOT NULL DEFAULT 0,
  note            TEXT,
  corrected_by    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  corrected_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Verhindert doppeltes Einstempeln (nur ein offener Eintrag pro Mitarbeiter)
CREATE UNIQUE INDEX idx_time_entries_open_unique
  ON time_entries (employee_id)
  WHERE checked_out_at IS NULL;

CREATE INDEX idx_time_entries_employee_date
  ON time_entries (employee_id, checked_in_at DESC);

CREATE INDEX idx_time_entries_open_all
  ON time_entries (checked_in_at DESC)
  WHERE checked_out_at IS NULL;

ALTER TABLE time_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "time_entries_select_authenticated" ON time_entries
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "time_entries_insert_service_role" ON time_entries
  FOR INSERT TO service_role WITH CHECK (true);

CREATE POLICY "time_entries_update_service_role" ON time_entries
  FOR UPDATE TO service_role USING (true);

CREATE POLICY "time_entries_delete_service_role" ON time_entries
  FOR DELETE TO service_role USING (true);

CREATE OR REPLACE FUNCTION update_time_entries_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER time_entries_updated_at
  BEFORE UPDATE ON time_entries
  FOR EACH ROW EXECUTE FUNCTION update_time_entries_updated_at();


-- ============================================================
-- Tabelle: shift_plans
-- Schichtplanung: Soll-Zeiten pro Mitarbeiter und Tag
-- ============================================================
CREATE TABLE shift_plans (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  shift_date  DATE NOT NULL,
  start_time  TIME NOT NULL,
  end_time    TIME NOT NULL,
  note        TEXT,
  created_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (employee_id, shift_date)
);

CREATE INDEX idx_shift_plans_date ON shift_plans (shift_date);
CREATE INDEX idx_shift_plans_employee_date ON shift_plans (employee_id, shift_date);

ALTER TABLE shift_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "shift_plans_select_authenticated" ON shift_plans
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "shift_plans_insert_service_role" ON shift_plans
  FOR INSERT TO service_role WITH CHECK (true);

CREATE POLICY "shift_plans_update_service_role" ON shift_plans
  FOR UPDATE TO service_role USING (true);

CREATE POLICY "shift_plans_delete_service_role" ON shift_plans
  FOR DELETE TO service_role USING (true);
