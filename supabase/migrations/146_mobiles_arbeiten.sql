-- Migration 146: Mobiles Arbeiten — Pauschalzeit fuer Remote-Mitarbeiter
--
-- Fachlich: Ein Mitarbeiter, der zu 100 % remote arbeitet, kann nicht am Kiosk
-- stempeln. Der Chef/Manager schaltet pro Mitarbeiter das Flag
-- employees.mobiles_arbeiten ein (Standard: aus). Nur dann darf der
-- Mitarbeiter in der App pro Tag eine Pauschalzeit (Stunden + Minuten, ohne
-- Pausen) selbst eintragen. Die Eingabe ist SOFORT wirksam — keine Genehmigung.
--
-- Technik: Die Eintraege landen in der bestehenden Tabelle pauschal_entries
-- (Mig 107/128) mit kind = 'mobil' und status = 'approved'. Genehmigte
-- Pauschalen werden bereits heute in allen Auswertungen addiert
-- (get_employee_balance, get_all_employees_month_hours,
-- get_month_completion_facts, get_employee_archive_days) — dort ist NICHTS
-- zu aendern. Keine ArbZG-Pausenlogik (bewusst: Pausen verantwortet der
-- Mitarbeiter zu Hause selbst).
--
-- Regeln:
--   * Mitarbeiter: eigener Eintrag nur fuer heute-7 .. heute (Berlin), ein
--     Eintrag pro Tag (Upsert). Jeder Tag erlaubt — auch ohne Planung; die
--     Anzeige markiert solche Tage als "nicht geplant" (Spalte planned).
--   * Chef/Manager (Hierarchie _my_level > _level_of): 28 Tage rueckwirkend
--     (_edit_window_floor, Mig 111), auch fuer Mitarbeiter ohne Flag loeschen.
--   * Keine genehmigte Abwesenheit am selben Tag.
--   * Mitarbeiter mit Flag fallen aus "Nicht erschienen" (No-Show) heraus —
--     sie stempeln nie; der Eintrag kann Tage spaeter kommen.
--
-- Angepasste RPCs (CREATE OR REPLACE, Signaturen unveraendert):
--   pauschal_list, get_chef_pauschal_notifications  -> nur kind = 'pauschal'
--   get_team_no_shows, get_employee_no_shows, get_no_shows_internal
--                                                   -> Flag-Traeger ausnehmen
-- Neue RPCs:
--   admin_set_mobiles_arbeiten, mobile_work_upsert, mobile_work_delete,
--   mobile_work_list, Helper _mobile_window_floor

-- ===========================================================================
-- 1. Schema
-- ===========================================================================
ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS mobiles_arbeiten boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.employees.mobiles_arbeiten IS
  'Mobiles Arbeiten: Mitarbeiter traegt Arbeitszeit pauschal (Stunden/Minuten) in der App selbst ein. Kein Kiosk, sofort wirksam, kein No-Show.';

ALTER TABLE public.pauschal_entries
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'pauschal';

ALTER TABLE public.pauschal_entries
  DROP CONSTRAINT IF EXISTS pauschal_entries_kind_check;
ALTER TABLE public.pauschal_entries
  ADD CONSTRAINT pauschal_entries_kind_check CHECK (kind IN ('pauschal', 'mobil'));

COMMENT ON COLUMN public.pauschal_entries.kind IS
  'pauschal = Chef-Pauschale mit GF-Genehmigung (Mig 107); mobil = Selbst-Eintrag Mobiles Arbeiten (sofort approved, Mig 146).';

-- Genau EIN Mobil-Eintrag pro Mitarbeiter und Tag (Upsert-Ziel).
CREATE UNIQUE INDEX IF NOT EXISTS pauschal_entries_mobil_day_uidx
  ON public.pauschal_entries (employee_id, datum) WHERE kind = 'mobil';

-- ===========================================================================
-- 2. Helper: Mitarbeiter-Fenster (Berlin-Datum, heute - 7 Tage)
-- ===========================================================================
CREATE OR REPLACE FUNCTION public._mobile_window_floor()
  RETURNS date
  LANGUAGE sql STABLE
  SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT ((now() AT TIME ZONE 'Europe/Berlin')::date - 7);
$$;

COMMENT ON FUNCTION public._mobile_window_floor() IS
  'Fruehestes Datum, fuer das ein Mitarbeiter selbst Mobil-Zeit eintragen darf: heute (Europe/Berlin) minus 7 Tage.';

