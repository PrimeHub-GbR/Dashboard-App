# Feature: Rebuy Buch-Scraper

**Tab:** `/dashboard/rebuy`
**Status:** Deployed
**Spec erstellt:** 2026-03-16

---

## Übersicht

Scraper für rebuy.de, der alle Bücher im Zustand **"exzellent"** über die Listing-Pages sammelt (kein Produktseiten-Crawl) und als Excel-Datei im Dashboard bereitstellt. Der Scraper läuft autonom auf einem Proxmox-LXC-Container, scrapt alle Anfragen über **ScrapeOps Proxy** (IP-Rotation + Anti-Bot) und kommuniziert über eine gesicherte API mit dem Dashboard.

User kann pro Lauf zwischen zwei Modi wählen:
- **Bestseller** — nur die Rebuy-Subkategorie `/kaufen/buecher-bestseller-buecher` (~50–86 Pages, ~5 Min, ~$0,03)
- **Komplett** — alle Bücher-Subkategorien (~2.500–3.000 Pages, ~2 h Free-Plan, ~$1)

---

## Ziele

- Alle Bücher im Zustand "exzellent" von rebuy.de scrapen: EAN/ISBN, Titel, Autor, Preise, Verfügbarkeit, Link
- Automatisch ausführen (Schedule + Default-Modus über Dashboard konfigurierbar)
- User kann pro manuellem Lauf den Modus überschreiben
- Excel-Datei im Dashboard herunterladbar
- Live-Status des Containers + ScrapeOps-Credits sichtbar

---

## Datenfelder (Excel-Ausgabe)

Quelle: Listing-Page SSR-State (`<script id="ry-inject">.productListViewDto.searchResponse.products.docs[]`).

| Spalte | Quelle (JSON) | Beschreibung |
|--------|--------------|--------------|
| EAN | `identifiers[type=EAN].value` | 13-stellige Produktnummer |
| ISBN | `identifiers[type=ISBN].value` | 10-stellige ISBN |
| Titel | `name` | Buchtitel |
| Autor(en) | `authors` | Komma-getrennt |
| Verlag | `publisher` | — |
| Format | `book_format` | Taschenbuch / Gebunden / Audio-CD / … |
| Sprache | `language` | — |
| Preis exzellent (EUR) | `price_min / 100` | "Ab"-Preis für Zustand exzellent |
| Ankaufspreis (EUR) | `price_purchase / 100` | Was Rebuy für das Buch zahlt |
| UVP (EUR) | `price_recommended / 100` | Empfohlener Verkaufspreis |
| Lieferbar | `has_variant_in_stock` | bool |
| Product-ID | `id` | Rebuy interne ID |
| Link | `https://www.rebuy.de/i,{id}/buecher/{product_sanitized_name}` | Produktseite |
| Modus | `mode` | bestseller / komplett |
| Scrape-Datum | `scrape_date` | Zeitpunkt der Datenerhebung |

---

## Tech Design

### Scrape-Strategie (NEU seit Migration 038)

**Vorher (verworfen):** Sitemap-Crawl → 2,4 Mio Produktseiten direkt vom LXC-Host → IP-Ban nach ~2.000 Requests, ~40 Tage für Vollscan.

**Jetzt:** Listing-Pages mit Filter `f_variant_availability=a1` (exzellent) über ScrapeOps Proxy:
- Pro Listing-Page: 29 vollständige Produkte im SSR-State (`<script id="ry-inject">`)
- Modus **Bestseller**: 1 Subkategorie × bis Seite 86
- Modus **Komplett**: ~30 Subkategorien × bis Seite 86 + Dedup auf `product_id`
- Pagination-Limit ist 86 Seiten pro Filter (Server gibt 302 zurück)
- ScrapeOps löst Cloudflare-WAF + IP-Rotation transparent

### Infrastruktur

- **Scraper-Container:** Proxmox LXC (Debian 12), Python 3.11+, Flask, systemd
- **Proxy:** ScrapeOps Proxy-API (`proxy.scrapeops.io/v1/?api_key=…&url=…&country=de`), Free-Plan = 1 Verbindung gleichzeitig
- **Fallback-Proxy:** DataImpulse (optional, in Settings konfigurierbar — nur falls ScrapeOps-Credits leer)
- **Netzwerk:** Cloudflare Tunnel → öffentliche HTTPS-URL ohne Port-Forwarding
- **Scheduling:** systemd Timer mit `Persistent=true` (holt verpasste Runs nach), Modus aus `rebuy_settings.default_mode`
- **Storage:** Supabase Storage Bucket `rebuy-results`

### Datenbank

