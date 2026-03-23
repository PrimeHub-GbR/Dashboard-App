-- Migration 020: Zeiterfassungssystem — DB-Hilfsfunktionen

-- ============================================================
-- Funktion: get_employee_month_hours
-- Berechnet Arbeitsstunden eines Mitarbeiters für einen Monat.
-- Zeitzone: Europe/Berlin (korrekte Monatsgrenzberechnung)
-- ============================================================
CREATE OR REPLACE FUNCTION get_employee_month_hours(
  p_employee_id UUID,
  p_year        INTEGER,
  p_month       INTEGER
)
RETURNS TABLE (
  total_work_minutes  BIGINT,
  total_break_minutes BIGINT,
  entry_count         BIGINT
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    SUM(
      EXTRACT(EPOCH FROM (
        COALESCE(checked_out_at, now()) - checked_in_at
      )) / 60
    )::BIGINT AS total_work_minutes,
    SUM(break_minutes)::BIGINT AS total_break_minutes,
    COUNT(*)::BIGINT AS entry_count
  FROM time_entries
  WHERE
    employee_id = p_employee_id
    AND EXTRACT(YEAR FROM checked_in_at AT TIME ZONE 'Europe/Berlin') = p_year
    AND EXTRACT(MONTH FROM checked_in_at AT TIME ZONE 'Europe/Berlin') = p_month
    AND checked_out_at IS NOT NULL;
$$;


-- ============================================================
-- Funktion: get_all_employees_month_hours
-- Monatsauswertung für alle aktiven Mitarbeiter auf einmal.
-- ============================================================
CREATE OR REPLACE FUNCTION get_all_employees_month_hours(
  p_year  INTEGER,
  p_month INTEGER
)
RETURNS TABLE (
  employee_id             UUID,
  employee_name           TEXT,
  employee_color          TEXT,
  target_hours_per_month  NUMERIC,
  total_work_minutes      BIGINT,
  total_break_minutes     BIGINT,
  entry_count             BIGINT
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    e.id AS employee_id,
    e.name AS employee_name,
    e.color AS employee_color,
    e.target_hours_per_month,
    COALESCE(SUM(
      EXTRACT(EPOCH FROM (
        COALESCE(t.checked_out_at, now()) - t.checked_in_at
      )) / 60
    )::BIGINT, 0) AS total_work_minutes,
    COALESCE(SUM(t.break_minutes)::BIGINT, 0) AS total_break_minutes,
    COUNT(t.id)::BIGINT AS entry_count
  FROM employees e
  LEFT JOIN time_entries t
    ON t.employee_id = e.id
    AND t.checked_out_at IS NOT NULL
    AND EXTRACT(YEAR FROM t.checked_in_at AT TIME ZONE 'Europe/Berlin') = p_year
    AND EXTRACT(MONTH FROM t.checked_in_at AT TIME ZONE 'Europe/Berlin') = p_month
  WHERE e.is_active = true
  GROUP BY e.id, e.name, e.color, e.target_hours_per_month
  ORDER BY e.name;
$$;
