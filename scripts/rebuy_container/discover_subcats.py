#!/usr/bin/env python3
"""
Findet alle Bücher-Subkategorien auf rebuy.de via ScrapeOps.
Schreibt /opt/rebuy-scraper/subcategories.json.

Strategie:
  1. Top-Level: `/kaufen/buecher` HTML parsen → href="/kaufen/buecher-*"
  2. Tiefe 2 (optional): für jede Top-Subkategorie nochmal HTML laden und href="/kaufen/{parent}-*" sammeln
     (kostet ~10 zusätzliche ScrapeOps-Credits, gibt aber bessere Coverage)

Ausführung:
  source /opt/rebuy-scraper/venv/bin/activate
  python3 /opt/rebuy-scraper/discover_subcats.py [--depth 1|2]
"""
import argparse
import json
import os
import re
import sys
import time
from pathlib import Path
from urllib.parse import quote

import requests
from dotenv import load_dotenv

BASE = Path(__file__).parent
load_dotenv(BASE / ".env")

KEY = os.environ.get("SCRAPEOPS_API_KEY")
if not KEY:
    print("ERROR: SCRAPEOPS_API_KEY fehlt in .env", file=sys.stderr)
    sys.exit(1)


def fetch(path: str) -> str:
    """Holt eine Rebuy-Seite über ScrapeOps."""
    target = f"https://www.rebuy.de/kaufen/{path}"
    url = f"https://proxy.scrapeops.io/v1/?api_key={KEY}&url={quote(target)}&country=de"
    r = requests.get(url, timeout=120)
    r.raise_for_status()
    return r.text


def extract_hrefs(html: str, prefix: str) -> set[str]:
    """Findet alle href='/kaufen/{prefix}-...' im HTML."""
    pattern = rf'href="/kaufen/({re.escape(prefix)}-[^"?#]+)"'
    return set(re.findall(pattern, html))


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--depth", type=int, default=1, choices=[1, 2], help="1=Top-Level, 2=auch Subkategorien")
    args = p.parse_args()

    # Depth 1
    print("Phase 1: Top-Level Subkategorien …")
    html = fetch("buecher")
    top = extract_hrefs(html, "buecher")
    print(f"  → {len(top)} Top-Subkategorien gefunden")

    all_subs: set[str] = set(top)

    if args.depth >= 2:
        print("\nPhase 2: Subkategorien-Subkategorien …")
        for i, t in enumerate(sorted(top), 1):
            try:
                print(f"  [{i}/{len(top)}] {t} …", end=" ", flush=True)
                html2 = fetch(t)
                children = extract_hrefs(html2, t)
                new = children - all_subs
                all_subs |= children
                print(f"+{len(new)}")
                time.sleep(1.5)  # ScrapeOps Free-Plan = 1 Concurrency
            except Exception as e:
                print(f"FAIL ({e})")

    result = sorted(all_subs)
    out = BASE / "subcategories.json"
    out.write_text(json.dumps(result, indent=2, ensure_ascii=False))

    print(f"\nGesamt: {len(result)} Subkategorien")
    for s in result:
        print(f"  {s}")
    print(f"\nGespeichert: {out}")


if __name__ == "__main__":
    main()
