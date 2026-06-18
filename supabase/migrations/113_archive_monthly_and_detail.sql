-- Migration 113: Archiv — Monatsaufschluesselung (fuer Diagramme) + Tages-Detail
-- (fuer die PDF-Detailseiten). Beide Chef-gated.

-- ===========================================================================
-- get_employee_archive_monthly — pro Kalendermonat im Zeitraum:
--   net_minutes (inkl. Pauschalen), worked_days, vacation/sick/unpaid days.
-- Fuer das Balkendiagramm "Stunden/Monat" und die Verteilungs-Charts.
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.get_employee_archive_monthly(
  p_employee_id uuid,
  p_from        date,
  p_to          date
)
RETURNS TABLE (
  month_start   date,
  net_minutes   integer,
  worked_days   integer,
  vacation_days integer,
  sick_days     integer,
  unpaid_days   integer
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_m date;
  v_mend date;
  r record;
BEGIN
  IF NOT public.is_chef() THEN
    RAISE EXCEPTION 'Keine Berechtigung' USING ERRCODE = '42501';
  END IF;

  v_m := date_trunc('month', p_from)::date;
  WHILE v_m <= p_to LOOP
    v_mend := (date_trunc('month', v_m) + interval '1 month - 1 day')::date;
    -- Monatsgrenzen auf den angefragten Zeitraum klemmen.
    SELECT a.net_minutes, a.worked_days, a.vacation_days, a.sick_days, a.unpaid_days
    INTO r
    FROM public.get_employee_archive(
      p_employee_id,
      GREATEST(v_m, p_from),
      LEAST(v_mend, p_to)
    ) a;

    month_start   := v_m;
    net_minutes   := COALESCE(r.net_minutes, 0);
    worked_days   := COALESCE(r.worked_days, 0);
    vacation_days := COALESCE(r.vacation_days, 0);
    sick_days     := COALESCE(r.sick_days, 0);
    unpaid_days   := COALESCE(r.unpaid_days, 0);
    RETURN NEXT;

    v_m := (date_trunc('month', v_m) + interval '1 month')::date;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_employee_archive_monthly(uuid, date, date) TO authenticated;

COMMENT ON FUNCTION public.get_employee_archive_monthly(uuid, date, date) IS
  'Chef-Archiv: Monatsaufschluesselung (Netto-Minuten/Tage/Abwesenheiten) fuer Diagramme. Gate: is_chef().';

-- ===========================================================================
-- get_employee_archive_days — Tages-Detail fuer die PDF-Detailseite(n):
--   pro Tag mit Buchung: erste/letzte Stempelzeit, Brutto/Pause/Netto, Pauschal.
-- Kompakt gehalten (ein Eintrag je Tag, aggregiert). Pauschal-Minuten je Tag
-- werden separat ausgewiesen (datum-basiert, genehmigt).
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.get_employee_archive_days(
  p_employee_id uuid,
  p_from        date,
  p_to          date
)
RETURNS TABLE (
  work_day         date,
  first_in         timestamptz,
  last_out         timestamptz,
  gross_minutes    integer,
  break_minutes    integer,
  net_minutes      integer,
  pauschal_minutes integer,
  entry_count      integer
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH guard AS (
    SELECT public.is_chef() AS ok
  ),
  daily AS (
    SELECT
      (te.checked_in_at AT TIME ZONE 'Europe/Berlin')::date AS d,
      MIN(te.checked_in_at)  AS first_in,
      MAX(te.checked_out_at) AS last_out,
      SUM(EXTRACT(EPOCH FROM (te.checked_out_at - te.checked_in_at)) / 60.0) AS gross,
      EXTRACT(EPOCH FROM (MAX(te.checked_out_at) - MIN(te.checked_in_at))) / 60.0 AS span,
      COUNT(*) AS cnt
    FROM public.time_entries te, guard
    WHERE guard.ok
      AND te.employee_id = p_employee_id
      AND te.checked_out_at IS NOT NULL
      AND (te.checked_in_at AT TIME ZONE 'Europe/Berlin')::date BETWEEN p_from AND p_to
    GROUP BY 1
  ),
  paus AS (
    SELECT pe.datum AS d, SUM(pe.minutes) AS pm
    FROM public.pauschal_entries pe, guard
    WHERE guard.ok
      AND pe.employee_id = p_employee_id
      AND pe.status = 'approved'
      AND pe.datum BETWEEN p_from AND p_to
    GROUP BY 1
  ),
  all_days AS (
    SELECT d FROM daily
    UNION
    SELECT d FROM paus
  )
  SELECT
    ad.d AS work_day,
    dl.first_in,
    dl.last_out,
    COALESCE(dl.gross, 0)::int AS gross_minutes,
    -- ArbZG-Pause fenster-basiert (wie get_employee_balance): Pflichtpause
    -- gegen Eigenpausen (span - gross) verrechnet.
    GREATEST(0,
      (GREATEST(0, LEAST(30, COALESCE(dl.gross,0) - 360))
       + GREATEST(0, LEAST(15, COALESCE(dl.gross,0) - 540)))
      - GREATEST(0, COALESCE(dl.span,0) - COALESCE(dl.gross,0))
    )::int AS break_minutes,
    (COALESCE(dl.gross,0) - GREATEST(0,
      (GREATEST(0, LEAST(30, COALESCE(dl.gross,0) - 360))
       + GREATEST(0, LEAST(15, COALESCE(dl.gross,0) - 540)))
      - GREATEST(0, COALESCE(dl.span,0) - COALESCE(dl.gross,0))
    ) + COALESCE(p.pm, 0))::int AS net_minutes,
    COALESCE(p.pm, 0)::int AS pauschal_minutes,
    COALESCE(dl.cnt, 0)::int AS entry_count
  FROM all_days ad
  LEFT JOIN daily dl ON dl.d = ad.d
  LEFT JOIN paus  p  ON p.d  = ad.d
  ORDER BY ad.d;
$$;

GRANT EXECUTE ON FUNCTION public.get_employee_archive_days(uuid, date, date) TO authenticated;

COMMENT ON FUNCTION public.get_employee_archive_days(uuid, date, date) IS
  'Chef-Archiv: Tages-Detail (erste/letzte Buchung, Brutto/Pause/Netto, Pauschal) fuer die PDF-Detailseiten. Gate: is_chef().';
