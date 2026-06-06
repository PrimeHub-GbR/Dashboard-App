-- Migration 076: Bestelllisten-Zyklus statt Einzel-Status.
-- Eine offene Liste sammelt gescannte Produkte. Chef friert sie per "Bestellt"
-- ein (open -> ordered), danach beginnt automatisch eine neue offene Liste.
-- "Geliefert" (ordered -> delivered) archiviert die Liste.

CREATE TABLE IF NOT EXISTS public.reorder_lists (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status       text NOT NULL DEFAULT 'open' CHECK (status IN ('open','ordered','delivered')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  ordered_at   timestamptz,
  ordered_by   uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  delivered_at timestamptz,
  delivered_by uuid REFERENCES public.employees(id) ON DELETE SET NULL
);
ALTER TABLE public.reorder_lists ENABLE ROW LEVEL SECURITY;
-- Max EINE offene Liste gleichzeitig.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_one_open_list
  ON public.reorder_lists (status) WHERE status = 'open';

-- reorder_requests an eine Liste binden, Einzel-Status entfernen.
ALTER TABLE public.reorder_requests
  ADD COLUMN IF NOT EXISTS list_id uuid REFERENCES public.reorder_lists(id) ON DELETE CASCADE;

DO $$
DECLARE v_list uuid;
BEGIN
  IF EXISTS (SELECT 1 FROM public.reorder_requests WHERE list_id IS NULL) THEN
    INSERT INTO public.reorder_lists (status) VALUES ('open') RETURNING id INTO v_list;
    UPDATE public.reorder_requests SET list_id = v_list WHERE list_id IS NULL;
  END IF;
END $$;

DROP INDEX IF EXISTS public.uniq_active_reorder;
DROP INDEX IF EXISTS public.idx_reorder_requests_status;
ALTER TABLE public.reorder_requests
  DROP COLUMN IF EXISTS status,
  DROP COLUMN IF EXISTS ordered_by,
  DROP COLUMN IF EXISTS ordered_at,
  DROP COLUMN IF EXISTS received_by,
  DROP COLUMN IF EXISTS received_at;
ALTER TABLE public.reorder_requests ALTER COLUMN list_id SET NOT NULL;
-- Pro Liste jedes Produkt nur einmal (Duplikat-Schutz).
CREATE UNIQUE INDEX IF NOT EXISTS uniq_list_product
  ON public.reorder_requests (list_id, product_id);

-- Alte Einzel-Status-RPCs entfernen.
DROP FUNCTION IF EXISTS public.get_reorder_list();
DROP FUNCTION IF EXISTS public.get_reorder_history();
DROP FUNCTION IF EXISTS public.mark_reorder_ordered(uuid);
DROP FUNCTION IF EXISTS public.mark_reorder_received(uuid);

-- Offene Liste holen/anlegen (lazy: neue Liste entsteht beim ersten Scan).
CREATE OR REPLACE FUNCTION public._reorder_open_list()
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp' AS $$
DECLARE v_id uuid;
BEGIN
  SELECT id INTO v_id FROM public.reorder_lists WHERE status='open' ORDER BY created_at LIMIT 1;
  IF v_id IS NULL THEN
    BEGIN
      INSERT INTO public.reorder_lists (status) VALUES ('open') RETURNING id INTO v_id;
    EXCEPTION WHEN unique_violation THEN
      SELECT id INTO v_id FROM public.reorder_lists WHERE status='open' ORDER BY created_at LIMIT 1;
    END;
  END IF;
  RETURN v_id;
END; $$;

CREATE OR REPLACE FUNCTION public.scan_reorder(p_product_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp' AS $$
DECLARE v_emp uuid; v_name text; v_prod record; v_list uuid; v_existing record;
BEGIN
  v_emp := public.current_employee_id();
  SELECT id, title, quantity, is_active INTO v_prod FROM public.reorder_products WHERE id=p_product_id;
  IF v_prod.id IS NULL OR NOT v_prod.is_active THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unknown');
  END IF;
  v_list := public._reorder_open_list();

  SELECT added_by_name INTO v_existing FROM public.reorder_requests
    WHERE list_id=v_list AND product_id=p_product_id LIMIT 1;
  IF FOUND THEN
    RETURN jsonb_build_object('ok', true, 'status', 'already',
      'title', v_prod.title, 'quantity', v_prod.quantity,
      'added_by_name', v_existing.added_by_name);
  END IF;

  SELECT name INTO v_name FROM public.employees WHERE id=v_emp;
  BEGIN
    INSERT INTO public.reorder_requests (list_id, product_id, quantity, added_by, added_by_name)
      VALUES (v_list, p_product_id, v_prod.quantity, v_emp, v_name);
  EXCEPTION WHEN unique_violation THEN
    SELECT added_by_name INTO v_existing FROM public.reorder_requests
      WHERE list_id=v_list AND product_id=p_product_id LIMIT 1;
    RETURN jsonb_build_object('ok', true, 'status', 'already',
      'title', v_prod.title, 'quantity', v_prod.quantity,
      'added_by_name', v_existing.added_by_name);
  END;
  RETURN jsonb_build_object('ok', true, 'status', 'added',
    'title', v_prod.title, 'quantity', v_prod.quantity);
END; $$;
GRANT EXECUTE ON FUNCTION public.scan_reorder(uuid) TO authenticated;

-- Offene Liste (mit Items).
CREATE OR REPLACE FUNCTION public.get_reorder_open()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp' AS $$
  SELECT COALESCE((
    SELECT jsonb_build_object(
      'list_id', l.id, 'created_at', l.created_at,
      'items', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'request_id', r.id, 'product_id', r.product_id, 'title', p.title,
          'quantity', r.quantity, 'added_by_name', r.added_by_name,
          'created_at', r.created_at) ORDER BY r.created_at)
        FROM public.reorder_requests r JOIN public.reorder_products p ON p.id=r.product_id
        WHERE r.list_id=l.id), '[]'::jsonb))
    FROM public.reorder_lists l WHERE l.status='open' ORDER BY l.created_at LIMIT 1
  ), jsonb_build_object('list_id', null, 'items', '[]'::jsonb));