-- ===========================================================================
-- 3. RPC: admin_set_mobiles_arbeiten — Flag setzen (Chef, Hierarchie)
--    Bewusst KEIN neuer Parameter an admin_update_employee (zwei Overloads).
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.admin_set_mobiles_arbeiten(
  p_employee_id uuid,
  p_enabled     boolean
)
  RETURNS boolean
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_result boolean;
BEGIN
  IF NOT public.is_chef() THEN
    RAISE EXCEPTION 'insufficient_privilege: nur Manager/GF' USING ERRCODE = '42501';
  END IF;
  IF NOT (public._my_level() > public._level_of(p_employee_id)
          OR (public._my_level() = 3 AND public._level_of(p_employee_id) = 3)) THEN
    RAISE EXCEPTION 'Keine Berechtigung fuer diesen Mitarbeiter (Hierarchie).' USING ERRCODE = '42501';
  END IF;
  IF p_enabled IS NULL THEN
    RAISE EXCEPTION 'p_enabled erforderlich' USING ERRCODE = '22023';
  END IF;

  UPDATE public.employees
  SET mobiles_arbeiten = p_enabled, updated_at = now()
  WHERE id = p_employee_id
  RETURNING mobiles_arbeiten INTO v_result;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'employee not found: %', p_employee_id USING ERRCODE = 'P0002';
  END IF;
  RETURN v_result;
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_set_mobiles_arbeiten(uuid, boolean) TO authenticated;

COMMENT ON FUNCTION public.admin_set_mobiles_arbeiten(uuid, boolean) IS
  'Chef/Manager schaltet "Mobiles Arbeiten" fuer einen Mitarbeiter ein/aus (Hierarchie wie admin_update_employee).';

-- ===========================================================================
-- 4. RPC: mobile_work_upsert — Pauschalzeit fuer einen Tag eintragen/aendern
--    Selbst (p_employee_id NULL): Flag noetig, Fenster 7 Tage.
--    Chef (p_employee_id gesetzt, <> ich): Hierarchie, Fenster 28 Tage.
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.mobile_work_upsert(
  p_datum       date,
  p_minutes     integer,
  p_note        text DEFAULT '',
  p_employee_id uuid DEFAULT NULL
)
  RETURNS public.pauschal_entries
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_me     uuid := public.current_employee_id();
  v_target uuid := COALESCE(p_employee_id, public.current_employee_id());
  v_today  date := (now() AT TIME ZONE 'Europe/Berlin')::date;
  v_chef   boolean;
  v_flag   boolean;
  v_active boolean;
  v_row    public.pauschal_entries;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'Kein Mitarbeiter-Datensatz fuer diesen Login.' USING ERRCODE = '42501';
  END IF;

  -- Fremd-Eintrag: nur Chef mit hoeherem Level.
  v_chef := (v_target <> v_me);
  IF v_chef AND NOT (public.is_chef() AND public._my_level() > public._level_of(v_target)) THEN
    RAISE EXCEPTION 'Keine Berechtigung fuer diesen Mitarbeiter.' USING ERRCODE = '42501';
  END IF;

  SELECT e.mobiles_arbeiten, e.is_active INTO v_flag, v_active
  FROM public.employees e WHERE e.id = v_target;
  IF v_flag IS NULL THEN
    RAISE EXCEPTION 'employee not found: %', v_target USING ERRCODE = 'P0002';
  END IF;
  IF NOT v_flag THEN
    RAISE EXCEPTION 'Mobiles Arbeiten ist fuer diesen Mitarbeiter nicht aktiviert.' USING ERRCODE = '22023';
  END IF;
  IF NOT v_active THEN
    RAISE EXCEPTION 'Mitarbeiter ist inaktiv.' USING ERRCODE = '22023';
  END IF;

  IF p_minutes IS NULL OR p_minutes < 1 OR p_minutes > 1440 THEN
    RAISE EXCEPTION 'Dauer muss zwischen 1 Minute und 24 Stunden liegen.' USING ERRCODE = '22023';
  END IF;
  IF p_datum IS NULL THEN
    RAISE EXCEPTION 'Datum erforderlich.' USING ERRCODE = '22023';
  END IF;
  IF p_datum > v_today THEN
    RAISE EXCEPTION 'Zukuenftige Tage koennen nicht eingetragen werden.' USING ERRCODE = '22023';
  END IF;
  IF v_chef THEN
    IF p_datum < public._edit_window_floor() THEN
      RAISE EXCEPTION 'Eintraege nur bis 4 Wochen rueckwirkend moeglich (ab %).',
        public._edit_window_floor() USING ERRCODE = '22023';
    END IF;
  ELSE
    IF p_datum < public._mobile_window_floor() THEN
      RAISE EXCEPTION 'Eintraege nur bis 7 Tage rueckwirkend moeglich (ab %). Aeltere Tage traegt der Chef nach.',
        public._mobile_window_floor() USING ERRCODE = '22023';
    END IF;
  END IF;

  -- Genehmigte Abwesenheit am selben Tag -> kein Eintrag.
  IF EXISTS (
    SELECT 1 FROM public.absence_requests ar
    WHERE ar.employee_id = v_target
      AND ar.status = 'approved'
      AND p_datum BETWEEN ar.start_date AND ar.end_date
  ) THEN
    RAISE EXCEPTION 'An diesem Tag ist eine genehmigte Abwesenheit eingetragen.' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.pauschal_entries (
    employee_id, minutes, datum, grund, status, required_approver_ids,
    created_by, created_by_employee_id, decided_at, decided_by, kind
  ) VALUES (
    v_target, p_minutes, p_datum, COALESCE(btrim(p_note), ''), 'approved', '{}',
    auth.uid(), v_me, now(), auth.uid(), 'mobil'
  )
  ON CONFLICT (employee_id, datum) WHERE kind = 'mobil'
  DO UPDATE SET
    minutes                = EXCLUDED.minutes,
    grund                  = EXCLUDED.grund,
    created_by             = EXCLUDED.created_by,              -- letzter Bearbeiter
    created_by_employee_id = EXCLUDED.created_by_employee_id,
    updated_at             = now()
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;
GRANT EXECUTE ON FUNCTION public.mobile_work_upsert(date, integer, text, uuid) TO authenticated;

