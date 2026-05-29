-- ScrapeOps-Migration: Amazon-Scraping läuft jetzt über die ScrapeOps Proxy-API
-- (credit-basiert) statt über den DataImpulse-Proxy (GB-basiert).
-- Neue Spalte für die pro Lauf verbrauchten ScrapeOps-Credits (~1 Credit/Request).
-- proxy_bytes/pages_scraped bleiben erhalten (Legacy/Fallback bzw. Request-Anzahl).

alter table buchpreischeck_runs add column if not exists scrapeops_credits integer;
comment on column buchpreischeck_runs.scrapeops_credits is 'Verbrauchte ScrapeOps-Credits pro Lauf (~1 Credit/Request). Ersetzt proxy_bytes (DataImpulse-Legacy).';
