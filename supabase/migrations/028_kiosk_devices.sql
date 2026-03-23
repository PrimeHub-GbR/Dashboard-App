-- Kiosk-Geräteverwaltung
-- Jedes registrierte Gerät bekommt ein eigenes UUID-Token (statt shared secret)
create table if not exists kiosk_devices (
  id            uuid primary key default gen_random_uuid(),
  token         uuid not null unique default gen_random_uuid(),
  label         text,                          -- optionaler Gerätename (z.B. "iPad Lager")
  user_agent    text,                          -- Browser/OS des Geräts bei Registrierung
  registered_at timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),
  is_active     boolean not null default true
);

alter table kiosk_devices enable row level security;

-- Nur Service-Role darf lesen/schreiben (kein direkter Client-Zugriff)
create policy "service role only" on kiosk_devices
  using (false);
