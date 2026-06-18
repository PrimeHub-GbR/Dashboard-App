-- Migration 112: Mitarbeiter-Archiv (Daten) fuer Auswertungen + Halbjahres-PDF.
--
-- Liefert je Mitarbeiter strukturiert ueber einen Zeitraum:
--   * worked_days        — Anzahl Tage mit (mind. einer) abgeschlossenen Buchung
--   * net_minutes        — Netto-Arbeitsminuten (ArbZG) INKL. genehmigter Pauschalen
--                          (identisch zu get_employee_balance.ist_minutes)
--   * pauschal_minutes   — davon: genehmigte Pauschalstunden im Zeitraum
--   * vacation_days      — genehmigte Urlaubstage (Arbeitstage laut weekly_schedule)
--   * sick_days          — genehmigte Kranktage (Arbeitstage)
--   * unpaid_days        — genehmigte unbezahlte Fehltage (Arbeitstage)
--
-- WICHTIG zur Abbildung der Abwesenheitstypen:
--   absence_requests.type kennt NUR 'urlaub' | 'krankheit' | 'sonstige'.
--   -> vacation_days = type 'urlaub', sick_days = type 'krankheit',
--      unpaid_days   = type 'sonstige' (= "unbezahlte Fehltage").
--   "Geplant aber nicht erschienen" (No-Shows) ist BEWUSST NICHT enthalten.
--
-- Zugriff: SECURITY DEFINER, nur Chef (is_chef()). Mitarbeiter sehen ihr Archiv
-- NICHT (Anforderung: nur der Chef).

CREATE OR REPLACE FUNCTION public.get_employee_archive(
  p_employee_id uuid,
  p_from        date,
  p_to          date
)
RETURNS TABLE (
  employee_id      uuid,
  employee_name    text,
  employee_color   text,
  period_from      date,
  period_to        date,
  worked_days      integer,
  net_minutes      integer,
  pauschal_minutes integer,
  vacation_days    integer,
  sick_days        integer,
  unpaid_days      integer
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_name  text;
  v_color text;
  v_net   integer;
  v_paus  integer;
  v_worked integer;
  v_vac   integer;
  v_sick  integer;
  v_unpaid integer;
BEGIN
  IF NOT public.is_chef() THEN
    RAISE EXCEPTION 'Keine Berechtigung' USING ERRCODE = '42501';
  END IF;
  IF p_to < p_from THEN
    RAISE EXCEPTION 'period_to must be >= period_from' USING ERRCODE = '22023';
  END IF;

  SELECT e.name, e.color INTO v_name, v_color
  FROM public.employees e WHERE e.id = p_employee_id;
  IF v_name IS NULL THEN
    RAISE EXCEPTION 'employee not found: %', p_employee_id USING ERRCODE = 'P0002';
  END IF;

  -- Netto-Minuten inkl. Pauschalen = ist_minutes aus get_employee_balance.
  SELECT b.ist_minutes INTO v_net
  FROM public.get_employee_balance(p_employee_id, p_from, p_to) b;
  v_net := COALESCE(v_net, 0);

  -- Davon: genehmigte Pauschalen im Zeitraum (Information fuer die Auswertung).
  SELECT COALESCE(SUM(pe.minutes), 0)::int INTO v_paus
  FROM public.pauschal_entries pe
  WHERE pe.employee_id = p_employee_id
    AND pe.status = 'approved'
    AND pe.datum BETWEEN p_from AND p_to;

  -- Gearbeitete Tage = distinkte Berlin-Tage mit abgeschlossener Buchung.
  SELECT COUNT(DISTINCT (te.checked_in_at AT TIME ZONE 'Europe/Berlin')::date)::int
  INTO v_worked
  FROM public.time_entries te
  WHERE te.employee_id = p_employee_id
    AND te.checked_out_at IS NOT NULL
    AND (te.checked_in_at AT TIME ZONE 'Europe/Berlin')::date BETWEEN p_from AND p_to;

  -- Abwesenheits-Arbeitstage je Typ (genehmigt), auf den Zeitraum begrenzt.
  SELECT
    COALESCE(SUM(CASE WHEN x.type = 'urlaub'    THEN x.wd ELSE 0 END), 0)::int,
    COALESCE(SUM(CASE WHEN x.type = 'krankheit' THEN x.wd ELSE 0 END), 0)::int,
    COALESCE(SUM(CASE WHEN x.type = 'sonstige'  THEN x.wd ELSE 0 END), 0)::int
  INTO v_vac, v_sick, v_unpaid
  FROM (
    SELECT a.type,
           public._absence_workdays(
             p_employee_id,
             GREATEST(a.start_date, p_from),
             LEAST(a.end_date, p_to)
           ) AS wd
    FROM public.absence_requests a
    WHERE a.employee_id = p_employee_id
      AND a.status = 'approved'
      AND a.start_date <= p_to
      AND a.end_date   >= p_from
  ) x;

  RETURN QUERY SELECT
    p_employee_id, v_name, v_color, p_from, p_to,
    COALESCE(v_worked, 0), v_net, v_paus,
    v_vac, v_sick, v_unpaid;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_employee_archive(uuid, date, date) TO authenticated;

COMMENT ON FUNCTION public.get_employee_archive(uuid, date, date) IS
  'Chef-Archiv: aggregierte Auswertung eines Mitarbeiters fuer einen Zeitraum (Tage/Stunden/Urlaub/krank/unbezahlt). Gate: is_chef().';
