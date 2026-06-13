-- Chef-Ansicht: hat jeder Mitarbeiter Push-Benachrichtigungen aktiv (= ein
-- registriertes Geraet)? Zeigt Anzahl Geraete, Plattformen, letzte Registrierung.
CREATE OR REPLACE FUNCTION public.get_team_push_status()
RETURNS TABLE(employee_id uuid, name text, emp_position text,
              device_count int, platforms text, last_registered timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT e.id, e.name, e.position,
         count(dt.token)::int,
         string_agg(DISTINCT dt.platform, ',' ORDER BY dt.platform),
         max(dt.updated_at)
  FROM public.employees e
  LEFT JOIN public.device_tokens dt ON dt.employee_id = e.id
  WHERE public.is_chef() AND NOT e.is_demo
    AND public._my_level() > public._level_of(e.id)
  GROUP BY e.id, e.name, e.position
  ORDER BY e.name;
$$;
GRANT EXECUTE ON FUNCTION public.get_team_push_status() TO authenticated;
