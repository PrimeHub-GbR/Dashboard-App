-- Nachbestellung: QR-Scan-Bestätigung.
-- Bevor ein gescanntes Produkt auf die Bestellliste kommt, soll die App den
-- Mitarbeiter fragen "Ist das wirklich das richtige Produkt?". Dafür braucht
-- die App eine read-only Auflösung der Produkt-ID -> Titel/Menge OHNE das
-- Produkt bereits hinzuzufügen. scan_reorder (fügt hinzu) läuft erst nach der
-- Bestätigung.

create or replace function public.lookup_reorder_product(p_product_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare v_prod record; v_list uuid; v_existing record;
begin
  select id, title, quantity, is_active into v_prod
    from public.reorder_products where id = p_product_id;
  if v_prod.id is null or not v_prod.is_active then
    return jsonb_build_object('ok', false, 'status', 'unknown');
  end if;

  -- Offene Liste NUR lesen (nie anlegen -> kein Seiteneffekt beim Nachschlagen).
  select id into v_list from public.reorder_lists
    where status = 'open' order by created_at limit 1;

  if v_list is not null then
    select added_by_name into v_existing from public.reorder_requests
      where list_id = v_list and product_id = p_product_id limit 1;
    if found then
      return jsonb_build_object('ok', true, 'status', 'already',
        'title', v_prod.title, 'quantity', v_prod.quantity,
        'added_by_name', v_existing.added_by_name);
    end if;
  end if;

  return jsonb_build_object('ok', true, 'status', 'found',
    'title', v_prod.title, 'quantity', v_prod.quantity);
end; $function$;

grant execute on function public.lookup_reorder_product(uuid) to authenticated;