**Tabelle `rebuy_settings`**
```sql
id UUID PK
schedule TEXT          -- systemd OnCalendar-Format, z.B. "Sun *-*-* 02:00:00"
container_url TEXT     -- z.B. "https://rebuy-scraper.domain.com"
backup_proxy_url TEXT  -- DataImpulse-Fallback (optional)
default_mode TEXT      -- 'bestseller' | 'komplett' — Default für Cron + UI (Migration 038)
updated_at TIMESTAMPTZ
```

**Tabelle `rebuy_scrapes`**
```sql
id UUID PK
scrape_date DATE
file_path TEXT             -- Pfad im rebuy-results Bucket
status TEXT                -- pending | running | success | failed | paused
mode TEXT                  -- 'bestseller' | 'komplett' (Migration 038)
row_count INTEGER
progress_pages INTEGER
total_pages INTEGER
eta_seconds INTEGER
scrapeops_credits INTEGER  -- pro Lauf verbrauchte Credits (Migration 038)
started_at TIMESTAMPTZ
finished_at TIMESTAMPTZ
error_message TEXT
created_at TIMESTAMPTZ
```

### API Routes (Dashboard)

| Route | Methode | Beschreibung |
|-------|---------|-------------|
| `/api/rebuy` | GET | Liste aller Scrapes |
| `/api/rebuy/notify` | POST | Scraper meldet fertiges Ergebnis + `scrapeops_credits` (HMAC) |
| `/api/rebuy/status` | POST | Scraper meldet Live-Fortschritt (HMAC) |
| `/api/rebuy/container` | GET | Proxy → Container /health |
| `/api/rebuy/trigger` | POST | Manueller Start mit optionalem `{mode}`-Body |
| `/api/rebuy/settings` | GET/PUT | Schedule + `default_mode` + Container-URL |
| `/api/rebuy/scrapeops-usage` | GET | Live-Credits-Abfrage (ScrapeOps Account) |
| `/api/rebuy/[id]/download` | GET | Signed URL für Excel |

### Container API (Flask, localhost:5000)

| Route | Beschreibung |
|-------|-------------|
| `GET /health` | Liveness-Check |
| `POST /trigger` | Scrape starten — Body: `{scrape_id, notify_url, status_url, mode}` |
| `POST /schedule` | Schedule-Update (fire-and-forget) |
| `POST /mode` | Default-Modus-Update (fire-and-forget, für Cron-Selbst-Trigger) |
| `POST /proxy` | Fallback-Proxy-URL-Update |
| `GET /status` | Aktueller Scraping-Status |

### Kostenmodell

[`src/lib/rebuy-cost.ts`](../../src/lib/rebuy-cost.ts) — 1 Credit/Listing-Page (Standard-Domain bei ScrapeOps), $0.36 / 1.000 Credits (Starter-Plan):

| Modus | Pages (Schätzung) | Credits | $/Lauf | Dauer Free-Plan |
|-------|-------------------|---------|--------|----------------|
| Bestseller | ~86 | ~86 | ~$0,03 | ~3 Min |
| Komplett | ~2.800 | ~2.800 | ~$1,01 | ~70 Min |

Free-Plan: 1.000 Credits/Monat → ~10 Bestseller-Läufe ODER 1 Bestseller + Komplett kombiniert.
Starter $9/Monat: 25.000 Credits → ~280 Bestseller- oder ~8 Komplett-Läufe.

---

## Sicherheit

- SSH-Key-Auth für Claude-Zugriff auf Container (Ed25519, keine Passphrase)
- Dedicated User `rebuy` (kein root)
- Alle Secrets in `/opt/rebuy-scraper/.env` (chmod 600)
- Flask lauscht nur auf localhost — Cloudflare Tunnel als einziger Eingang
- HMAC-Signierung für alle Callbacks (Dashboard ↔ Container)
- Kein Secret in git — nur `.env.example` committed

---

## Acceptance Criteria

- [x] Dashboard zeigt Container-Status (online/offline, letzter Heartbeat)
- [x] Dashboard zeigt Scraping-Fortschritt live (Seiten, ETA) wenn ein Run läuft
- [x] Scraping-Intervall im Dashboard konfigurierbar
- [x] "Jetzt starten" Button triggert manuellen Scrape
- [x] Nach erfolgreichem Scrape: Download-Button für Excel-Datei
- [x] Archiv-Tabelle zeigt letzte Runs (Datum, Anzahl Bücher, Dauer, Status)
- [x] systemd Timer mit `Persistent=true` — kein Run wird übersprungen
- [x] Container überlebt Neustart ohne manuellen Eingriff
- [ ] (NEU 038) Default-Modus in Settings (`bestseller` / `komplett`) konfigurierbar
- [ ] (NEU 038) Manueller Lauf kann Default-Modus per Dropdown am Trigger-Button überschreiben
- [ ] (NEU 038) Live-Anzeige verbleibender ScrapeOps-Credits in Container-Status-Karte
- [ ] (NEU 038) Archiv-Tabelle zeigt zusätzlich Modus + verbrauchte Credits pro Lauf
- [ ] (NEU 038) Container scrapt ausschließlich Listing-Pages über ScrapeOps (keine Produktseiten mehr)

