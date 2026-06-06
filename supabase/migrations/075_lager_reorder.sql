-- Migration 075: Lager-Nachbestellung per QR-Code.
-- reorder_products: Material-Katalog (per Dashboard angelegt, QR-Etikett).
-- reorder_requests: Nachbestell-Liste. Pro Produkt nur EINE aktive Anfrage
-- (open/ordered) — verhindert doppelte Eintraege beim Scannen.
--
-- Ablauf: Dashboard legt Produkt an (Titel, Menge, Link) -> QR-Etikett drucken.
-- Mitarbeiter scannt QR in der App -> scan_reorder fuegt eine offene Anfrage
-- hinzu (oder meldet "schon vorhanden"). Chef sieht die Liste, quittiert
-- "bestellt" (ordered) und "eingebucht" (received).

CREATE TABLE IF NOT EXISTS public.reorder_products (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title       text NOT NULL,
  quantity    integer NOT NULL DEFAULT 1,
  product_url text,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  created_by  uuid REFERENCES public.employees(id) ON DELETE SET NULL
);
ALTER TABLE public.reorder_products ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.reorder_requests (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id   uuid NOT NULL REFERENCES public.reorder_products(id) ON DELETE CASCADE,
  status       text NOT NULL DEFAULT 'open' CHECK (status IN ('open','ordered','received')),
  quantity     integer NOT NULL,
  added_by     uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  added_by_name text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  ordered_by   uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  ordered_at   timestamptz,
  received_by  uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  received_at  timestamptz
);
ALTER TABLE public.reorder_requests ENABLE ROW LEVEL SECURITY;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_active_reorder
  ON public.reorder_requests (product_id) WHERE status IN ('open','ordered');
CREATE INDEX IF NOT EXISTS idx_reorder_requests_status
  ON public.reorder_requests (status, created_at DESC);

CREATE OR REPLACE FUNCTION public.scan_reorder(p_product_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp' AS $$
DECLARE
  v_emp uuid; v_name text; v_prod record; v_existing record; v_id uuid;
BEGIN
  v_emp := public.current_employee_id();
  SELECT id, title, quantity, is_active INTO v_prod
    FROM public.reorder_products WHERE id = p_product_id;
  IF v_prod.id IS NULL OR NOT v_prod.is_active THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unknown');
  END IF;

  SELECT r.id, r.status, r.added_by_name, e.name AS by_name INTO v_existing
    FROM public.reorder_requests r
    LEFT JOIN public.employees e ON e.id = r.added_by
    WHERE r.product_id = p_product_id AND r.status IN ('open','ordered')
    LIMIT 1;
  IF v_existing.id IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'status', 'already',
      'title', v_prod.title, 'quantity', v_prod.quantity,
      'request_status', v_existing.status,
      'added_by_name', COALESCE(v_existing.added_by_name, v_existing.by_name));
  END IF;

  SELECT name INTO v_name FROM public.employees WHERE id = v_emp;
  BEGIN
    INSERT INTO public.reorder_requests (product_id, status, quantity, added_by, added_by_name)
      VALUES (p_product_id, 'open', v_prod.quantity, v_emp, v_name)
      RETURNING id INTO v_id;
  EXCEPTION WHEN unique_violation THEN
    SELECT r.added_by_name, r.status INTO v_existing
      FROM public.reorder_requests r
      WHERE r.product_id = p_product_id AND r.status IN ('open','ordered') LIMIT 1;
    RETURN jsonb_build_object('ok', true, 'status', 'already',
      'title', v_prod.title, 'quantity', v_prod.quantity,
      'request_status', COALESCE(v_existing.status, 'open'),
      'added_by_name', v_existing.added_by_name);
  END;

  RETURN jsonb_build_object('ok', true, 'status', 'added',
    'title', v_prod.title, 'quantity', v_prod.quantity);
END; $$;
GRANT EXECUTE ON FUNCTION public.scan_reorder(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_reorder_list()
RETURNS TABLE(id uuid, product_id uuid, title text, quantity integer,
  product_url text, status text, added_by_name text,
  created_at timestamptz, ordered_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp' AS $$
  SELECT r.id, r.product_id, p.title, r.quantity, p.product_url, r.status,
         r.added_by_name, r.created_at, r.ordered_at
  FROM public.reorder_requests r
  JOIN public.reorder_products p ON p.id = r.product_id
  WHERE r.status IN ('open','ordered')
  ORDER BY (r.status = 'open') DESC, r.created_at DESC;
$$;
GRANT EXECUTE ON FUNCTION public.get_reorder_list() TO authenticated;

CREATE OR REPLACE FUNCTION public.get_reorder_history()
RETURNS TABLE(id uuid, title text, quantity integer, added_by_name text,
  received_at timestamptz, received_by_name text)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp' AS $$
  SELECT r.id, p.title, r.quantity, r.added_by_name, r.received_at, rb.name
  FROM public.reorder_requests r
  JOIN public.reorder_products p ON p.id = r.product_id
  LEFT JOIN public.employees rb ON rb.id = r.received_by
  WHERE public.is_chef()
    AND r.status = 'received'
    AND r.received_at > now() - interval '30 days'
  ORDER BY r.received_at DESC
  LIMIT 100;
$$;
GRANT EXECUTE ON FUNCTION public.get_reorder_history() TO authenticated;

CREATE OR REPLACE FUNCTION public.mark_reorder_ordered(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp' AS $$
BEGIN
  IF NOT public.is_chef() THEN RAISE EXCEPTION 'Keine Berechtigung'; END IF;
  UPDATE public.reorder_requests
    SET status='ordered', ordered_by=public.current_employee_id(), ordered_at=now()
    WHERE id=p_id AND status='open';
  IF NOT FOUND THEN RAISE EXCEPTION 'Eintrag nicht gefunden oder nicht offen'; END IF;
END; $$;
GRANT EXECUTE ON FUNCTION public.mark_reorder_ordered(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.mark_reorder_received(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp' AS $$
BEGIN
  IF NOT public.is_chef() THEN RAISE EXCEPTION 'Keine Berechtigung'; END IF;
  UPDATE public.reorder_requests
    SET status='received', received_by=public.current_employee_id(), received_at=now()
    WHERE id=p_id AND status IN ('open','ordered');
  IF NOT FOUND THEN RAISE EXCEPTION 'Eintrag nicht gefunden'; END IF;
END; $$;
GRANT EXECUTE ON FUNCTION public.mark_reorder_received(uuid) TO authenticated;
