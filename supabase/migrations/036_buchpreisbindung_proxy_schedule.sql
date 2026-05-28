-- Migration: 036_buchpreisbindung_proxy_schedule
-- Feature: Buchpreisbindung — Wochen-Scheduling + DataImpulse-Proxy-Kostenmessung
--
-- Erweitert die Händler-Konfiguration um ein echtes Wochen-Scraping (Wochentag + Uhrzeit)
-- und um eine Seiten-Obergrenze pro Lauf. Erweitert das Durchlauf-Protokoll um die
-- tatsächlich über den Proxy geladenen Bytes und die Anzahl gescrapter Seiten, damit
-- die echten DataImpulse-Kosten gemessen werden können.

ALTER TABLE buchpreischeck_sellers
  ADD COLUMN IF NOT EXISTS schedule_mode TEXT NOT NULL DEFAULT 'weekly'
    CHECK (schedule_mode IN ('weekly','interval')),
  ADD COLUMN IF NOT EXISTS run_time TEXT NOT NULL DEFAULT '03:00',  -- HH:MM, Europe/Berlin
  ADD COLUMN IF NOT EXISTS max_pages INTEGER;                        -- NULL = alle Seiten (Workflow-Safety-Cap greift)

ALTER TABLE buchpreischeck_runs
  ADD COLUMN IF NOT EXISTS proxy_bytes BIGINT,                       -- tatsächlich über Proxy geladen
  ADD COLUMN IF NOT EXISTS pages_scraped INTEGER;
