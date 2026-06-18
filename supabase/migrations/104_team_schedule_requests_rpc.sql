-- Migration 104: Team-Planungsanzeige — eingereichte Verfuegbarkeiten konsistent
-- ueber EINE SECURITY-DEFINER-RPC laden (statt direktem RLS-SELECT).
--
-- Bug: Im Arbeitsplan (Team -> Planung) wurden fuer manche Mitarbeiter (z. B.
-- "Musa Ozdoev") KEINE eingereichten Planungen angezeigt, obwohl die vom Chef
-- geplanten Schichten/No-Shows/Aenderungen sichtbar waren.
--
-- Ursache: Schichten/No-Shows/Aenderungen kommen aus SECURITY-DEFINER-RPCs, die
-- per is_chef() gaten (= user_roles admin/manager ODER employees.position in
-- geschaeftsfuehrer/manager). Die Verfuegbarkeiten kamen dagegen aus einem
-- direkten Table-SELECT auf employee_schedule_requests, der nur ueber die
-- RLS-Policy esr_select_role_or_self sichtbar ist:
--   is_admin_or_manager() OR eigener Datensatz OR employee.reports_to = ich
-- is_admin_or_manager() prueft NUR user_roles (nicht den position-Pfad). Ein
-- Chef ueber den position-Pfad ohne user_roles-Zeile bzw. ein Chef, der nicht
-- der direkte Vorgesetzte des Mitarbeiters ist, sieht die Schichten, aber nicht
-- die eingereichten Verfuegbarkeiten -> "fehlende Planung".
--
-- Fix: get_team_schedule_requests gated per is_chef() — identische Sichtbarkeit
-- wie get_team_planned_shifts/get_team_no_shows/get_team_schedule_changes.

DROP FUNCTION IF EXISTS public.get_team_schedule_requests(date, date, boolean);

CREATE OR REPLACE FUNCTION public.get_team_schedule_requests(
  p_from date, p_to date, p_include_demo boolean DEFAULT false)
RETURNS TABLE(employee_id uuid, week_start date, availability jsonb)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  -- Alle Wochen, die den Bereich [p_from, p_to] beruehren. Eine Woche beginnt am
  -- Montag (week_start) und deckt week_start..week_start+6 ab; sie ist relevant,
  -- wenn week_start <= p_to UND week_start+6 >= p_from.
  SELECT esr.employee_id, esr.week_start, esr.availability
  FROM public.employee_schedule_requests esr
  JOIN public.employees e ON e.id = esr.employee_id
  WHERE public.is_chef()
    AND (p_include_demo OR NOT e.is_demo)
    AND esr.week_start <= p_to
    AND (esr.week_start + 6) >= p_from;
$$;
GRANT EXECUTE ON FUNCTION public.get_team_schedule_requests(date, date, boolean) TO authenticated;