COMMENT ON FUNCTION public.mobile_work_upsert(date, integer, text, uuid) IS
  'Mobiles Arbeiten: Pauschalzeit fuer einen Tag eintragen/ueberschreiben (kind=mobil, sofort approved). Selbst: Flag + 7 Tage; Chef (p_employee_id): Hierarchie + 28 Tage.';

-- ===========================================================================
-- 5. RPC: mobile_work_delete — Eintrag loeschen (Eigentuemer 7 Tage / Chef 28)
--    Das Flag ist hier bewusst NICHT Voraussetzung (Aufraeumen nach Abschalten).
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.mobile_work_delete(p_id uuid)
  RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_me  uuid := public.current_employee_id();
  v_row public.pauschal_entries;
BEGIN
  SELECT * INTO v_row FROM public.pauschal_entries
  WHERE id = p_id AND kind = 'mobil' FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'mobil entry not found: %', p_id USING ERRCODE = 'P0002';
  END IF;

  IF v_row.employee_id = v_me THEN
    IF v_row.datum < public._mobile_window_floor() THEN
      RAISE EXCEPTION 'Eintraege nur bis 7 Tage rueckwirkend loeschbar. Bitte den Chef ansprechen.' USING ERRCODE = '22023';
    END IF;
  ELSIF public.is_chef() AND public._my_level() > public._level_of(v_row.employee_id) THEN
    IF v_row.datum < public._edit_window_floor() THEN
      RAISE EXCEPTION 'Eintraege nur bis 4 Wochen rueckwirkend loeschbar (ab %).',
        public._edit_window_floor() USING ERRCODE = '22023';
    END IF;
  ELSE
    RAISE EXCEPTION 'Keine Berechtigung fuer diesen Eintrag.' USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.pauschal_entries WHERE id = p_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.mobile_work_delete(uuid) TO authenticated;

COMMENT ON FUNCTION public.mobile_work_delete(uuid) IS
  'Mobiles Arbeiten: Eintrag loeschen. Eigentuemer bis 7 Tage, Chef (Hierarchie) bis 28 Tage rueckwirkend.';

