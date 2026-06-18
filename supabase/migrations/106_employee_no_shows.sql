-- Migration 106: get_employee_no_shows
--
-- Einzel-Mitarbeiter-Variante von get_team_no_shows (Migration 081).
-- Liefert die No-Shows EINES Mitarbeiters ueber einen Zeitraum, damit die
-- Mitarbeiter-Zeitdetail-/KW-Detailansicht pro Tag einen "Nicht erschienen"-
-- Hinweis zeigen kann: an dem Tag VERPLANT (Chef-Schicht ODER eingereichte
-- Verfuegbarkeit), aber NICHT eingestempelt und NICHT genehmigt abwesend.
--
-- Gleiche Logik wie get_team_no_shows, nur gefiltert auf p_employee_id.
-- is_chef()-gated (deckt admin/manager-Rollen + GF/manager-Positionen ab).

CREATE OR REPLACE FUNCTION public.get_employee_no_shows(
  p_employee_id uuid, p_from date, p_to date)
RETURNS TABLE(day date, planned_from text, planned_to text, source text)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  WITH days AS (
    SELECT generate_series(p_from, LEAST(p_to, current_date - 1), interval '1 day')::date AS d
  ),
  -- Verpflichtungen aus Chef-Schichten
  shift_commit AS (
    SELECT ps.shift_date AS d,
           to_char(ps.start_time,'HH24:MI') AS pf,
           to_char(ps.end_time,'HH24:MI') AS pt,
           'shift'::text AS src
    FROM public.planned_shifts ps
    WHERE ps.employee_id = p_employee_id
      AND ps.shift_date BETWEEN p_from AND current_date - 1
  ),
  -- Verpflichtungen aus eingereichter Verfuegbarkeit (eingefroren = Vergangenheit)
  avail_commit AS (
    SELECT (esr.week_start + (k.idx - 1))::date AS d,
           esr.availability -> k.key ->> 'from' AS pf,
           esr.availability -> k.key ->> 'to' AS pt,
           'availability'::text AS src
    FROM public.employee_schedule_requests esr
    CROSS JOIN LATERAL (
      VALUES (1,'mon'),(2,'tue'),(3,'wed'),(4,'thu'),(5,'fri'),(6,'sat'),(7,'sun')
    ) AS k(idx, key)
    WHERE esr.employee_id = p_employee_id
      AND esr.availability -> k.key ->> 'from' IS NOT NULL
      AND (esr.week_start + (k.idx - 1))::date BETWEEN p_from AND current_date - 1
  ),
  commit_all AS (
    SELECT * FROM shift_commit
    UNION ALL
    SELECT * FROM avail_commit
  ),
  -- pro Tag nur EINE Verpflichtung (Schicht vor Verfuegbarkeit)
  commit_dedup AS (
    SELECT DISTINCT ON (c.d)
           c.d, c.pf, c.pt, c.src
    FROM commit_all c
    JOIN days dy ON dy.d = c.d
    ORDER BY c.d, (c.src = 'shift') DESC
  )
  SELECT cd.d, cd.pf, cd.pt, cd.src
  FROM commit_dedup cd
  WHERE public.is_chef()
    -- nicht eingestempelt an dem Tag (Berlin-Datum)
    AND NOT EXISTS (
      SELECT 1 FROM public.time_entries te
      WHERE te.employee_id = p_employee_id
        AND (te.checked_in_at AT TIME ZONE 'Europe/Berlin')::date = cd.d
    )
    -- nicht genehmigt abwesend an dem Tag
    AND NOT EXISTS (
      SELECT 1 FROM public.absence_requests ar
      WHERE ar.employee_id = p_employee_id
        AND ar.status = 'approved'
        AND cd.d BETWEEN ar.start_date AND ar.end_date
    )
  ORDER BY cd.d;
$$;
GRANT EXECUTE ON FUNCTION public.get_employee_no_shows(uuid, date, date) TO authenticated;
