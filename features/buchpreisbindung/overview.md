# Buchpreisbindung-Prüfung

**Status:** Deployed  
**Tab:** `/dashboard/buchpreisbindung`  
**Erstellt:** 2026-05-18  

## Übersicht

Automatisiertes Tool zur Prüfung der Buchpreisbindung (BuchPrG) für Amazon-Händler.  
Ruft das Schaufenster eines Händlers ab, vergleicht Verkaufspreise mit offiziellen VLB-Preisen und dokumentiert Verstöße.

## User Stories

- Als Nutzer kann ich einen Amazon-Händler via Seller-ID hinzufügen und verifizieren
- Als Nutzer kann ich Prüfungsintervall (10min–24h) und Wochentage konfigurieren
- Als Nutzer sehe ich die Ergebnisse des letzten Durchlaufs direkt im Dashboard
- Als Nutzer kann ich die letzten 3 Excel-Exports pro Händler herunterladen
- Als Nutzer kann ich einen Prüfdurchlauf manuell starten

## Acceptance Criteria

- [ ] Händler-ID-Format validiert (`/^A[A-Z0-9]{13}$/`)
- [ ] "Prüfen"-Button testet ob Händler auf Amazon.de existiert
- [ ] Intervall-Dropdown: 10min, 30min, 1h, 2h, 6h, 12h, 24h
- [ ] Wochentage als Checkboxen (Mo–So)
- [ ] Letzter Durchlauf inline in Tabelle angezeigt (ISBN13, Titel, Preis Verkäufer, Preis VLB, Status)
- [ ] Filter "Nur Verstöße" verfügbar
- [ ] Maximal 3 Excel-Dateien pro Händler (älteste wird automatisch gelöscht)
- [ ] Excel-Spalten: Datum/Uhrzeit, Händler, Buchtitel, Preis Verkäufer, Preis VLB, ISBN13, Amazon-Link, Status
- [ ] Scheduler (Vercel Cron alle 10min) triggert N8N-Workflow automatisch

## Tech Design

### Tabellen
- `buchpreischeck_sellers` — Händler-Konfiguration + Schedule
- `buchpreischeck_runs` — Durchlauf-Protokoll
- `buchpreischeck_items` — Einzelne Buchergebnisse pro Durchlauf

### N8N Workflow
- Key: `buchpreisbindung-check`
- Scraping: `amazon.de/s?me={seller_id}&i=stripbooks` (Browser-UA)
- VLB: Identisches Login/Batch-Pattern wie EAN2BBP-Workflow
- Callback mit `metadata.items[]` für DB-Speicherung

### API Routes
- `POST /api/buchpreisbindung/sellers/verify` — Händler-Existenz prüfen
- `GET/POST /api/buchpreisbindung/sellers` — Konfiguration verwalten
- `PATCH/DELETE /api/buchpreisbindung/sellers/[id]` — Einzelnen Händler bearbeiten
- `POST /api/buchpreisbindung/run` — Manueller Run
- `GET /api/buchpreisbindung/runs` — Run-History
- `GET /api/buchpreisbindung/runs/[id]/download` — Excel-Download (Signed URL)
- `POST /api/buchpreisbindung/callback/[id]` — N8N sendet Ergebnisse
- `GET /api/buchpreisbindung/scheduler` — Vercel Cron Trigger (alle 10min)

### Storage
- Bucket: `workflow-results`
- Pfad: `buchpreischeck/{amazon_seller_id}/{run_id}.xlsx`

## Zukünftige Erweiterungen
- E-Mail-Versand bei Verstößen (Titel + relevante Daten direkt per E-Mail)