## Deployment

**Production URL:** https://dashboard.primehubgbr.com
**Deployed:** 2026-03-17
**Build:** Ready
**Vercel Deployment:** https://app-qf753rjog-primehubgbr-2551s-projects.vercel.app

### Update 2026-03-17 — Cancel-Endpoint + UI-Rewrite
- Neuer Endpoint `POST /api/rebuy/cancel` zum Abbrechen laufender Scrapes
- RebuyClient.tsx: Wochentag-Checkboxen für Schedule, Abbrechen-Button, ETA-Anzeige, Archiv-Filter

### Update 2026-03-17 — Verlauf leeren
- Neuer Endpoint `DELETE /api/rebuy/clear-history` loescht alle abgeschlossenen Scrape-Eintraege (status = success | failed)
- RebuyClient.tsx: "Verlauf leeren" Button im Archiv-Card-Header (sichtbar wenn completedScrapes > 0)
- **Vercel Deployment:** https://app-l1tserudo-primehubgbr-2551s-projects.vercel.app

### Update 2026-03-17 — Vorbereitung-State, ETA-Filter, Erweitert-Sektion
- pages=0: zeigt "Vorbereitung läuft…" mit erklärendem Text und pulsierendem Progress statt 0% + falscher ETA
- ETA nur sichtbar wenn pages>0 und eta_seconds<=259200 (72h), unrealistische Platzhalterwerte werden gefiltert
- Container-URL in einklappbarer "Erweitert"-Sektion versteckt
- **Vercel Deployment:** https://app-cpr4dujyr-primehubgbr-2551s-projects.vercel.app

### Update 2026-03-18 — Abschließen-Button + Finalize-API
- Neuer Endpoint `POST /api/rebuy/finalize` erzeugt vorzeitig eine Excel-Ausgabe aus den bisher gescrapten Daten
- RebuyClient.tsx: "Abschließen"-Button mit isFinalizing-State, sichtbar waehrend laufender Scrapes
- **Vercel Deployment:** https://app-n4xy086jz-primehubgbr-2551s-projects.vercel.app

### Update 2026-05-30 — Listing-Strategie + ScrapeOps + Modus-Wahl
- **Wechsel der Scrape-Strategie:** Statt 2,4 Mio. Produktseiten werden nur noch Listing-Pages (`/kaufen/{subcat}?f_variant_availability=a1`) gescrapt. Jede Page enthält 29 vollständige Produkte im SSR-State.
- **ScrapeOps Proxy** ersetzt die direkten Container-Calls und DataImpulse als primären Proxy. DataImpulse bleibt als optionaler Fallback in den Settings.
- **Modus-Wahl Bestseller / Komplett:** Default in Settings, pro manuellem Lauf per Dropdown am Trigger-Button überschreibbar.
- **Migration 038:** neue Spalten `rebuy_settings.default_mode`, `rebuy_scrapes.mode`, `rebuy_scrapes.scrapeops_credits`.
- **Neue Route** `GET /api/rebuy/scrapeops-usage` — Live-Credits aus ScrapeOps-API (1:1-Klon von Buchpreisbindung).
- **Trigger-Route** sendet jetzt `{scrape_id, notify_url, status_url, mode}` an den Container (`boost_level` entfernt).
- **Settings-Route** akzeptiert `default_mode` und informiert den Container per `POST /mode` (fire-and-forget).
- **Notify-Route** akzeptiert `scrapeops_credits` und persistiert sie im Lauf.
- **Cost-Library** [`src/lib/rebuy-cost.ts`](../../src/lib/rebuy-cost.ts) — 1 Credit/Request, $0.36/1.000 Credits.
- **RebuyClient.tsx:**
  - Boost-Selector entfernt, ersetzt durch Modus-Toggle (Bestseller/Komplett) + Live-Kosten-Schätzung
  - Container-Status-Karte zeigt verbleibende ScrapeOps-Credits + Reset-Datum
  - "Letztes Ergebnis"-Karte + Archiv-Tabelle zeigen Modus + verbrauchte Credits
  - Trigger als Split-Button (Default-Modus links + Dropdown rechts zum Überschreiben)
  - Stale-Warning-Threshold abhängig vom Default-Modus (2 Tage bei Bestseller, 8 bei Komplett)
- **Container-Anleitung:** `docs/rebuy-container-scrapeops-anleitung.md`
