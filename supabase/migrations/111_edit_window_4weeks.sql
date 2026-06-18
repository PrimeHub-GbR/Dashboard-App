-- Migration 111: 4-Wochen-Bearbeitungsfenster fuer Stempelzeiten + Pauschalen
--
-- Fachlich: Der Chef darf Stempelzeiten UND pauschale Stunden nur maximal
-- 4 Wochen (28 Tage) rueckwirkend nachtragen/korrigieren. Alles, was weiter in
-- der Vergangenheit liegt, ist nicht mehr bearbeitbar. Dies wird SERVERSEITIG in
-- den schreibenden RPCs erzwungen (Single Source of Truth) — die App-/Web-UI
-- spiegelt die Regel nur, ist aber nicht die Schutzschicht.
--
-- Stichtag: das Datum des Eintrags (Berlin-Datum des checked_in bzw. pauschal.datum)
-- muss >= (heute - 28 Tage) sein. Heute = Europe/Berlin.
--
-- Betroffene RPCs:
--   * admin_upsert_time_entry (Mig 048)  -> p_checked_in-Datum pruefen
--   * admin_delete_time_entry (Mig 048)  -> Datum des bestehenden Eintrags pruefen
--   * pauschal_create        (Mig 107)  -> p_datum pruefen
--
-- Hinweis: Es gibt KEINE Ausnahme fuer Manager/GF — die Regel gilt fuer alle.

-- ===========================================================================
-- Helper: erlaubte fruehste Bearbeitungs-Grenze (Berlin-Datum, heute - 28 Tage)
-- ===========================================================================
CREATE OR REPLACE FUNCTION public._edit_window_floor()
  RETURNS date
  LANGUAGE sql STABLE
  SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT ((now() AT TIME ZONE 'Europe/Berlin')::date - 28);
$$;

COMMENT ON FUNCTION public._edit_window_floor() IS
  'Fruehestes bearbeitbares Datum: heute (Europe/Berlin) minus 28 Tage. Aelter -> nicht mehr editierbar.';

-- ===========================================================================
-- admin_upsert_time_entry — wie Mig 048, plus 4-Wochen-Pruefung
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.admin_upsert_time_entry(
  p_id          UUID,
  p_employee_id UUID,
  p_checked_in  TIMESTAMPTZ,
  p_checked_out TIMESTAMPTZ DEFAULT NULL,
  p_note        TEXT        DEFAULT NULL
)
RETURNS public.time_entries
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row   public.time_entries;
  v_gross INTEGER;
  v_break INTEGER := 0;
  v_day   DATE;
BEGIN
  IF NOT public.is_admin_or_manager() THEN
    RAISE EXCEPTION 'insufficient_privilege: nur Admin/Manager'
      USING ERRCODE = '42501';
  END IF;

  -- 4-Wochen-Fenster: das Berlin-Datum des Eintrags muss innerhalb von 28 Tagen
  -- liegen. Gilt fuer INSERT (neues Datum) und UPDATE (neues Datum).
  v_day := (p_checked_in AT TIME ZONE 'Europe/Berlin')::date;
  IF v_day < public._edit_window_floor() THEN
    RAISE EXCEPTION 'Bearbeitung nur bis 4 Wochen rueckwirkend moeglich (ab %).',
      public._edit_window_floor() USING ERRCODE = '22023';
  END IF;

  IF p_checked_out IS NOT NULL THEN
    IF p_checked_out <= p_checked_in THEN
      RAISE EXCEPTION 'checked_out muss nach checked_in liegen'
        USING ERRCODE = '22023';
    END IF;
    v_gross := GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (p_checked_out - p_checked_in)) / 60)::INTEGER);
    v_break := CASE
                 WHEN v_gross <= 360 THEN 0
                 WHEN v_gross <= 540 THEN 30
                 ELSE 45
               END;
  END IF;

  IF p_id IS NULL THEN
    INSERT INTO public.time_entries (
      employee_id, checked_in_at, checked_out_at, break_minutes,
      note, auth_method, needs_review, corrected_by, corrected_at
    ) VALUES (
      p_employee_id, p_checked_in, p_checked_out, v_break,
      p_note, 'manual', true, auth.uid(), now()
    )
    RETURNING * INTO v_row;
  ELSE
    -- Auch das ALTE Datum eines bestehenden Eintrags muss noch im Fenster liegen,
    -- damit ganz alte Eintraege nicht "aus dem Fenster" verschoben werden koennen.
    SELECT (checked_in_at AT TIME ZONE 'Europe/Berlin')::date INTO v_day
    FROM public.time_entries WHERE id = p_id;
    IF v_day IS NOT NULL AND v_day < public._edit_window_floor() THEN
      RAISE EXCEPTION 'Dieser Eintrag liegt ausserhalb des 4-Wochen-Fensters und ist nicht mehr editierbar.'
        USING ERRCODE = '22023';
    END IF;

    UPDATE public.time_entries SET
      checked_in_at  = p_checked_in,
      checked_out_at = p_checked_out,
      break_minutes  = v_break,
      note           = COALESCE(p_note, note),
      needs_review   = true,
      corrected_by   = auth.uid(),
      corrected_at   = now(),
      updated_at     = now()
    WHERE id = p_id
    RETURNING * INTO v_row;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'time_entry not found: %', p_id USING ERRCODE = 'P0002';
    END IF;
  END IF;

  RETURN v_row;
