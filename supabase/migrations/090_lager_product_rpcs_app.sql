-- Chef kann Lager-Produkte direkt aus der App anlegen + auflisten.
CREATE OR REPLACE FUNCTION public.create_reorder_product(
  p_title text, p_quantity int, p_url text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE v_me uuid; v_id uuid;
BEGIN
  IF NOT public.is_chef() THEN RAISE EXCEPTION 'Keine Berechtigung'; END IF;
  IF p_title IS NULL OR btrim(p_title) = '' THEN RAISE EXCEPTION 'Titel erforderlich'; END IF;
  IF p_quantity IS NULL OR p_quantity < 1 THEN RAISE EXCEPTION 'Menge muss >= 1 sein'; END IF;
  SELECT id INTO v_me FROM public.employees WHERE auth_user_id = auth.uid();
  INSERT INTO public.reorder_products (title, quantity, product_url, created_by)
  VALUES (btrim(p_title), p_quantity, NULLIF(btrim(COALESCE(p_url,'')), ''), v_me)
  RETURNING id INTO v_id;
  RETURN v_id;
END; $$;
GRANT EXECUTE ON FUNCTION public.create_reorder_product(text, int, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_reorder_products()
RETURNS TABLE(id uuid, title text, quantity int, product_url text, created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT p.id, p.title, p.quantity, p.product_url, p.created_at
  FROM public.reorder_products p
  WHERE public.is_chef() AND p.is_active
  ORDER BY p.created_at DESC;
$$;
GRANT EXECUTE ON FUNCTION public.get_reorder_products() TO authenticated;
