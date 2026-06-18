-- Migration 114: Mitarbeiter-Liste fuer das Chef-Archiv.
--
-- Liefert alle Mitarbeiter (aktiv + inaktiv) mit Eintrittsdatum und dem Datum
-- der ersten Buchung. Daraus berechnet der Client, welche ABGESCHLOSSENEN
-- Halbjahre (H1 Jan-Jun / H2 Jul-Dez) je Mitarbeiter zur Auswertung bereitstehen
-- (ein Halbjahr erscheint, sobald es vorbei ist und der Mitarbeiter darin
-- existierte). Nur Chef sieht das.

CREATE OR REPLACE FUNCTION public.get_archive_employees(
  p_include_demo boolean DEFAULT false
)
RETURNS TABLE (
  employee_id   uuid,
  employee_name text,
  employee_color text,
  emp_position  text,
  is_active     boolean,
  entry_date    date,
  first_entry   date
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH guard AS (SELECT public.is_chef() AS ok)
  SELECT
    e.id,
    e.name,
    e.color,
    e.position,
    e.is_active,
    e.entry_date,
    (
      SELECT (MIN(te.checked_in_at) AT TIME ZONE 'Europe/Berlin')::date
      FROM public.time_entries te
      WHERE te.employee_id = e.id AND te.checked_out_at IS NOT NULL
    ) AS first_entry
  FROM public.employees e, guard
  WHERE guard.ok
    AND e.position <> 'geschaeftsfuehrer'
    AND (p_include_demo OR NOT e.is_demo)
  ORDER BY e.is_active DESC, e.name;
$$;

GRANT EXECUTE ON FUNCTION public.get_archive_employees(boolean) TO authenticated;

COMMENT ON FUNCTION public.get_archive_employees(boolean) IS
  'Chef-Archiv: Mitarbeiterliste inkl. Eintrittsdatum + Datum der ersten Buchung (zur Bestimmung verfuegbarer Halbjahre). Gate: is_chef().';
