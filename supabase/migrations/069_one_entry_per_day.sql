-- Migration 069: Pro Tag gilt genau EIN Eintrag — Arbeitszeit ODER Abwesenheit.
--
-- Bisher konnten Arbeitszeitplanung (employee_schedule_requests.availability)
-- und Abwesenheit (absence_requests) am selben Tag gleichzeitig existieren.
-- Das ist ein Widerspruch. Regel: der zuletzt gestellte Eintrag gilt, der
-- andere wird verworfen.
--
-- Dieses DB-Sicherheitsnetz sorgt dafür, dass beim Anlegen einer Abwesenheit
-- die geplante Arbeitszeit der überlappenden Tage entfernt wird (nur ab heute —
-- Vergangenheit bleibt unverändert, Historie ist nicht verfälschbar).
-- Die Gegenrichtung (Arbeitszeit ersetzt eine noch offene Abwesenheit) wird in
-- der App über withdraw_partial_pending gelöst.

-- ============================================ Helfer: geplante Tage entfernen

-- Entfernt aus employee_schedule_requests.availability alle Tages-Keys im
-- Zeitraum [GREATEST(p_start, heute) .. p_end]. Wochenzeilen werden einzeln
-- angefasst; nur tatsächlich gesetzte Tage werden geleert.
CREATE OR REPLACE FUNCTION public._strip_planned_days(
  p_emp uuid, p_start date, p_end date
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_from  date := GREATEST(p_start, CURRENT_DATE);
  v_keys  text[] := ARRAY['mon','tue','wed','thu','fri','sat','sun'];
  r       RECORD;
  v_avail jsonb;
  v_day   date;
  v_key   text;
  v_changed boolean;
  i       integer;
BEGIN
  IF v_from > p_end THEN RETURN; END IF;

  FOR r IN
    SELECT id, week_start, availability
    FROM public.employee_schedule_requests
    WHERE employee_id = p_emp
      AND week_start <= p_end
      AND week_start + 6 >= v_from
  LOOP
    v_avail := COALESCE(r.availability, '{}'::jsonb);
    v_changed := false;
    FOR i IN 0..6 LOOP
      v_day := r.week_start + i;
      IF v_day >= v_from AND v_day <= p_end THEN
        v_key := v_keys[i + 1];
        IF v_avail ? v_key AND jsonb_typeof(v_avail -> v_key) <> 'null' THEN
          v_avail := v_avail - v_key;
          v_changed := true;
        END IF;
      END IF;
    END LOOP;
    IF v_changed THEN
      UPDATE public.employee_schedule_requests
      SET availability = v_avail
      WHERE id = r.id;
    END IF;
  END LOOP;
END;
$$;

-- ===================================== submit_absence_request um Strip ergänzt

CREATE OR REPLACE FUNCTION public.submit_absence_request(
  p_start date, p_end date, p_type text, p_note text DEFAULT NULL::text
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_emp uuid;
  v_id  uuid;
  v_req integer;
  v_remaining integer;
BEGIN
  v_emp := public.current_employee_id();
  IF v_emp IS NULL THEN RAISE EXCEPTION 'Kein Mitarbeiter-Datensatz'; END IF;
  IF p_type NOT IN ('urlaub','krankheit','sonstige') THEN
    RAISE EXCEPTION 'Ungültiger Abwesenheitstyp';
  END IF;
  IF p_end < p_start THEN RAISE EXCEPTION 'Enddatum vor Startdatum'; END IF;

  -- Nur der letzte Antrag gilt: frühere, noch nicht entschiedene (pending)
  -- Anträge mit überlappendem Zeitraum verwerfen.
  DELETE FROM public.absence_requests
  WHERE employee_id = v_emp
    AND status = 'pending'
    AND start_date <= p_end
    AND end_date >= p_start;

  IF p_type = 'urlaub' THEN
    v_req := public._absence_workdays(v_emp, p_start, p_end);
    SELECT remaining INTO v_remaining
      FROM public.get_vacation_balance(v_emp, EXTRACT(YEAR FROM p_start)::int);
    IF v_req > COALESCE(v_remaining, 0) THEN
      RAISE EXCEPTION 'Nicht genug Resturlaub: % Arbeitstag(e) beantragt, nur % offen',
        v_req, COALESCE(v_remaining, 0)
        USING ERRCODE = '22023';
    END IF;
  END IF;

  INSERT INTO public.absence_requests (employee_id, start_date, end_date, type, note)
  VALUES (v_emp, p_start, p_end, p_type, NULLIF(btrim(coalesce(p_note,'')),''))
  RETURNING id INTO v_id;

  -- Ein Eintrag pro Tag: geplante Arbeitszeit der betroffenen Tage entfernen.
  PERFORM public._strip_planned_days(v_emp, p_start, p_end);

  RETURN v_id;
END;
$function$;

-- ===================================== chef_assign_absence um Strip ergänzt

CREATE OR REPLACE FUNCTION public.chef_assign_absence(
  p_employee_id uuid,
  p_start date,
  p_end date,
  p_type text,
  p_note text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_chef uuid;
  v_id   uuid;
  v_req  integer;
  v_remaining integer;
BEGIN
  IF NOT public.is_chef() THEN RAISE EXCEPTION 'Keine Berechtigung'; END IF;
  IF p_type NOT IN ('urlaub','krankheit','sonstige') THEN
    RAISE EXCEPTION 'Ungültiger Abwesenheitstyp';
  END IF;
  IF p_end < p_start THEN RAISE EXCEPTION 'Enddatum vor Startdatum'; END IF;

  SELECT id INTO v_chef FROM public.employees WHERE auth_user_id = auth.uid();

  IF p_type = 'urlaub' THEN
    v_req := public._absence_workdays(p_employee_id, p_start, p_end);
    SELECT remaining INTO v_remaining
      FROM public.get_vacation_balance(p_employee_id, EXTRACT(YEAR FROM p_start)::int);
    IF v_req > COALESCE(v_remaining, 0) THEN
      RAISE EXCEPTION 'Nicht genug Resturlaub: % Arbeitstag(e), nur % offen',
        v_req, COALESCE(v_remaining, 0) USING ERRCODE = '22023';
    END IF;
  END IF;

  INSERT INTO public.absence_requests
    (employee_id, start_date, end_date, type, note, status, reviewed_by, reviewed_at)
  VALUES
    (p_employee_id, p_start, p_end, p_type,
     NULLIF(btrim(coalesce(p_note,'')),''), 'approved', v_chef, now())
  RETURNING id INTO v_id;

  -- Ein Eintrag pro Tag: geplante Arbeitszeit der betroffenen Tage entfernen.
  PERFORM public._strip_planned_days(p_employee_id, p_start, p_end);

  RETURN v_id;
END;
$$;
