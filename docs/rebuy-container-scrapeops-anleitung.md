# Rebuy-Container — Umbau auf ScrapeOps + Listing-Strategie

Anfänger-freundliche Schritt-für-Schritt-Anleitung zum Umbau des Rebuy-Scrapers im LXC-Container (192.168.178.139) auf die neue Listing-Strategie über ScrapeOps Proxy.

**Was sich ändert (großes Bild):**
- Statt 2,4 Mio. Produktseiten werden nur noch ~3.000 Listing-Pages gescrapt
- Statt direkter Calls vom LXC-Host gehen alle Anfragen über die ScrapeOps Proxy-API
- Der Container kennt jetzt zwei Modi: **Bestseller** (1 Subkategorie) und **Komplett** (alle Subkategorien)
- Der Dashboard-Trigger sendet `{mode}` mit, der systemd-Cron-Lauf nutzt einen lokal gespeicherten Default-Modus

---

## Schritt 0 — Vorbereitung

### 0.1 — In den Container einloggen
```bash
ssh -i ~/.ssh/rebuy_lxc rebuy@192.168.178.139
cd /opt/rebuy-scraper
```

### 0.2 — Backup der bestehenden Scripts
```bash
mkdir -p /opt/rebuy-scraper/backups/$(date +%Y%m%d)
cp scraper.py sitemap_scraper.py app.py backups/$(date +%Y%m%d)/ 2>/dev/null || true
```

### 0.3 — Laufende Scrapes stoppen
```bash
# Falls noch der alte Scraper läuft:
sudo systemctl stop rebuy-scraper.service
sudo systemctl stop rebuy-scraper.timer  # erst stoppen, bevor wir umbauen
ps aux | grep -E "scraper.py|sitemap_scraper.py" | grep -v grep
# Falls noch Prozesse laufen: kill -TERM <PID>
```

### 0.4 — Python-Abhängigkeiten prüfen
```bash
source /opt/rebuy-scraper/venv/bin/activate
pip install requests openpyxl flask
```

---

## Schritt 1 — ScrapeOps API-Key holen

1. Öffne https://scrapeops.io im Browser
2. Anmelden (Free-Plan, 1.000 Credits/Monat genügt für ~10 Bestseller-Läufe)
3. Dashboard → **Proxy API** → API-Key kopieren
4. Im Container in die `.env`-Datei eintragen:

```bash
nano /opt/rebuy-scraper/.env
```

Hinzufügen:
```
SCRAPEOPS_API_KEY=<DEIN_KEY>
DEFAULT_MODE=bestseller
```

Speichern (`Ctrl+O`, `Enter`, `Ctrl+X`).

### 1.1 — Probe-Call zur Verifikation
```bash
curl -s "https://proxy.scrapeops.io/v1/?api_key=$(grep SCRAPEOPS_API_KEY .env | cut -d= -f2)&url=https%3A%2F%2Fwww.rebuy.de%2Fkaufen%2Fbuecher%3Ff_variant_availability%3Da1&country=de" \
  | grep -c "ry-inject"
```
**Erwartet: `1`** → ScrapeOps liefert die Listing-Page mit SSR-State. Wenn `0`: Key prüfen.

---

## Schritt 2 — Subkategorien-Liste einmalig erheben

Die Liste der Bücher-Subkategorien (z.B. `buecher-belletristik`, `buecher-krimi-thriller`) wird aus Rebuy's eigenem Navigations-State extrahiert.

### 2.1 — Hilfs-Skript anlegen
```bash
nano /opt/rebuy-scraper/discover_subcats.py
```

Inhalt:
```python
#!/usr/bin/env python3
"""Einmaliges Skript: Findet alle Bücher-Subkategorien auf rebuy.de."""
import os, re, json, sys, requests
from urllib.parse import quote

KEY = os.environ.get("SCRAPEOPS_API_KEY") or open(".env").read().split("SCRAPEOPS_API_KEY=")[1].split("\n")[0].strip()
TARGET = "https://www.rebuy.de/kaufen/buecher"
URL = f"https://proxy.scrapeops.io/v1/?api_key={KEY}&url={quote(TARGET)}&country=de"

html = requests.get(URL, timeout=120).text
m = re.search(r'<script id="ry-inject" type="application/json">(.*?)</script>', html, re.DOTALL)
if not m:
    print("ERROR: ry-inject not found", file=sys.stderr); sys.exit(1)

data = json.loads(m.group(1))
cats = data["productListViewDto"]["categories"][0]["children"]
result = []
for c in cats:
    url_path = c.get("url_path") or c.get("sanitized_path")
    if url_path and url_path.startswith("buecher"):
        result.append(url_path)

print(json.dumps(sorted(set(result)), indent=2, ensure_ascii=False))
```

