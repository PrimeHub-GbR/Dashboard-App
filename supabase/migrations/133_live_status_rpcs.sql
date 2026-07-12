-- Migration 133: "arbeitet gerade"-Anzeige zuverlaessig machen (P4)
--
-- Bug: In der Team-Uebersicht (Zeitmanagement) fehlte fuer manche Mitarbeiter
-- (z. B. Muchammed) die "arbeitet"-Anzeige mit Uhrzeit, obwohl ein offener
-- Zeiteintrag existierte.
--
-- Ursache (gleiche Fehlerklasse wie der "Musa-Bug", geloest in Mig 104):
-- Die App las offene Eintraege ueber DIREKTE Tabellen-SELECTs auf time_entries
-- bzw. employee_schedule_requests. Die RLS-Policy
-- time_entries_select_role_or_self erlaubt nur
--   is_admin_or_manager() OR self OR employees.reports_to = current_employee_id()
-- is_admin_or_manager() prueft NUR user_roles (nicht den position-Pfad). Ein
-- Chef ueber employees.position (is_chef) ohne user_roles-Zeile bzw. ein Chef,
-- der nicht der direkte Vorgesetzte ist, sieht die Zeilen nicht -> Anzeige fehlt.
--
-- Fix: Zwei SECURITY-DEFINER-RPCs, gated per is_chef() — identische
-- Sichtbarkeit wie get_team_schedule_requests/get_team_no_shows.

-- ===========================================================================
-- (1) Wer arbeitet gerade: employee_ids aller offenen Eintraege
-- ===========================================================================
DROP FUNCTION IF EXISTS public.get_open_employee_ids();

CREATE FUNCTION public.get_open_employee_ids()
RETURNS TABLE(employee_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT DISTINCT te.employee_id
  FROM public.time_entries te
  WHERE public.is_chef()
    AND te.checked_out_at IS NULL;
$$;
GRANT EXECUTE ON FUNCTION public.get_open_employee_ids() TO authenticated;

COMMENT ON FUNCTION public.get_open_employee_ids() IS
  'IDs aller Mitarbeiter mit offenem Zeiteintrag (checked_out_at IS NULL). is_chef()-gated, fuer die Team-Live-Anzeige der App (Mig 133).';

-- ===========================================================================
-- (2) Live-Status eines Mitarbeiters: eingestempelt seit + geplantes Ende
--     heute (aus employee_schedule_requests.availability der laufenden Woche,
--     Berlin-Zeit) — die bisherige Client-Logik, in die RPC verlagert.
-- ===========================================================================
DROP FUNCTION IF EXISTS public.get_employee_live_status(uuid);

CREATE FUNCTION public.get_employee_live_status(p_employee_id uuid)
RETURNS TABLE(checked_in_at timestamptz, planned_end text)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  WITH today AS (
    SELECT (now() AT TIME ZONE 'Europe/Berlin')::date AS d
  ),
  open_entry AS (
    SELECT te.checked_in_at
    FROM public.time_entries te
    WHERE public.is_chef()
      AND te.employee_id = p_employee_id
      AND te.checked_out_at IS NULL
    ORDER BY te.checked_in_at DESC
    LIMIT 1
  )
  SELECT o.checked_in_at,
         (SELECT esr.availability
                   -> (ARRAY['mon','tue','wed','thu','fri','sat','sun'])
                        [EXTRACT(isodow FROM t.d)::int]
                  ->> 'to'
          FROM public.employee_schedule_requests esr
          WHERE esr.employee_id = p_employee_id
            AND esr.week_start = t.d - (EXTRACT(isodow FROM t.d)::int - 1)
          LIMIT 1) AS planned_end
  FROM open_entry o
  CROSS JOIN today t;
$$;
GRANT EXECUTE ON FUNCTION public.get_employee_live_status(uuid) TO authenticated;

COMMENT ON FUNCTION public.get_employee_live_status(uuid) IS
  'Live-Status: checked_in_at des offenen Eintrags + geplantes Ende heute ("HH:MM" aus der eingereichten Verfuegbarkeit der laufenden Woche). Leer, wenn nicht eingestempelt. is_chef()-gated (Mig 133).';
