-- Migration 121: Archiv — read-only Einzel-Stempelzeiten je Mitarbeiter/Zeitraum.
--
-- Hauptfunktion des Archivs: alte Stempelzeiten ANSEHEN (read-only), auch fuer
-- Monate ausserhalb des 4-Wochen-Bearbeitungsfensters. Im Gegensatz zu
-- get_employee_archive_days (ein aggregierter Eintrag je Tag fuer die PDF) liefert
-- diese RPC JEDEN EINZELNEN time_entry mit Ein-/Ausstempelzeit, Netto-Minuten und
-- Quelle (Kiosk vs. manuell). Reine Ansicht — kein Schreibpfad, kein Edit-Fenster.
--
-- Gate: is_chef() (Manager/GF), analog zu den uebrigen Archiv-RPCs (Mig 112–114).

CREATE OR REPLACE FUNCTION public.get_employee_archive_entries(
  p_employee_id uuid,
  p_from        date,
  p_to          date
)
RETURNS TABLE (
  entry_id       uuid,
  work_day       date,
  checked_in_at  timestamptz,
  checked_out_at timestamptz,
  break_minutes  integer,
  gross_minutes  integer,
  net_minutes    integer,
  source         text,      -- 'kiosk' (pin/fingerprint) oder 'manual'
  corrected      boolean,
  note           text
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH guard AS (
    SELECT public.is_chef() AS ok
  )
  SELECT
    te.id AS entry_id,
    (te.checked_in_at AT TIME ZONE 'Europe/Berlin')::date AS work_day,
    te.checked_in_at,
    te.checked_out_at,
    COALESCE(te.break_minutes, 0)::int AS break_minutes,
    CASE
      WHEN te.checked_out_at IS NULL THEN 0
      ELSE GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (te.checked_out_at - te.checked_in_at)) / 60))::int
    END AS gross_minutes,
    CASE
      WHEN te.checked_out_at IS NULL THEN 0
      ELSE GREATEST(0,
        FLOOR(EXTRACT(EPOCH FROM (te.checked_out_at - te.checked_in_at)) / 60)::int
        - COALESCE(te.break_minutes, 0))
    END AS net_minutes,
    CASE WHEN te.auth_method = 'manual' THEN 'manual' ELSE 'kiosk' END AS source,
    (te.corrected_by IS NOT NULL) AS corrected,
    te.note
  FROM public.time_entries te, guard
  WHERE guard.ok
    AND te.employee_id = p_employee_id
    AND (te.checked_in_at AT TIME ZONE 'Europe/Berlin')::date BETWEEN p_from AND p_to
  ORDER BY te.checked_in_at;
$$;

GRANT EXECUTE ON FUNCTION public.get_employee_archive_entries(uuid, date, date) TO authenticated;

COMMENT ON FUNCTION public.get_employee_archive_entries(uuid, date, date) IS
  'Chef-Archiv: read-only Einzel-Stempelzeiten (Ein/Aus, Netto, Quelle Kiosk/manuell) je Mitarbeiter/Zeitraum. Kein Edit-Fenster. Gate: is_chef().';
