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
- [ ] Liste zeigt standardmäßig nur Verstöße (Filter "Alle" optional umschaltbar)
- [ ] Maximal 3 Excel-Dateien pro Händler (älteste wird automatisch gelöscht)
- [ ] Excel enthält ALLE geprüften Titel (nicht nur Verstöße), markiert mit ✅ (OK) / ❌ (Verstoß) / ⚠️ (kein VLB-Preis)
- [ ] Excel-Spalten: Markierung, Datum/Uhrzeit, Händler, Buchtitel, Preis Verkäufer, Preis VLB, ISBN13, Amazon-Link, Status
- [ ] Scheduler (Vercel Cron alle 10min) triggert N8N-Workflow automatisch

## Tech Design

### Tabellen
- `buchpreischeck_sellers` — Händler-Konfiguration + Schedule
  - Migration 036: `schedule_mode` ('weekly'|'interval'), `run_time` (HH:MM, Europe/Berlin), `max_pages` (NULL = alle Seiten)
- `buchpreischeck_runs` — Durchlauf-Protokoll
  - Migration 036: `proxy_bytes` (tatsächliches Proxy-Volumen), `pages_scraped`
- `buchpreischeck_items` — Einzelne Buchergebnisse pro Durchlauf

### DataImpulse-Proxy (Amazon-Scraping)
- Amazon blockt direkte Server-IPs → Scraping läuft über DataImpulse-Residential-Proxy (`gw.dataimpulse.com:823`, DE via `__cr.de`).
- N8N: Proxy am Node „Amazon Pages" (`{{ $env.DATAIMPULSE_PROXY_URL }}`). Fallback bei HTTPS-Tunneling-Fehler: Community-Node `n8n-nodes-httpsoverproxy`.
- Backend (`sellers/verify`): Proxy via `undici` ProxyAgent (`DATAIMPULSE_PROXY_URL`).

### Scheduling (pro Händler)
- `weekly`: feste Wochentage + Uhrzeit (z.B. „Fr 03:00"). `interval`: Legacy (10min–24h).
- Helper: `src/lib/buchpreisbindung-schedule.ts` (`calculateNextRunAt`).

### Kosten (Schätzung + Messung)
- Helper: `src/lib/buchpreisbindung-cost.ts` (~1 €/GB, ~120 KB/Seite).
- Vorab-Schätzung pro Lauf (Run-Dialog) + Monatsschätzung; echter Verbrauch aus `proxy_bytes` (CostSection).

### VLB-Token (2-Token-Limit)
- VLB erlaubt nur 2 parallele Logins; Token MUSS per Logout zurückgegeben werden.
- N8N: `VLB-Logout` läuft direkt nach den Lookups (Node „Collect VLB" → „VLB-Logout"), unabhängig von Upload/Callback; Zwischen-Nodes `continueOnFail`.
- Dashboard: scheduler + run starten nie mehr als 2 gleichzeitige Läufe (Guard auf `status='running'`); scheduler triggert max. 1 Händler pro Tick.

### N8N Workflow (ID `3Kg7lHQhNtzD21aI`)
- Key: `buchpreisbindung-check` (Datei: `docs/buchpreisbindung-workflow.json`, Anleitung: `docs/n8n-buchpreisbindung-proxy-anleitung.md`)
- Scraping: `amazon.de/s?me={seller_id}&i=stripbooks&page=N&rh=p_36:{low}-{high}` über DataImpulse-Proxy.
- **Amazon-Pagination-Limit**: Die `/s`-Suche gibt pro Suche nur ~20 Seiten (~320 Treffer) frei, egal wie hoch `totalResultCount` ist. Workaround: Bestand in **Preisbereiche** (`rh=p_36`, ~31 disjunkte 1-€-Schritte 8–35 €, grob außen) zerlegen; je Bereich erst Seite 1 als Probe (liest `totalResultCount`), dann Restseiten 2..N. So sind alle Treffer disjunkt durchblätterbar (~100 % statt ~15 %).
- **HTTPS-over-Proxy**: Scraping-Nodes (`Probe Bereiche`, `Amazon Pages`) nutzen den Community-Node `n8n-nodes-httpsoverproxy` mit `connectionPool.keepAlive: false` → frische DataImpulse-IP pro Anfrage (der Standard-HTTP-Node tunnelt HTTPS über HTTP-Proxy nicht zuverlässig).
- **⚠️ Offenes Thema (Stand 2026-05-29)**: Vom n8n-Server aus blockt Amazon einen Großteil der Anfragen mit 503 (Server-IP-Reputation), während dieselben Anfragen per `curl` von extern ~80 % Erfolg haben. Abdeckung daher aktuell niedrig; Optionen: IP-Cooldown abwarten, DataImpulse Premium oder Scraping-Service. Architektur ist fertig, hängt nur an der Server-Block-Rate.
- **Loop**: `Loop Over Items` → `loop`-Ausgang füttert Batch-VLB-Lookup, `done`-Ausgang sammelt (Reihenfolge der Ausgänge ist kontraintuitiv: 0=done, 1=loop).
- **Nur Neuware**: gebrauchte Angebote werden im Parse anhand der Zustands-Labels übersprungen.
- Verstoß-Logik: `VERSTOSS`, wenn Amazon-Preis **unter** VLB-Festpreis (Unterbieten).
- VLB: Login → Batch-Lookups → Logout; Callback mit `metadata.items[]` (inkl. `is_compliant`) + `proxy_bytes` + `pages_scraped`.

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
