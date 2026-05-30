#!/usr/bin/env python3
"""
Rebuy Listing-Scraper — ScrapeOps + Listing-Page-Strategie.

Workflow:
  1. ENV lesen: SCRAPE_ID, MODE (oder default_mode.txt / DEFAULT_MODE env)
  2. Subkategorien laden:
       - 'bestseller': ['buecher-bestseller-buecher']
       - 'komplett':   alle aus subcategories.json
  3. Pro Subkategorie × Pages 1..86 die Listing-Page über ScrapeOps holen
  4. JSONL schreiben (kompatibel mit finalize-Endpoint im server.py)
  5. Live-Status alle 60s an Dashboard
  6. Am Ende: Excel bauen + nach Supabase uploaden + notify
  7. SIGTERM → graceful exit, JSONL bleibt für finalize
"""
import hashlib
import hmac
import io
import json
import logging
import os
import re
import signal
import sys
import time
from datetime import date
from pathlib import Path
from urllib.parse import quote

import openpyxl
import requests
from dotenv import load_dotenv
from openpyxl.styles import Font

BASE_DIR = Path(__file__).parent
load_dotenv(BASE_DIR / ".env")

# ── Konfiguration ─────────────────────────────────────────────────────────────
PRODUCTS_FILE   = BASE_DIR / "sitemap_products.jsonl"        # Kompatibilität mit server.py /finalize
SCRAPE_ID_FILE  = BASE_DIR / "scrape_id.txt"
SUBCATS_FILE    = BASE_DIR / "subcategories.json"
MODE_FILE       = BASE_DIR / "default_mode.txt"
LAST_SCRAPE     = BASE_DIR / "last_scrape.txt"

SCRAPEOPS_KEY   = os.environ.get("SCRAPEOPS_API_KEY", "")
HMAC_SECRET     = os.environ.get("HMAC_SECRET", "")
SUPABASE_URL    = os.environ.get("SUPABASE_URL", "https://tcqdyzmhwyfamzyeyskj.supabase.co")
SUPABASE_KEY    = os.environ.get("SUPABASE_SERVICE_KEY", "")
NOTIFY_URL      = os.environ.get("DASHBOARD_NOTIFY_URL", "")
STATUS_URL      = os.environ.get("DASHBOARD_STATUS_URL", "")

MAX_PAGES       = int(os.environ.get("MAX_PAGES", "86"))      # Rebuy-Hardlimit pro Filter
PAGE_DELAY_SEC  = float(os.environ.get("PAGE_DELAY", "1.6"))  # ScrapeOps Free = 1 Concurrency
STATUS_INTERVAL = int(os.environ.get("STATUS_INTERVAL", "60"))
CREDIT_LIMIT    = int(os.environ.get("CREDIT_LIMIT", "0"))     # 0 = kein Limit

# ── Logging ───────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
)
log = logging.getLogger("rebuy-listing")

# ── Mode-Resolution ──────────────────────────────────────────────────────────

def resolve_mode() -> str:
    """Reihenfolge: env MODE → default_mode.txt → env DEFAULT_MODE → 'bestseller'."""
    for src in (os.environ.get("MODE"), MODE_FILE.read_text().strip() if MODE_FILE.exists() else None,
                os.environ.get("DEFAULT_MODE")):
        if src and src.strip() in ("bestseller", "komplett"):
            return src.strip()
    return "bestseller"


def resolve_subcats(mode: str) -> list[str]:
    if mode == "bestseller":
        return ["buecher-bestseller-buecher"]
    if not SUBCATS_FILE.exists():
        raise RuntimeError(f"{SUBCATS_FILE} fehlt — discover_subcats.py ausführen!")
    return json.loads(SUBCATS_FILE.read_text())


# ── Graceful shutdown ─────────────────────────────────────────────────────────
_cancel_requested = False


def _on_sigterm(_signum, _frame):
    global _cancel_requested
    _cancel_requested = True
    log.warning("SIGTERM empfangen — graceful shutdown nach aktueller Page")


signal.signal(signal.SIGTERM, _on_sigterm)
signal.signal(signal.SIGINT, _on_sigterm)


