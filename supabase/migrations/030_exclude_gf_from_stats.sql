-- Migration 030: Geschäftsführer aus Stundenauswertung und Dashboard-Charts ausschließen

-- ============================================================
-- Funktion: get_all_employees_month_hours
-- Fügt position != 'geschaeftsfuehrer' Filter hinzu
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
    AND e.position != 'geschaeftsfuehrer'
  GROUP BY e.id, e.name, e.color, e.target_hours_per_month
  ORDER BY e.name;
$$;

-- ============================================================
-- Funktion: get_daily_hours_per_employee
-- Fügt position != 'geschaeftsfuehrer' Filter hinzu
-- ============================================================
CREATE OR REPLACE FUNCTION get_daily_hours_per_employee(
  p_year  INTEGER,
  p_month INTEGER
)
RETURNS TABLE (
  work_date           DATE,
  employee_id         UUID,
  employee_name       TEXT,
  employee_color      TEXT,
  gross_minutes       BIGINT,
  break_minutes       BIGINT,
  net_minutes         BIGINT,
  entry_count         BIGINT
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    (t.checked_in_at AT TIME ZONE 'Europe/Berlin')::DATE AS work_date,
    e.id AS employee_id,
    e.name AS employee_name,
    e.color AS employee_color,
    SUM(
      EXTRACT(EPOCH FROM (t.checked_out_at - t.checked_in_at)) / 60
    )::BIGINT AS gross_minutes,
    SUM(t.break_minutes)::BIGINT AS break_minutes,
    GREATEST(0,
      SUM(
        EXTRACT(EPOCH FROM (t.checked_out_at - t.checked_in_at)) / 60
      ) - SUM(t.break_minutes)
    )::BIGINT AS net_minutes,
    COUNT(*)::BIGINT AS entry_count
  FROM time_entries t
  JOIN employees e ON e.id = t.employee_id
  WHERE
    t.checked_out_at IS NOT NULL
    AND EXTRACT(YEAR FROM t.checked_in_at AT TIME ZONE 'Europe/Berlin') = p_year
    AND EXTRACT(MONTH FROM t.checked_in_at AT TIME ZONE 'Europe/Berlin') = p_month
    AND e.is_active = true
    AND e.position != 'geschaeftsfuehrer'
  GROUP BY
    (t.checked_in_at AT TIME ZONE 'Europe/Berlin')::DATE,
    e.id, e.name, e.color
  ORDER BY work_date, e.name;
$$;