### 2.2 — Skript ausführen
```bash
cd /opt/rebuy-scraper
source venv/bin/activate
python3 discover_subcats.py > subcategories.json
cat subcategories.json
```

**Erwartet:** Eine JSON-Liste mit ~25–35 Pfaden, z.B.:
```json
[
  "buecher-belletristik",
  "buecher-bestseller-buecher",
  "buecher-fantasy-science-fiction",
  "buecher-kinder-jugendbuecher",
  "buecher-krimi-thriller",
  "buecher-sachbuch",
  ...
]
```

Falls die Liste leer ist oder Fehler kommen: Struktur des `ry-inject`-JSON manuell prüfen (`curl … | python3 -m json.tool`).

---

## Schritt 3 — Neuer Scraper-Code

### 3.1 — Datei anlegen
```bash
nano /opt/rebuy-scraper/listing_scraper.py
```

Inhalt:
```python
#!/usr/bin/env python3
"""
Rebuy Listing-Scraper über ScrapeOps Proxy.

- Modus 'bestseller': nur Subkategorie 'buecher-bestseller-buecher'
- Modus 'komplett':   alle Subkategorien aus subcategories.json
- Pagination bis Seite 86 (Rebuy gibt danach 302)
- Filter: f_variant_availability=a1 (exzellent)
- Dedup auf product_id
- Live-Status-Callback an Dashboard nach jeder Page
- Excel-Generierung am Ende
"""
import os, re, json, time, hmac, hashlib, requests, threading
from urllib.parse import quote
from datetime import date, datetime, timezone
from pathlib import Path

ROOT = Path(__file__).parent
ENV_FILE = ROOT / ".env"
for line in ENV_FILE.read_text().splitlines():
    if "=" in line and not line.startswith("#"):
        k, v = line.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip())

SCRAPEOPS_KEY    = os.environ["SCRAPEOPS_API_KEY"]
HMAC_SECRET      = os.environ.get("HMAC_SECRET", "").encode()
SUPABASE_URL     = os.environ["SUPABASE_URL"]
SUPABASE_KEY     = os.environ["SUPABASE_SERVICE_KEY"]
RESULTS_BUCKET   = "rebuy-results"
MAX_PAGES        = int(os.environ.get("MAX_PAGES", "86"))    # Rebuy-Limit, kann zum Testen kleiner sein
PAGE_DELAY_SEC   = float(os.environ.get("PAGE_DELAY", "1.5"))  # Free-Plan = 1 Verbindung, 1.5s Pause

SUBCATS_FILE = ROOT / "subcategories.json"

def load_subcats():
    return json.loads(SUBCATS_FILE.read_text())

def hmac_sign(body: bytes) -> str:
    if not HMAC_SECRET:
        return ""
    return "sha256=" + hmac.new(HMAC_SECRET, body, hashlib.sha256).hexdigest()

def post_callback(url: str, payload: dict):
    body = json.dumps(payload).encode()
    headers = {"Content-Type": "application/json"}
    sig = hmac_sign(body)
    if sig:
        headers["x-rebuy-signature"] = sig
    try:
        requests.post(url, data=body, headers=headers, timeout=15)
    except Exception as e:
        print(f"[callback] {e}")

def fetch_listing(subcat: str, page: int) -> dict | None:
    target = f"https://www.rebuy.de/kaufen/{subcat}?f_variant_availability=a1&page={page}"
    url = f"https://proxy.scrapeops.io/v1/?api_key={SCRAPEOPS_KEY}&url={quote(target)}&country=de"
    r = requests.get(url, timeout=120, allow_redirects=False)
    if r.status_code in (302, 301, 404):
        return None    # Page existiert nicht / hinter Limit
    r.raise_for_status()
    m = re.search(r'<script id="ry-inject" type="application/json">(.*?)</script>', r.text, re.DOTALL)
    if not m:
        return None
    return json.loads(m.group(1))

def normalize(doc: dict, mode: str) -> dict:
    ids = {i["type"]: i["value"] for i in doc.get("identifiers", [])}
    return {
        "ean": ids.get("EAN", ""),
        "isbn": ids.get("ISBN", ""),
        "title": doc.get("name", ""),
        "authors": ", ".join(doc.get("authors", [])),
        "publisher": doc.get("publisher", ""),
        "format": doc.get("book_format", ""),
        "language": doc.get("language", ""),
        "price_min_eur": (doc.get("price_min") or 0) / 100,
        "price_purchase_eur": (doc.get("price_purchase") or 0) / 100,
        "price_recommended_eur": (doc.get("price_recommended") or 0) / 100,
        "in_stock": bool(doc.get("has_variant_in_stock")),
        "product_id": doc.get("id"),
        "url": f"https://www.rebuy.de/i,{doc.get('id')}/buecher/{doc.get('product_sanitized_name', '')}",
        "mode": mode,
    }

def run(mode: str, scrape_id: str, notify_url: str, status_url: str):
    """Hauptfunktion — wird vom Flask-Trigger aufgerufen."""
    subcats = ["buecher-bestseller-buecher"] if mode == "bestseller" else load_subcats()
    seen_ids = set()
    products = []
    credits_used = 0
    total_pages_estimate = len(subcats) * MAX_PAGES

    try:
        for sub_idx, sub in enumerate(subcats):
            for page in range(1, MAX_PAGES + 1):
                state = fetch_listing(sub, page)
                credits_used += 1
                page_no = sub_idx * MAX_PAGES + page
                if state is None:
                    # Subkategorie hat keine weiteren Seiten — nächste
                    break
                docs = state.get("productListViewDto", {}).get("searchResponse", {}).get("products", {}).get("docs", [])
                if not docs:
                    break
                for d in docs:
                    pid = d.get("id")
                    if pid and pid not in seen_ids:
                        seen_ids.add(pid)
                        products.append(normalize(d, mode))
                # Status-Callback
                post_callback(status_url, {
                    "scrape_id": scrape_id,
                    "progress_pages": page_no,
                    "total_pages": total_pages_estimate,
                    "eta_seconds": int((total_pages_estimate - page_no) * (PAGE_DELAY_SEC + 1.5)),
                })
                time.sleep(PAGE_DELAY_SEC)

        # Excel erstellen + hochladen
        xlsx_path = build_excel(products, scrape_id)
        upload_to_supabase(xlsx_path, scrape_id)

        post_callback(notify_url, {
            "scrape_id": scrape_id,
            "scrape_date": date.today().isoformat(),
            "file_path": f"{scrape_id}.xlsx",
            "row_count": len(products),
            "status": "success",
            "scrapeops_credits": credits_used,
        })
    except Exception as e:
        post_callback(notify_url, {
            "scrape_id": scrape_id,
            "scrape_date": date.today().isoformat(),
            "status": "failed",
            "error_message": str(e)[:500],
            "scrapeops_credits": credits_used,
        })
        raise

def build_excel(products: list[dict], scrape_id: str) -> Path:
    from openpyxl import Workbook
    wb = Workbook()
    ws = wb.active
    ws.title = "Rebuy exzellent"
    if products:
        headers = list(products[0].keys())
        ws.append(headers)
        for p in products:
            ws.append([p.get(h) for h in headers])
    out = ROOT / f"out_{scrape_id}.xlsx"
    wb.save(out)
    return out

def upload_to_supabase(xlsx_path: Path, scrape_id: str):
    """Service-Role-Key + apikey-Header — sonst gibt's 'Invalid Compact JWS'."""
    url = f"{SUPABASE_URL}/storage/v1/object/{RESULTS_BUCKET}/{scrape_id}.xlsx"
    with open(xlsx_path, "rb") as f:
        r = requests.post(url, data=f.read(), headers={
            "Authorization": f"Bearer {SUPABASE_KEY}",
            "apikey": SUPABASE_KEY,
            "x-upsert": "true",
            "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        }, timeout=120)
    r.raise_for_status()
```