# ── Dashboard helpers ────────────────────────────────────────────────────────

def _sign(body: bytes) -> dict[str, str]:
    h = {"Content-Type": "application/json"}
    if HMAC_SECRET:
        sig = hmac.new(HMAC_SECRET.encode(), body, hashlib.sha256).hexdigest()
        h["x-rebuy-signature"] = f"sha256={sig}"
    return h


def push_status(scrape_id: str, progress_pages: int, total_pages: int,
                eta_seconds: int, products_saved: int) -> None:
    if not STATUS_URL or not scrape_id:
        return
    try:
        body = json.dumps({
            "scrape_id": scrape_id,
            "progress_pages": progress_pages,
            "total_pages": total_pages,
            "eta_seconds": eta_seconds,
            "products_saved": products_saved,
        }).encode()
        requests.post(STATUS_URL, data=body, headers=_sign(body), timeout=10)
    except Exception as e:
        log.debug("push_status failed: %s", e)


def push_notify(payload: dict) -> None:
    if not NOTIFY_URL:
        log.warning("DASHBOARD_NOTIFY_URL fehlt — kein Callback")
        return
    body = json.dumps(payload).encode()
    try:
        r = requests.post(NOTIFY_URL, data=body, headers=_sign(body), timeout=15)
        log.info("notify %s → HTTP %s", payload.get("status"), r.status_code)
    except Exception as e:
        log.error("notify failed: %s", e)


# ── ScrapeOps Listing-Fetch ──────────────────────────────────────────────────

RY_INJECT_RE = re.compile(r'<script id="ry-inject" type="application/json">(.*?)</script>', re.DOTALL)


def fetch_listing(subcat: str, page: int) -> tuple[list[dict], bool]:
    """
    Holt eine Listing-Page. Returns (docs, ended).
    ended=True wenn Pagination zu Ende (302/leer) → nächste Subkategorie.
    """
    target = (
        f"https://www.rebuy.de/kaufen/{subcat}"
        f"?f_variant_availability=a1&page={page}"
    )
    proxy_url = (
        f"https://proxy.scrapeops.io/v1/"
        f"?api_key={SCRAPEOPS_KEY}"
        f"&url={quote(target)}"
        f"&country=de"
    )
    try:
        r = requests.get(proxy_url, timeout=120, allow_redirects=False)
    except requests.RequestException as e:
        log.warning("[%s p%d] request error: %s — skipping page", subcat, page, e)
        return [], False

    # ScrapeOps gibt eigenen 200 mit weitergereichter Response zurück.
    # 401/429 = unsere Credits leer / Rate-Limit → propagieren
    if r.status_code == 401:
        raise RuntimeError("ScrapeOps 401 — API-Key ungültig oder Credits leer")
    if r.status_code == 429:
        log.warning("[%s p%d] 429 — 5s warten und nochmal", subcat, page)
        time.sleep(5)
        r = requests.get(proxy_url, timeout=120, allow_redirects=False)

    if r.status_code != 200:
        log.warning("[%s p%d] HTTP %d — ende der Pagination angenommen",
                    subcat, page, r.status_code)
        return [], True

    m = RY_INJECT_RE.search(r.text)
    if not m:
        log.warning("[%s p%d] ry-inject fehlt — skip", subcat, page)
        return [], True

    try:
        state = json.loads(m.group(1))
        docs = (state.get("productListViewDto", {})
                     .get("searchResponse", {})
                     .get("products", {})
                     .get("docs") or [])
    except (json.JSONDecodeError, KeyError, AttributeError) as e:
        log.warning("[%s p%d] JSON-Parse-Fehler: %s", subcat, page, e)
        return [], False

    return docs, len(docs) == 0


