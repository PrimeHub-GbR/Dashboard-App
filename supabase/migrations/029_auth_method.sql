-- auth_method für Zeiterfassung + WebAuthn-Felder für Kiosk-Geräte

-- 1. auth_method Spalte in time_entries
alter table time_entries
  add column if not exists auth_method text not null default 'pin'
    check (auth_method in ('pin', 'fingerprint'));

-- 2. WebAuthn-Felder in kiosk_devices
alter table kiosk_devices
  add column if not exists webauthn_credential_id text,         -- base64url encoded credential ID
  add column if not exists webauthn_public_key     text,        -- base64url encoded COSE public key
  add column if not exists webauthn_counter        integer not null default 0;

-- 3. Challenge-Speicher (kurzlebig, max. 2 Minuten)
create table if not exists webauthn_challenges (
  id           uuid        primary key default gen_random_uuid(),
  device_token uuid        not null,
  employee_id  uuid        references employees(id) on delete cascade,  -- null bei Registration
  challenge    text        not null,
  expires_at   timestamptz not null default (now() + interval '2 minutes'),
  used         boolean     not null default false
);

create index if not exists idx_webauthn_challenges_expires
  on webauthn_challenges (expires_at);

alter table webauthn_challenges enable row level security;

create policy "service role only" on webauthn_challenges
  using (false);

-- 4. Cleanup-Funktion für abgelaufene Challenges
create or replace function cleanup_webauthn_challenges() returns void as $$
begin
  delete from webauthn_challenges where expires_at < now();
end;
$$ language plpgsql;
