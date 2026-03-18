# Feature: Rebuy Buch-Scraper

**Tab:** `/dashboard/rebuy`
**Status:** Deployed
**Spec erstellt:** 2026-03-16

---

## Übersicht

Wöchentlicher automatischer Scraper für rebuy.de, der alle verfügbaren Bücher (alle Kategorien, alle Zustände) sammelt und als Excel-Datei im Dashboard bereitstellt. Der Scraper läuft autonom auf einem Proxmox-LXC-Container und kommuniziert über eine gesicherte API mit dem Dashboard.

---

## Ziele

- Alle Bücher von rebuy.de scrapen: EAN, Titel, Zustand, Menge, Preis, Link
- Automatisch jeden Sonntag ausführen (konfigurierbar über Dashboard)
- Excel-Datei im Dashboard herunterladbar
- Live-Status des Containers und des Scraping-Vorgangs sichtbar

---

## Datenfelder (Excel-Ausgabe)

| Spalte | Beschreibung |
|--------|-------------|
| EAN | 13-stellige Produktnummer |
| Titel | Buchtitel |
| Zustand | Sehr gut / Gut / Akzeptabel |
| Menge | Verfügbare Einheiten |
| Verkaufspreis | Preis in EUR |
| Link | Direkte URL zu rebuy.de |
| Scrape-Datum | Zeitpunkt der Datenerhebung |

---

## Tech Design

### Infrastruktur

- **Scraper-Container:** Proxmox LXC (Debian 12), Python 3.11+, Flask, systemd
- **Netzwerk:** Cloudflare Tunnel → öffentliche HTTPS-URL ohne Port-Forwarding
- **Scheduling:** systemd Timer mit `Persistent=true` (holt verpasste Runs nach)
- **Storage:** Supabase Storage Bucket `rebuy-results`

### Datenbank

**Tabelle `rebuy_settings`**
```sql
id UUID PK
schedule TEXT          -- systemd OnCalendar-Format, z.B. "Sun *-*-* 02:00:00"
container_url TEXT     -- z.B. "https://rebuy-scraper.domain.com"
updated_at TIMESTAMPTZ
```

**Tabelle `rebuy_scrapes`**
```sql
id UUID PK
scrape_date DATE
file_path TEXT         -- Pfad im rebuy-results Bucket
status TEXT            -- pending | running | success | failed
row_count INTEGER
progress_pages INTEGER
total_pages INTEGER
eta_seconds INTEGER
started_at TIMESTAMPTZ
finished_at TIMESTAMPTZ
error_message TEXT
created_at TIMESTAMPTZ
```

### API Routes (Dashboard)

| Route | Methode | Beschreibung |
|-------|---------|-------------|
| `/api/rebuy` | GET | Liste aller Scrapes |
| `/api/rebuy/notify` | POST | Scraper meldet fertiges Ergebnis (HMAC) |
| `/api/rebuy/status` | POST | Scraper meldet Live-Fortschritt (HMAC) |
| `/api/rebuy/container` | GET | Proxy → Container /health |
| `/api/rebuy/trigger` | POST | Manueller Start |
| `/api/rebuy/settings` | GET/PUT | Schedule-Einstellungen |
| `/api/rebuy/[id]/download` | GET | Signed URL für Excel |

### Container API (Flask, localhost:5000)

| Route | Beschreibung |
|-------|-------------|
| `GET /health` | Liveness-Check |
| `POST /trigger` | Scrape starten |
| `GET /status` | Aktueller Scraping-Status |

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

- [ ] Dashboard zeigt Container-Status (online/offline, letzter Heartbeat)
- [ ] Dashboard zeigt Scraping-Fortschritt live (Seiten, ETA) wenn ein Run läuft
- [ ] Scraping-Intervall im Dashboard konfigurierbar
- [ ] "Jetzt starten" Button triggert manuellen Scrape
- [ ] Nach erfolgreichem Scrape: Download-Button für Excel-Datei
- [ ] Archiv-Tabelle zeigt letzte Runs (Datum, Anzahl Bücher, Dauer, Status)
- [ ] systemd Timer mit `Persistent=true` — kein Run wird übersprungen
- [ ] Container überlebt Neustart ohne manuellen Eingriff

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