def normalize(doc: dict, mode: str, subcat: str) -> dict:
    ids = {i.get("type"): i.get("value") for i in doc.get("identifiers", []) or []}
    pid = doc.get("id")
    name_slug = doc.get("product_sanitized_name") or doc.get("basic_sanitized_name") or ""
    return {
        # Felder kompatibel mit altem server.py /finalize:
        "ean": ids.get("EAN", ""),
        "isbn": ids.get("ISBN", ""),
        "title": doc.get("name", ""),
        "price": doc.get("price_recommended") or doc.get("price_min") or 0,   # in Cent (UVP)
        "format": doc.get("book_format", ""),
        "condition": "Exzellent",
        "url": f"https://www.rebuy.de/i,{pid}/buecher/{name_slug}" if pid else "",
        # Zusätzliche Felder für eigene Excel:
        "authors": ", ".join(doc.get("authors") or []),
        "publisher": doc.get("publisher", ""),
        "language": doc.get("language", ""),
        "price_min_cent": doc.get("price_min") or 0,
        "price_purchase_cent": doc.get("price_purchase") or 0,
        "price_recommended_cent": doc.get("price_recommended") or 0,
        "in_stock": bool(doc.get("has_variant_in_stock")),
        "product_id": pid,
        "mode": mode,
        "source_subcat": subcat,
    }


# ── Excel + Upload ────────────────────────────────────────────────────────────

def build_excel(products: list[dict]) -> bytes:
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Rebuy Exzellent"
    headers = [
        "EAN", "ISBN", "Titel", "Autor(en)", "Verlag", "Sprache", "Format",
        "Preis exzellent (€)", "Ankaufspreis (€)", "UVP (€)",
        "Lieferbar", "Modus", "Subkategorie", "Product-ID", "URL",
    ]
    ws.append(headers)
    for cell in ws[1]:
        cell.font = Font(bold=True)
    for p in products:
        ws.append([
            p["ean"], p["isbn"], p["title"], p["authors"], p["publisher"],
            p["language"], p["format"],
            round((p["price_min_cent"] or 0) / 100, 2),
            round((p["price_purchase_cent"] or 0) / 100, 2),
            round((p["price_recommended_cent"] or 0) / 100, 2),
            "ja" if p["in_stock"] else "nein",
            p["mode"], p["source_subcat"], p["product_id"], p["url"],
        ])
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def upload_to_supabase(xlsx_bytes: bytes, scrape_id: str) -> str:
    """Lädt nach rebuy-results/{scrape_id}.xlsx hoch. Service-Role + apikey nötig."""
    file_path = f"{scrape_id}.xlsx"
    url = f"{SUPABASE_URL}/storage/v1/object/rebuy-results/{file_path}"
    headers = {
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "apikey": SUPABASE_KEY,
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "x-upsert": "true",
    }
    r = requests.put(url, data=xlsx_bytes, headers=headers, timeout=120)
    if r.status_code not in (200, 201):
        log.error("Supabase upload error: %s %s", r.status_code, r.text[:300])
        raise RuntimeError(f"Supabase Upload HTTP {r.status_code}")
    return file_path


# ── Main ─────────────────────────────────────────────────────────────────────