### 3.2 — Speichern
`Ctrl+O`, `Enter`, `Ctrl+X`.

---

## Schritt 4 — Flask-API anpassen (`app.py`)

Der Flask-Server muss:
1. den `mode`-Parameter im POST-Body akzeptieren
2. einen neuen Endpoint `POST /mode` haben (für Default-Mode-Sync)
3. den Lauf in einem Thread starten (sofortige 202-Antwort)

### 4.1 — `app.py` öffnen
```bash
nano /opt/rebuy-scraper/app.py
```

### 4.2 — Diese Bereiche anpassen

**Trigger-Endpoint** (existiert schon, Body um `mode` erweitern):

```python
@app.route("/trigger", methods=["POST"])
def trigger():
    check_api_key()
    body = request.get_json(force=True)
    scrape_id = body["scrape_id"]
    notify_url = body["notify_url"]
    status_url = body["status_url"]
    mode = body.get("mode") or load_default_mode()  # NEU: fallback auf gespeicherten Default
    threading.Thread(
        target=listing_scraper.run,
        args=(mode, scrape_id, notify_url, status_url),
        daemon=True,
    ).start()
    return jsonify({"ok": True, "scrape_id": scrape_id, "mode": mode}), 202
```

**Default-Mode-Persistenz** — neuer Helper + Endpoint:

