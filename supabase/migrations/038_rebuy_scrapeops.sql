-- Migration 038: Rebuy-Scraper auf ScrapeOps + Listing-Strategie
--
-- Umstellung des Rebuy-Scrapers:
--   - alt: 2.4 Mio Produktseiten via DataImpulse (Boost-Level/GB-Modell)
--   - neu: Listing-Pages via ScrapeOps Proxy-API (~1 Credit/Request)
--          mit User-Auswahl Bestseller / Komplett
--
-- Neue Spalten:
--   rebuy_settings.default_mode     Default-Modus für Cron + UI ('bestseller' | 'komplett')
--   rebuy_scrapes.mode              Modus dieses Laufs
--   rebuy_scrapes.scrapeops_credits Pro Lauf verbrauchte ScrapeOps-Credits

-- ------------------------------------------------------------
-- rebuy_settings: Default-Modus
-- ------------------------------------------------------------
alter table rebuy_settings
  add column if not exists default_mode text not null default 'bestseller'
    check (default_mode in ('bestseller', 'komplett'));

comment on column rebuy_settings.default_mode is
  'Default-Modus für Cron-Läufe und UI-Vorbelegung: bestseller (~50–200 Pages) oder komplett (~2500–3000 Pages, ~60% der ~129k exzellent-Bücher).';

-- ------------------------------------------------------------
-- rebuy_scrapes: Modus + Credits pro Lauf
-- ------------------------------------------------------------
alter table rebuy_scrapes
  add column if not exists mode text not null default 'komplett'
    check (mode in ('bestseller', 'komplett'));

alter table rebuy_scrapes
  add column if not exists scrapeops_credits integer;

comment on column rebuy_scrapes.mode is
  'Modus dieses Laufs: bestseller (Rebuy-Bestseller-Subkategorie) oder komplett (alle Bücher-Subkategorien × bis Seite 86).';

comment on column rebuy_scrapes.scrapeops_credits is
  'Verbrauchte ScrapeOps-Credits pro Lauf (~1 Credit/Listing-Page-Request). Wird vom Container im notify-Callback gemeldet.';
