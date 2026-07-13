-- Lager-Produkte: Ordner-Struktur.
-- Chef kann Ordner anlegen, umbenennen, löschen und Produkte hinein/heraus
-- verschieben. Rein additiv: bestehende Produkte bleiben ohne Ordner (folder_id
-- NULL) und erscheinen in der App unter "Ohne Ordner".

-- 1) Ordner-Tabelle -----------------------------------------------------------
create table if not exists public.reorder_product_folders (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  created_by uuid references public.employees(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.reorder_product_folders enable row level security;

-- Zugriff ausschließlich über SECURITY-DEFINER-RPCs; RLS als Defense-in-Depth
-- (nur Chef darf überhaupt lesen/schreiben).
drop policy if exists reorder_folders_chef_all on public.reorder_product_folders;
create policy reorder_folders_chef_all
  on public.reorder_product_folders
  for all
  using (public.is_chef())
  with check (public.is_chef());

-- 2) Zuordnung Produkt -> Ordner ---------------------------------------------
alter table public.reorder_products
  add column if not exists folder_id uuid
  references public.reorder_product_folders(id) on delete set null;

create index if not exists reorder_products_folder_id_idx
  on public.reorder_products (folder_id);

-- 3) Ordner-RPCs --------------------------------------------------------------

-- Alle Ordner + Anzahl aktiver Produkte je Ordner.
create or replace function public.get_reorder_folders()
returns table(id uuid, name text, created_at timestamptz, product_count integer)
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
  select f.id, f.name, f.created_at,
         (select count(*)::int from public.reorder_products p
            where p.folder_id = f.id and p.is_active) as product_count
  from public.reorder_product_folders f
  where public.is_chef()
  order by f.name asc;
$function$;

-- Neuen Ordner anlegen, gibt die ID zurück.
create or replace function public.create_reorder_folder(p_name text)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare v_me uuid; v_id uuid;
begin
  if not public.is_chef() then raise exception 'Keine Berechtigung'; end if;
  if p_name is null or btrim(p_name) = '' then
    raise exception 'Ordnername erforderlich';
  end if;
  select id into v_me from public.employees where auth_user_id = auth.uid();
  insert into public.reorder_product_folders (name, created_by)
  values (btrim(p_name), v_me)
  returning id into v_id;
  return v_id;
end; $function$;

-- Ordner umbenennen.
create or replace function public.rename_reorder_folder(p_id uuid, p_name text)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  if not public.is_chef() then raise exception 'Keine Berechtigung'; end if;
  if p_name is null or btrim(p_name) = '' then
    raise exception 'Ordnername erforderlich';
  end if;
  update public.reorder_product_folders
     set name = btrim(p_name)
   where id = p_id;
end; $function$;

-- Ordner löschen. Enthaltene Produkte wandern über ON DELETE SET NULL zurück
-- nach "Ohne Ordner" — sie werden NICHT gelöscht.
create or replace function public.delete_reorder_folder(p_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  if not public.is_chef() then raise exception 'Keine Berechtigung'; end if;
  delete from public.reorder_product_folders where id = p_id;
end; $function$;

-- Produkt in einen Ordner verschieben (p_folder_id NULL = kein Ordner).
create or replace function public.move_reorder_product(
  p_product_id uuid, p_folder_id uuid
)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  if not public.is_chef() then raise exception 'Keine Berechtigung'; end if;
  if p_folder_id is not null
     and not exists (select 1 from public.reorder_product_folders where id = p_folder_id) then
    raise exception 'Ordner existiert nicht';
  end if;
  update public.reorder_products
     set folder_id = p_folder_id
   where id = p_product_id;
end; $function$;

-- 4) Produktliste um folder_id erweitern -------------------------------------
-- RETURNS TABLE bekommt eine neue Spalte -> Funktion muss zuerst weg
-- (CREATE OR REPLACE erlaubt keine Rückgabetyp-Änderung).
drop function if exists public.get_reorder_products();
create or replace function public.get_reorder_products()
returns table(
  id uuid, title text, quantity integer, product_url text,
  created_at timestamptz, folder_id uuid
)
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
  select p.id, p.title, p.quantity, p.product_url, p.created_at, p.folder_id
  from public.reorder_products p
  where public.is_chef() and p.is_active
  order by p.created_at desc;
$function$;

grant execute on function public.get_reorder_folders() to authenticated;
grant execute on function public.create_reorder_folder(text) to authenticated;
grant execute on function public.rename_reorder_folder(uuid, text) to authenticated;
grant execute on function public.delete_reorder_folder(uuid) to authenticated;
grant execute on function public.move_reorder_product(uuid, uuid) to authenticated;
grant execute on function public.get_reorder_products() to authenticated;