$$;
GRANT EXECUTE ON FUNCTION public.get_reorder_open() TO authenticated;

-- Bestellte (eingefrorene) Listen, warten auf Lieferung.
CREATE OR REPLACE FUNCTION public.get_reorder_ordered()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp' AS $$
  SELECT COALESCE(jsonb_agg(x.obj ORDER BY x.ordered_at DESC), '[]'::jsonb)
  FROM (
    SELECT l.ordered_at, jsonb_build_object(
      'list_id', l.id, 'ordered_at', l.ordered_at, 'ordered_by_name', ob.name,
      'items', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('title', p.title, 'quantity', r.quantity,
          'added_by_name', r.added_by_name) ORDER BY p.title)
        FROM public.reorder_requests r JOIN public.reorder_products p ON p.id=r.product_id
        WHERE r.list_id=l.id), '[]'::jsonb)) AS obj
    FROM public.reorder_lists l LEFT JOIN public.employees ob ON ob.id=l.ordered_by
    WHERE l.status='ordered'
  ) x;
$$;
GRANT EXECUTE ON FUNCTION public.get_reorder_ordered() TO authenticated;

-- Archiv: gelieferte Listen (letzte 30).
CREATE OR REPLACE FUNCTION public.get_reorder_archive()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp' AS $$
  SELECT COALESCE(jsonb_agg(x.obj ORDER BY x.delivered_at DESC), '[]'::jsonb)
  FROM (
    SELECT l.delivered_at, jsonb_build_object(
      'list_id', l.id, 'delivered_at', l.delivered_at, 'delivered_by_name', db.name,
      'items', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('title', p.title, 'quantity', r.quantity)
          ORDER BY p.title)
        FROM public.reorder_requests r JOIN public.reorder_products p ON p.id=r.product_id
        WHERE r.list_id=l.id), '[]'::jsonb)) AS obj
    FROM public.reorder_lists l LEFT JOIN public.employees db ON db.id=l.delivered_by
    WHERE l.status='delivered'
    ORDER BY l.delivered_at DESC LIMIT 30
  ) x;
$$;
GRANT EXECUTE ON FUNCTION public.get_reorder_archive() TO authenticated;

-- Chef: einzelnes Produkt aus der offenen Liste entfernen.
CREATE OR REPLACE FUNCTION public.reorder_remove_item(p_request_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp' AS $$
BEGIN
  IF NOT public.is_chef() THEN RAISE EXCEPTION 'Keine Berechtigung'; END IF;
  DELETE FROM public.reorder_requests
    WHERE id=p_request_id
      AND list_id IN (SELECT id FROM public.reorder_lists WHERE status='open');
  IF NOT FOUND THEN RAISE EXCEPTION 'Eintrag nicht gefunden oder Liste nicht offen'; END IF;
END; $$;
GRANT EXECUTE ON FUNCTION public.reorder_remove_item(uuid) TO authenticated;

-- Chef: offene Liste als bestellt einfrieren.
CREATE OR REPLACE FUNCTION public.reorder_order_list(p_list_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp' AS $$
BEGIN
  IF NOT public.is_chef() THEN RAISE EXCEPTION 'Keine Berechtigung'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.reorder_requests WHERE list_id=p_list_id) THEN
    RAISE EXCEPTION 'Leere Liste kann nicht bestellt werden';
  END IF;
  UPDATE public.reorder_lists
    SET status='ordered', ordered_by=public.current_employee_id(), ordered_at=now()
    WHERE id=p_list_id AND status='open';
  IF NOT FOUND THEN RAISE EXCEPTION 'Liste nicht gefunden oder nicht offen'; END IF;
END; $$;
GRANT EXECUTE ON FUNCTION public.reorder_order_list(uuid) TO authenticated;

-- Chef: bestellte Liste als geliefert archivieren.
CREATE OR REPLACE FUNCTION public.reorder_deliver_list(p_list_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp' AS $$
BEGIN
  IF NOT public.is_chef() THEN RAISE EXCEPTION 'Keine Berechtigung'; END IF;
  UPDATE public.reorder_lists
    SET status='delivered', delivered_by=public.current_employee_id(), delivered_at=now()
    WHERE id=p_list_id AND status='ordered';
  IF NOT FOUND THEN RAISE EXCEPTION 'Liste nicht gefunden oder nicht bestellt'; END IF;
END; $$;
GRANT EXECUTE ON FUNCTION public.reorder_deliver_list(uuid) TO authenticated;