END;
$$;

-- ===========================================================================
-- admin_delete_time_entry — wie Mig 048, plus 4-Wochen-Pruefung
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.admin_delete_time_entry(p_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_day DATE;
BEGIN
  IF NOT public.is_admin_or_manager() THEN
    RAISE EXCEPTION 'insufficient_privilege: nur Admin/Manager'
      USING ERRCODE = '42501';
  END IF;

  SELECT (checked_in_at AT TIME ZONE 'Europe/Berlin')::date INTO v_day
  FROM public.time_entries WHERE id = p_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'time_entry not found: %', p_id USING ERRCODE = 'P0002';
  END IF;

  IF v_day < public._edit_window_floor() THEN
    RAISE EXCEPTION 'Loeschen nur bis 4 Wochen rueckwirkend moeglich (ab %).',
      public._edit_window_floor() USING ERRCODE = '22023';
  END IF;

  DELETE FROM public.time_entries WHERE id = p_id;
END;
$$;

-- ===========================================================================
-- pauschal_create — wie Mig 107, plus 4-Wochen-Pruefung auf p_datum
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.pauschal_create(
  p_employee_id uuid,
  p_minutes     integer,
  p_datum       date,
  p_grund       text DEFAULT ''
)
  RETURNS public.pauschal_entries
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_row        public.pauschal_entries;
  v_creator    uuid := public._pauschal_my_employee_id();
  v_creator_gf boolean := public.is_gf();
  v_required   uuid[];
BEGIN
  IF NOT public.is_chef() THEN
    RAISE EXCEPTION 'insufficient_privilege: nur Manager/GF' USING ERRCODE = '42501';
  END IF;
  IF p_minutes IS NULL OR p_minutes <= 0 OR p_minutes % 30 <> 0 THEN
    RAISE EXCEPTION 'minutes muss > 0 und ein Vielfaches von 30 sein' USING ERRCODE = '22023';
  END IF;
  IF p_datum IS NULL THEN
    RAISE EXCEPTION 'datum erforderlich' USING ERRCODE = '22023';
  END IF;
  -- 4-Wochen-Fenster: Pauschalen nur bis 28 Tage rueckwirkend.
  IF p_datum < public._edit_window_floor() THEN
    RAISE EXCEPTION 'Pauschalen nur bis 4 Wochen rueckwirkend moeglich (ab %).',
      public._edit_window_floor() USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.employees WHERE id = p_employee_id) THEN
    RAISE EXCEPTION 'employee not found: %', p_employee_id USING ERRCODE = 'P0002';
  END IF;

  SELECT COALESCE(array_agg(e.id), '{}')
  INTO v_required
  FROM public.employees e
  WHERE e.position = 'geschaeftsfuehrer'
    AND e.is_active
    AND (NOT v_creator_gf OR e.id <> v_creator);

  INSERT INTO public.pauschal_entries (
    employee_id, minutes, datum, grund, status,
    required_approver_ids, created_by, created_by_employee_id
  ) VALUES (
    p_employee_id, p_minutes, p_datum, COALESCE(btrim(p_grund), ''),
    CASE WHEN array_length(v_required, 1) IS NULL THEN 'approved' ELSE 'pending' END,
    v_required, auth.uid(), v_creator
  )
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

COMMENT ON FUNCTION public.pauschal_create(uuid, integer, date, text) IS
  'Legt einen Pauschal-Eintrag an (Manager/GF). Max. 4 Wochen rueckwirkend. Bestimmt benoetigte GF-Genehmiger; 0 noetige -> sofort approved.';