```python
MODE_FILE = Path("/opt/rebuy-scraper/default_mode.txt")

def load_default_mode() -> str:
    if MODE_FILE.exists():
        m = MODE_FILE.read_text().strip()
        if m in ("bestseller", "komplett"):
            return m
    return os.environ.get("DEFAULT_MODE", "bestseller")

@app.route("/mode", methods=["POST"])
def update_mode():
    check_api_key()
    body = request.get_json(force=True)
    mode = body.get("default_mode")
    if mode not in ("bestseller", "komplett"):
        return jsonify({"error": "invalid mode"}), 400
    MODE_FILE.write_text(mode)
    return jsonify({"ok": True})
```

**systemd-Selbsttrigger** (für Cron-Läufe vom Container selbst) — falls vorhanden, sicherstellen dass er `load_default_mode()` nutzt:

```python
# In dem Script, das vom systemd-Timer aufgerufen wird:
mode = load_default_mode()
scrape_id = str(uuid.uuid4())  # selbst generieren
# Call /trigger oder direkt listing_scraper.run(...) — je nach bestehender Architektur
```

### 4.3 — Speichern + Service neu starten
```bash
sudo systemctl restart rebuy-scraper.service
sudo systemctl status rebuy-scraper.service
```

Erwartet: `Active: active (running)`.

---

## Schritt 5 — Test-Lauf (Mini)

### 5.1 — Test mit `MAX_PAGES=3`
```bash
cd /opt/rebuy-scraper
MAX_PAGES=3 python3 -c "
import listing_scraper, uuid
listing_scraper.run('bestseller', str(uuid.uuid4()), 'https://httpbin.org/post', 'https://httpbin.org/post')
"
```

**Erwartet:**
- Keine Exception
- `out_<uuid>.xlsx` im Verzeichnis (mit ~87 Zeilen)
- ScrapeOps-Counter im Dashboard um ~3 reduziert

### 5.2 — Full Bestseller-Lauf via Dashboard
1. `/dashboard/rebuy` öffnen
2. Einstellungen → Standard-Modus auf **Bestseller** → Speichern
3. Trigger-Button klicken (oder per Dropdown explizit "Bestseller starten")
4. **Erwartet:**
   - Container-Status: ScrapeOps-Credits-Anzeige aktualisiert sich
   - Progress: ~50–86 Pages in ~3–5 Min
   - Letztes Ergebnis: ~1.500–2.500 Einträge, Modus = Bestseller, Credits = ~50–86

### 5.3 — Komplett-Lauf testen (länger!)
1. Dropdown am Trigger-Button → **Komplett starten**
2. Dauer ~70–90 Min Free-Plan, ~2.500–3.000 Pages
3. **Erwartet:** ~30.000–60.000 Einträge (Dedup), Credits = ~2.800

---

## Schritt 6 — DataImpulse als Fallback (optional)