def main():
    scrape_id = (os.environ.get("SCRAPE_ID")
                 or (SCRAPE_ID_FILE.read_text().strip() if SCRAPE_ID_FILE.exists() else ""))
    mode = resolve_mode()
    subcats = resolve_subcats(mode)

    limit_str = f"{CREDIT_LIMIT}" if CREDIT_LIMIT > 0 else "kein Limit"
    log.info("Mode: %s | Subkategorien: %d | scrape_id=%s | PAGE_DELAY=%.1fs | CREDIT_LIMIT=%s",
             mode, len(subcats), scrape_id, PAGE_DELAY_SEC, limit_str)

    if scrape_id:
        SCRAPE_ID_FILE.write_text(scrape_id)
    if not SCRAPEOPS_KEY:
        log.error("SCRAPEOPS_API_KEY fehlt in .env — Abbruch")
        push_notify({
            "scrape_id": scrape_id,
            "scrape_date": date.today().isoformat(),
            "status": "failed",
            "error_message": "SCRAPEOPS_API_KEY fehlt in Container-.env",
            "scrapeops_credits": 0,
        })
        sys.exit(1)

    products: list[dict] = []
    seen: set[int] = set()
    credits_used = 0
    t_start = time.time()
    last_status_push = 0.0
    total_pages_est = len(subcats) * MAX_PAGES  # grobe Obergrenze

    # JSONL für finalize-Kompatibilität gleich offen halten (append-mode)
    PRODUCTS_FILE.unlink(missing_ok=True)
    jsonl_fp = open(PRODUCTS_FILE, "w", encoding="utf-8")

    limit_reached = False
    try:
        page_no = 0
        for sub_idx, sub in enumerate(subcats, 1):
            if limit_reached:
                break
            log.info("[%d/%d] %s …", sub_idx, len(subcats), sub)
            for page in range(1, MAX_PAGES + 1):
                if _cancel_requested:
                    log.warning("Cancel — abbruch in Subkategorie %s page %d", sub, page)
                    raise KeyboardInterrupt()
                # Credit-Limit-Check VOR dem Request (verhindert Überschreiten)
                if CREDIT_LIMIT > 0 and credits_used >= CREDIT_LIMIT:
                    log.warning("Credit-Limit erreicht: %d/%d Credits — stoppe sauber", credits_used, CREDIT_LIMIT)
                    limit_reached = True
                    break
                docs, ended = fetch_listing(sub, page)
                credits_used += 1
                page_no += 1

                for d in docs:
                    pid = d.get("id")
                    if pid is None or pid in seen:
                        continue
                    seen.add(pid)
                    n = normalize(d, mode, sub)
                    products.append(n)
                    jsonl_fp.write(json.dumps(n, ensure_ascii=False) + "\n")
                jsonl_fp.flush()

                if ended:
                    log.info("[%s] Pagination zu Ende bei page=%d (Produkte: %d)", sub, page, len(products))
                    break

                # Live-Status
                now = time.time()
                if now - last_status_push >= STATUS_INTERVAL:
                    elapsed = now - t_start
                    rate = page_no / elapsed if elapsed > 0 else 1
                    remaining = max(0, int((total_pages_est - page_no) / rate)) if rate > 0 else 0
                    push_status(scrape_id, page_no, total_pages_est, remaining, len(products))
                    last_status_push = now
                    log.info("  · Page %d/%d | %d Produkte | %d Credits", page_no, total_pages_est, len(products), credits_used)

                time.sleep(PAGE_DELAY_SEC)

        jsonl_fp.close()

        # Excel + Upload
        if not products:
            raise RuntimeError("Keine Produkte gefunden — Rebuy oder ScrapeOps liefert nichts")
        log.info("Erstelle Excel mit %d Produkten …", len(products))
        xlsx = build_excel(products)
        file_path = upload_to_supabase(xlsx, scrape_id) if scrape_id else None

        notify_payload = {
            "scrape_id": scrape_id,
            "scrape_date": date.today().isoformat(),
            "file_path": file_path,
            "row_count": len(products),
            "status": "success",
            "scrapeops_credits": credits_used,
        }
        if limit_reached:
            notify_payload["error_message"] = (
                f"Credit-Limit erreicht ({credits_used}/{CREDIT_LIMIT} Credits) — "
                f"{len(products)} Produkte gesammelt, vorzeitig abgeschlossen."
            )
        push_notify(notify_payload)
        LAST_SCRAPE.write_text(date.today().isoformat())
        log.info("DONE! %d Produkte, %d Credits verbraucht%s, file=%s",
                 len(products), credits_used, " (Limit erreicht)" if limit_reached else "", file_path)

    except KeyboardInterrupt:
        jsonl_fp.close()
        log.warning("Abgebrochen nach %d Pages, %d Produkte (JSONL bleibt für /finalize)",
                    page_no, len(products))
        sys.exit(0)  # server.py /cancel macht den Status-Update

    except Exception as e:
        jsonl_fp.close()
        log.exception("Scraper failed")
        push_notify({
            "scrape_id": scrape_id,
            "scrape_date": date.today().isoformat(),
            "status": "failed",
            "error_message": str(e)[:500],
            "scrapeops_credits": credits_used,
        })
        sys.exit(1)


if __name__ == "__main__":
    main()