-- ===========================================================================
-- 6. RPC: mobile_work_list — Eintraege inkl. "planned" (Tag war verplant?)
--    Chef sieht alle (Hierarchie egal, wie pauschal_list); Mitarbeiter eigene.
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.mobile_work_list(
  p_employee_id uuid DEFAULT NULL,
  p_from        date DEFAULT NULL,
  p_to          date DEFAULT NULL
)
  RETURNS TABLE(
    id uuid, employee_id uuid, datum date, minutes integer, grund text,
    planned boolean, created_by_employee_id uuid, created_by_name text,
    created_at timestamptz, updated_at timestamptz
  )
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT pe.id, pe.employee_id, pe.datum, pe.minutes, pe.grund,
         (
           EXISTS (SELECT 1 FROM public.planned_shifts ps
                   WHERE ps.employee_id = pe.employee_id AND ps.shift_date = pe.datum)
           OR EXISTS (
             SELECT 1 FROM public.employee_schedule_requests esr
             CROSS JOIN LATERAL (
               VALUES (1,'mon'),(2,'tue'),(3,'wed'),(4,'thu'),(5,'fri'),(6,'sat'),(7,'sun')
             ) AS k(idx, key)
             WHERE esr.employee_id = pe.employee_id
               AND (esr.week_start + (k.idx - 1))::date = pe.datum
               AND esr.availability -> k.key ->> 'from' IS NOT NULL
           )
         ) AS planned,
         pe.created_by_employee_id, creator.name, pe.created_at, pe.updated_at
  FROM public.pauschal_entries pe
  LEFT JOIN public.employees creator ON creator.id = pe.created_by_employee_id
  WHERE pe.kind = 'mobil'
    AND pe.status = 'approved'
    AND pe.employee_id = COALESCE(p_employee_id, public.current_employee_id())
    AND (public.is_chef() OR pe.employee_id = public.current_employee_id())
    AND (p_from IS NULL OR pe.datum >= p_from)
    AND (p_to IS NULL OR pe.datum <= p_to)
  ORDER BY pe.datum DESC
  LIMIT 400;
$$;
GRANT EXECUTE ON FUNCTION public.mobile_work_list(uuid, date, date) TO authenticated;

COMMENT ON FUNCTION public.mobile_work_list(uuid, date, date) IS
  'Mobiles Arbeiten: Eintraege eines Mitarbeiters (Chef: beliebig, sonst eigene) inkl. planned = Tag war per Schicht/Verfuegbarkeit verplant.';

-- ===========================================================================
-- 7. pauschal_list (Mig 107) — nur kind = 'pauschal'
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.pauschal_list(
  p_employee_id uuid DEFAULT NULL,
  p_from        date DEFAULT NULL,
  p_to          date DEFAULT NULL
)
  RETURNS TABLE(
    id uuid, employee_id uuid, employee_name text, minutes integer,
    datum date, grund text, status text,
    required_count integer, approved_count integer,
    created_by_name text, created_at timestamptz
  )
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT pe.id, pe.employee_id, e.name, pe.minutes, pe.datum, pe.grund, pe.status,
         COALESCE(array_length(pe.required_approver_ids, 1), 0)::int,
         (SELECT COUNT(*)::int FROM public.pauschal_approvals pa WHERE pa.entry_id = pe.id),
         creator.name, pe.created_at
  FROM public.pauschal_entries pe
  JOIN public.employees e ON e.id = pe.employee_id
  LEFT JOIN public.employees creator ON creator.id = pe.created_by_employee_id
  WHERE pe.kind = 'pauschal'
    AND (
      public.is_chef()
      OR pe.employee_id = public._pauschal_my_employee_id()
    )
    AND (p_employee_id IS NULL OR pe.employee_id = p_employee_id)
    AND (p_from IS NULL OR pe.datum >= p_from)
    AND (p_to IS NULL OR pe.datum <= p_to)
  ORDER BY pe.datum DESC, pe.created_at DESC
  LIMIT 200;
$$;

