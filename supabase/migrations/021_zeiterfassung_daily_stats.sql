-- Migration 021: Tagesweise Stundenauswertung pro Mitarbeiter (für Dashboard-Chart)

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
  GROUP BY
    (t.checked_in_at AT TIME ZONE 'Europe/Berlin')::DATE,
    e.id, e.name, e.color
  ORDER BY work_date, e.name;
$$;
