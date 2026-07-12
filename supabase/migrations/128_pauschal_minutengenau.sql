-- 128: Pauschale Stunden minutengenau
-- Bisher: minutes > 0 UND Vielfaches von 30 (Migration 107).
-- Neu: jede Minutenanzahl > 0 ist erlaubt.

ALTER TABLE public.pauschal_entries
  DROP CONSTRAINT pauschal_entries_minutes_check;

ALTER TABLE public.pauschal_entries
  ADD CONSTRAINT pauschal_entries_minutes_check CHECK (minutes > 0);

-- pauschal_create: 30-Minuten-Guard entfernen (Rest unveraendert, Stand Mig 111).
CREATE OR REPLACE FUNCTION public.pauschal_create(p_employee_id uuid, p_minutes integer, p_datum date, p_grund text DEFAULT ''::text)
 RETURNS pauschal_entries
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_row        public.pauschal_entries;
  v_creator    uuid := public._pauschal_my_employee_id();
  v_creator_gf boolean := public.is_gf();
  v_required   uuid[];
BEGIN
  IF NOT public.is_chef() THEN
    RAISE EXCEPTION 'insufficient_privilege: nur Manager/GF' USING ERRCODE = '42501';
  END IF;
  IF p_minutes IS NULL OR p_minutes <= 0 THEN
    RAISE EXCEPTION 'minutes muss > 0 sein' USING ERRCODE = '22023';
  END IF;
  IF p_datum IS NULL THEN
    RAISE EXCEPTION 'datum erforderlich' USING ERRCODE = '22023';
  END IF;
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
$function$;