Falls die ScrapeOps-Credits aufgebraucht sind und Du keinen Plan-Upgrade machen willst:

1. Im Dashboard → Einstellungen → Erweitert → Backup-Proxy-URL ausfüllen (Format: `http://user:pass@gw.dataimpulse.com:823`)
2. Im Container `listing_scraper.py` ergänzen — `fetch_listing()` fällt bei ScrapeOps-Fehler auf DataImpulse zurück. Beispiel-Logik:

```python
def fetch_listing(subcat, page):
    target = f"https://www.rebuy.de/kaufen/{subcat}?f_variant_availability=a1&page={page}"
    try:
        # Primär: ScrapeOps
        url = f"https://proxy.scrapeops.io/v1/?api_key={SCRAPEOPS_KEY}&url={quote(target)}&country=de"
        r = requests.get(url, timeout=60, allow_redirects=False)
        if r.status_code == 200:
            return parse(r.text)
        if r.status_code == 401:  # ScrapeOps-Credits leer
            raise RuntimeError("scrapeops-empty")
    except RuntimeError:
        # Fallback: DataImpulse
        proxy = os.environ.get("DATAIMPULSE_URL")
        if not proxy:
            raise
        r = requests.get(target, proxies={"http": proxy, "https": proxy}, timeout=60, allow_redirects=False)
        return parse(r.text) if r.status_code == 200 else None
```

---

## Schritt 7 — Aufräumen (alter Code)

Wenn alles läuft, alten Code archivieren (NICHT löschen — könnte nochmal nützlich sein):

```bash
mkdir -p /opt/rebuy-scraper/legacy
mv /opt/rebuy-scraper/scraper.py /opt/rebuy-scraper/legacy/
mv /opt/rebuy-scraper/sitemap_scraper.py /opt/rebuy-scraper/legacy/
mv /opt/rebuy-scraper/sitemap_urls.txt /opt/rebuy-scraper/legacy/ 2>/dev/null || true
mv /opt/rebuy-scraper/sitemap_products.jsonl /opt/rebuy-scraper/legacy/ 2>/dev/null || true
```

---

## Schritt 8 — Verifikation am Dashboard

### 8.1 — Migration ausführen
Im Dashboard-Repo (lokal):
```bash
# Via Supabase MCP oder CLI:
# Migration 038_rebuy_scrapeops.sql wird auf Supabase angewendet
```

### 8.2 — Vercel-Env setzen
1. https://vercel.com → Projekt → Settings → Environment Variables
2. Hinzufügen: `SCRAPEOPS_API_KEY` mit demselben Wert wie im Container
3. Re-deploy

### 8.3 — End-to-End-Check
1. `/dashboard/rebuy` öffnen
2. Karte "Container-Status" → ScrapeOps-Credit-Zeile muss erscheinen
3. Settings → Default-Modus auf "Bestseller" setzen, speichern
4. Reload → Default bleibt
5. Container-Side: `/opt/rebuy-scraper/default_mode.txt` enthält "bestseller"
6. Trigger-Button "Start (Bestseller)" — Container loggt "mode=bestseller"

---

## Häufige Fehler

| Problem | Ursache | Fix |
|---------|---------|-----|
| `ry-inject` nicht gefunden | Rebuy hat HTML-Struktur geändert ODER ScrapeOps liefert Error-Page | Manuell `curl … | head -100` prüfen |
| HTTP 401 von ScrapeOps | API-Key falsch oder Credits aufgebraucht | Im ScrapeOps-Dashboard prüfen |
| HTTP 429 von ScrapeOps | Free-Plan = 1 Verbindung gleichzeitig | `PAGE_DELAY=1.5` (oder höher) setzen |
| Excel hat 0 Zeilen | Subkategorie existiert nicht / Filter zu eng | Mit `MAX_PAGES=1` testen, Roh-JSON prüfen |
| `Invalid Compact JWS` beim Upload | Falscher Header bei Storage-REST | `apikey`-Header + `Authorization` BEIDE setzen (siehe `upload_to_supabase`) |
| Container scrapt auf `komplett` obwohl Default `bestseller` | `default_mode.txt` nicht aktualisiert | Im Container `cat /opt/rebuy-scraper/default_mode.txt` prüfen; `/mode`-Endpoint manuell triggern |
