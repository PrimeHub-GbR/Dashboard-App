-- Migration 039: Auto-Scrape-Toggle + Credit-Limit pro Lauf
--
-- Zwei neue Features:
--   1. auto_scrape_enabled: User kann das automatische Scrapen (systemd-Timer)
--      über das Dashboard komplett ein-/ausschalten.
--   2. credit_limit: Beim manuellen Start kann eine maximale Anzahl an
--      ScrapeOps-Credits angegeben werden. Bei Erreichen stoppt der Scraper
--      sauber, baut Excel aus den Teildaten und setzt status='success' mit
--      Vermerk in error_message.

alter table rebuy_settings
  add column if not exists auto_scrape_enabled boolean not null default true;

comment on column rebuy_settings.auto_scrape_enabled is
  'Wenn false, ist der systemd-Timer im Container deaktiviert (kein Cron-Lauf). Wochentage/Uhrzeit bleiben erhalten und werden bei Re-Enable wieder verwendet.';

alter table rebuy_scrapes
  add column if not exists credit_limit integer;

comment on column rebuy_scrapes.credit_limit is
  'Optionales Credit-Limit für diesen Lauf (NULL = kein Limit). Container stoppt sauber bei Erreichen und meldet status=success mit Vermerk in error_message.';