-- ===========================================================================
-- 8. get_chef_pauschal_notifications (Mig 107) — nur kind = 'pauschal'
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.get_chef_pauschal_notifications()
  RETURNS TABLE(
    entry_id uuid, employee_id uuid, employee_name text, employee_color text,
    minutes integer, datum date, grund text, status text,
    created_by_name text, created_at timestamptz,
    required_count integer, approved_count integer,
    decided boolean, decided_at timestamptz
  )
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT pe.id, pe.employee_id, e.name, e.color, pe.minutes, pe.datum,
         pe.grund, pe.status, creator.name, pe.created_at,
         COALESCE(array_length(pe.required_approver_ids, 1), 0)::int,
         (SELECT COUNT(*)::int FROM public.pauschal_approvals pa WHERE pa.entry_id = pe.id),
         (pe.status <> 'pending'
          OR EXISTS (SELECT 1 FROM public.pauschal_approvals pa
                     WHERE pa.entry_id = pe.id
                       AND pa.approved_by_employee_id = public._pauschal_my_employee_id())),
         pe.decided_at
  FROM public.pauschal_entries pe
  JOIN public.employees e ON e.id = pe.employee_id AND NOT e.is_demo
  LEFT JOIN public.employees creator ON creator.id = pe.created_by_employee_id
  WHERE pe.kind = 'pauschal'
    AND public.is_gf()
    AND public._pauschal_my_employee_id() = ANY (pe.required_approver_ids)
    AND (
      (pe.status = 'pending'
        AND NOT EXISTS (SELECT 1 FROM public.pauschal_approvals pa
                        WHERE pa.entry_id = pe.id
                          AND pa.approved_by_employee_id = public._pauschal_my_employee_id()))
      OR (pe.decided_at >= now() - interval '14 days')
    )
  ORDER BY (pe.status = 'pending') DESC, pe.created_at DESC
  LIMIT 80;
$$;

-- ===========================================================================
-- 9. No-Shows (Mig 081/106/082) — Mitarbeiter mit mobiles_arbeiten ausnehmen
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.get_team_no_shows(p_from date, p_to date)
RETURNS TABLE(employee_id uuid, employee_name text, day date,
              planned_from text, planned_to text, source text)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  WITH days AS (
    SELECT generate_series(p_from, LEAST(p_to, current_date - 1), interval '1 day')::date AS d
  ),
  shift_commit AS (
    SELECT ps.employee_id, ps.shift_date AS d,
           to_char(ps.start_time,'HH24:MI') AS pf,
           to_char(ps.end_time,'HH24:MI') AS pt,
           'shift'::text AS src
    FROM public.planned_shifts ps
    WHERE ps.shift_date BETWEEN p_from AND current_date - 1
  ),
  avail_commit AS (
    SELECT esr.employee_id,
           (esr.week_start + (k.idx - 1))::date AS d,
           esr.availability -> k.key ->> 'from' AS pf,
           esr.availability -> k.key ->> 'to' AS pt,
           'availability'::text AS src
    FROM public.employee_schedule_requests esr
    CROSS JOIN LATERAL (
      VALUES (1,'mon'),(2,'tue'),(3,'wed'),(4,'thu'),(5,'fri'),(6,'sat'),(7,'sun')
    ) AS k(idx, key)
    WHERE esr.availability -> k.key ->> 'from' IS NOT NULL
      AND (esr.week_start + (k.idx - 1))::date BETWEEN p_from AND current_date - 1
  ),
  commit_all AS (
    SELECT * FROM shift_commit
    UNION ALL
    SELECT * FROM avail_commit
  ),
  commit_dedup AS (
    SELECT DISTINCT ON (c.employee_id, c.d)
           c.employee_id, c.d, c.pf, c.pt, c.src
    FROM commit_all c
    JOIN days dy ON dy.d = c.d
    ORDER BY c.employee_id, c.d, (c.src = 'shift') DESC
  )
  SELECT cd.employee_id, e.name, cd.d, cd.pf, cd.pt, cd.src
  FROM commit_dedup cd
  JOIN public.employees e ON e.id = cd.employee_id
    AND NOT e.is_demo
    AND NOT e.mobiles_arbeiten
  WHERE public.is_chef()
    AND NOT EXISTS (
      SELECT 1 FROM public.time_entries te
      WHERE te.employee_id = cd.employee_id
        AND (te.checked_in_at AT TIME ZONE 'Europe/Berlin')::date = cd.d
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.absence_requests ar
      WHERE ar.employee_id = cd.employee_id
        AND ar.status = 'approved'
        AND cd.d BETWEEN ar.start_date AND ar.end_date
    )
  ORDER BY cd.d, e.name;
$$;

CREATE OR REPLACE FUNCTION public.get_employee_no_shows(
  p_employee_id uuid, p_from date, p_to date)
RETURNS TABLE(day date, planned_from text, planned_to text, source text)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  WITH days AS (
    SELECT generate_series(p_from, LEAST(p_to, current_date - 1), interval '1 day')::date AS d
  ),
  shift_commit AS (
    SELECT ps.shift_date AS d,
           to_char(ps.start_time,'HH24:MI') AS pf,
           to_char(ps.end_time,'HH24:MI') AS pt,
           'shift'::text AS src
    FROM public.planned_shifts ps
    WHERE ps.employee_id = p_employee_id
      AND ps.shift_date BETWEEN p_from AND current_date - 1
  ),
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
    -- Mobiles Arbeiten: kein No-Show (stempelt nie)
    AND NOT EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.id = p_employee_id AND e.mobiles_arbeiten
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.time_entries te
      WHERE te.employee_id = p_employee_id
        AND (te.checked_in_at AT TIME ZONE 'Europe/Berlin')::date = cd.d
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.absence_requests ar
      WHERE ar.employee_id = p_employee_id
        AND ar.status = 'approved'
        AND cd.d BETWEEN ar.start_date AND ar.end_date
    )
  ORDER BY cd.d;
$$;

CREATE OR REPLACE FUNCTION public.get_no_shows_internal()
RETURNS TABLE(employee_id uuid, employee_name text,
              planned_from text, planned_to text)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  WITH d AS (SELECT (now() AT TIME ZONE 'Europe/Berlin')::date - 1 AS day),
  shift_commit AS (
    SELECT ps.employee_id,
           to_char(ps.start_time,'HH24:MI') AS pf,
           to_char(ps.end_time,'HH24:MI') AS pt,
           'shift'::text AS src
    FROM public.planned_shifts ps, d WHERE ps.shift_date = d.day
  ),
  avail_commit AS (
    SELECT esr.employee_id,
           esr.availability -> k.key ->> 'from' AS pf,
           esr.availability -> k.key ->> 'to' AS pt,
           'availability'::text AS src
    FROM public.employee_schedule_requests esr, d
    CROSS JOIN LATERAL (
      VALUES (1,'mon'),(2,'tue'),(3,'wed'),(4,'thu'),(5,'fri'),(6,'sat'),(7,'sun')
    ) AS k(idx, key)
    WHERE (esr.week_start + (k.idx - 1)) = d.day
      AND esr.availability -> k.key ->> 'from' IS NOT NULL
  ),
  commit_all AS (
    SELECT * FROM shift_commit UNION ALL SELECT * FROM avail_commit
  ),
  commit_dedup AS (
    SELECT DISTINCT ON (c.employee_id) c.employee_id, c.pf, c.pt
    FROM commit_all c ORDER BY c.employee_id, (c.src='shift') DESC
  )
  SELECT cd.employee_id, e.name, cd.pf, cd.pt
  FROM commit_dedup cd
  JOIN public.employees e ON e.id = cd.employee_id
    AND NOT e.is_demo
    AND NOT e.mobiles_arbeiten
  CROSS JOIN d
  WHERE NOT EXISTS (
      SELECT 1 FROM public.time_entries te
      WHERE te.employee_id = cd.employee_id
        AND (te.checked_in_at AT TIME ZONE 'Europe/Berlin')::date = d.day)
    AND NOT EXISTS (
      SELECT 1 FROM public.absence_requests ar
      WHERE ar.employee_id = cd.employee_id AND ar.status = 'approved'
        AND d.day BETWEEN ar.start_date AND ar.end_date)
  ORDER BY e.name;
$$;
REVOKE ALL ON FUNCTION public.get_no_shows_internal() FROM public;
GRANT EXECUTE ON FUNCTION public.get_no_shows_internal() TO service_role;

-- ===========================================================================
-- 10. Haertung: anon/PUBLIC duerfen die neuen RPCs nicht ausfuehren
--     (Supabase-Default vergibt EXECUTE an PUBLIC; die Funktionen pruefen
--     zwar auth.uid(), aber es gibt keinen Grund fuer anonymen Zugriff).
-- ===========================================================================
REVOKE EXECUTE ON FUNCTION public.admin_set_mobiles_arbeiten(uuid, boolean) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.mobile_work_upsert(date, integer, text, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.mobile_work_delete(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.mobile_work_list(uuid, date, date) FROM PUBLIC, anon;
