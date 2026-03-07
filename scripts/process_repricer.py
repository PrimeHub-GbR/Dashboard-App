"""
PROJ-8: Repricer CSV Update
Verarbeitet eine Repricer.com CSV-Exportdatei vollautomatisch:
  1. B-ASINs entfernen
  2. ISBN -> EAN via N8N-Webhook isbn2ean
  3. EAN -> BBP via N8N-Webhook ean2bbp
  4. price_max mit BBP ueberschreiben, price_min = price_max - 3.00
  5. Bereinigte CSV in outputs/ speichern

Verwendung:
    python scripts/process_repricer.py <input.csv>

Konfiguration via .env.local (app/.env.local) oder Umgebungsvariablen:
    N8N_WEBHOOK_BASE_URL  — Pflicht (z.B. https://n8n.example.com/webhook)
    N8N_HMAC_SECRET       — Optional, fuer HMAC-Signierung der Webhook-Anfragen
"""

import csv
import datetime
import decimal
import hashlib
import hmac
import json
import os
import socket
import sys
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path

# ── Konfiguration ─────────────────────────────────────────────────────────────

SCRIPT_DIR = Path(__file__).parent
ENV_FILE = SCRIPT_DIR.parent / ".env.local"
OUTPUT_DIR = SCRIPT_DIR.parent / "outputs"

OUTPUT_COLUMNS = [
    "sku", "marketplace", "merchant_id", "fba", "title",
    "asin", "price_min", "price_max", "repricer_name", "sales_rule",
]

BATCH_SIZE = 50
REQUEST_TIMEOUT = 30  # Sekunden pro N8N-Aufruf

# Sondergrund fuer nicht gefundene Webhooks (HTTP 404)
_GRUND_NOT_FOUND = "workflow_not_found"


# ── Umgebungsvariablen ────────────────────────────────────────────────────────

def load_env() -> dict:
    """Laedt .env.local und merged mit OS-Umgebungsvariablen (OS hat Vorrang)."""
    env: dict[str, str] = {}
    if ENV_FILE.exists():
        with open(ENV_FILE, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    key, _, value = line.partition("=")
                    env[key.strip()] = value.strip()
    for key in ("N8N_WEBHOOK_BASE_URL", "N8N_HMAC_SECRET"):
        if key in os.environ:
            env[key] = os.environ[key]
    return env


# ── N8N-Client ────────────────────────────────────────────────────────────────

class N8nClient:
    def __init__(self, webhook_base_url: str, hmac_secret: str = ""):
        self.base = webhook_base_url.rstrip("/")
        self.hmac_secret = hmac_secret

    def _sign(self, body: bytes) -> str:
        return hmac.new(self.hmac_secret.encode(), body, hashlib.sha256).hexdigest()

    def call(self, path: str, payload: dict) -> dict:
        """Sendet einen signierten POST-Request an den N8N-Webhook und gibt JSON zurueck."""
        url = f"{self.base}/{path}"
        body = json.dumps(payload).encode("utf-8")
        headers = {"Content-Type": "application/json"}
        if self.hmac_secret:
            headers["x-dashboard-signature"] = self._sign(body)
        req = urllib.request.Request(url, data=body, headers=headers)
        with urllib.request.urlopen(req, timeout=REQUEST_TIMEOUT) as resp:
            return json.loads(resp.read().decode("utf-8"))

    def check_connection(self) -> None:
        """Prueft ob der N8N-Server erreichbar ist. Wirft SystemExit bei Fehler."""
        n8n_root = self.base.split("/webhook")[0]
        try:
            urllib.request.urlopen(n8n_root, timeout=10)
        except urllib.error.HTTPError:
            pass  # Server antwortet — auch HTTP-Fehler bedeuten Erreichbarkeit
        except (urllib.error.URLError, OSError) as e:
            print(f"FEHLER: N8N nicht erreichbar ({n8n_root}): {e}", file=sys.stderr)
            sys.exit(1)


# ── CSV I/O ───────────────────────────────────────────────────────────────────

def read_csv(path: str) -> list[dict]:
    if not Path(path).exists():
        print(f"FEHLER: Datei nicht gefunden: {path}", file=sys.stderr)
        sys.exit(1)
    rows = []
    with open(path, newline="", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        unknown = set(reader.fieldnames or []) - set(OUTPUT_COLUMNS)
        if unknown:
            print(f"WARNUNG: Unbekannte Spalten werden ignoriert: {', '.join(sorted(unknown))}")
        for row in reader:
            rows.append(dict(row))
    return rows


def write_csv(rows: list[dict], path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=OUTPUT_COLUMNS, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)


def write_error_log(errors: list[dict], path: Path) -> None:
    if not errors:
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        f.write("asin\tschritt\tgrund\n")
        for e in errors:
            f.write(f"{e['asin']}\t{e['schritt']}\t{e['grund']}\n")


# ── Geschaeftslogik ───────────────────────────────────────────────────────────

def is_b_asin(asin: str) -> bool:
    """True wenn asin mit Grossbuchstabe B beginnt (kein ISBN mit X-Suffix)."""
    return bool(asin) and asin[0] == "B"


def calculate_prices(bbp: float) -> tuple[float, float]:
    """
    price_max = BBP (kaufmaennisch auf 2 Dezimalstellen gerundet, ROUND_HALF_UP)
    price_min = price_max - 3.00 (Minimum: price_max, nie darunter bzw. <= 0)
    """
    two_places = Decimal("0.01")
    price_max = float(Decimal(str(bbp)).quantize(two_places, rounding=ROUND_HALF_UP))
    price_min_raw = Decimal(str(price_max)) - Decimal("3.00")
    price_min = float(price_min_raw.quantize(two_places, rounding=ROUND_HALF_UP))
    if price_min <= 0:
        price_min = price_max
    return price_max, price_min


def _is_timeout(e: Exception) -> bool:
    if isinstance(e, TimeoutError):
        return True
    if isinstance(e, urllib.error.URLError) and isinstance(e.reason, socket.timeout):
        return True
    return False


# ── Parallelverarbeitung ──────────────────────────────────────────────────────

def _fetch_ean(row: dict, client: N8nClient) -> tuple[dict, str | None, str | None]:
    """Holt EAN fuer eine Zeile. Gibt (row, ean, fehlergrund) zurueck."""
    asin = row.get("asin", "").strip()
    try:
        result = client.call("isbn2ean", {"isbn": asin})
        ean = result.get("ean") or None
        return row, ean, None
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return row, None, _GRUND_NOT_FOUND
        grund = f"fehler: {e}"
        return row, None, grund
    except Exception as e:
        grund = "timeout" if _is_timeout(e) else f"fehler: {e}"
        return row, None, grund


def _fetch_bbp(row: dict, client: N8nClient) -> tuple[dict, float | None, str | None]:
    """Holt BBP fuer eine Zeile. Gibt (row, price, fehlergrund) zurueck."""
    ean = row["_ean"]
    try:
        result = client.call("ean2bbp", {"ean": ean})
        price = result.get("price")
        if price is None:
            return row, None, None  # kein Preis, kein Fehler — wird gefiltert
        return row, float(price), None
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return row, None, _GRUND_NOT_FOUND
        grund = f"fehler: {e}"
        return row, None, grund
    except Exception as e:
        grund = "timeout" if _is_timeout(e) else f"fehler: {e}"
        return row, None, grund


def _run_batch(fn, items: list, **kwargs) -> list:
    """Fuehrt fn fuer alle items parallel aus (max BATCH_SIZE gleichzeitig)."""
    results = []
    for start in range(0, len(items), BATCH_SIZE):
        batch = items[start:start + BATCH_SIZE]
        with ThreadPoolExecutor(max_workers=len(batch)) as executor:
            futures = [executor.submit(fn, item, **kwargs) for item in batch]
            for future in as_completed(futures):
                results.append(future.result())
    return results


def _check_workflow_not_found(results: list, workflow_name: str) -> None:
    """
    Prueft ob alle Ergebnisse eines Batches mit HTTP 404 fehlschlugen.
    Falls ja: Fehlermeldung ausgeben und Programm beenden.
    """
    not_found = [r for r in results if r[2] == _GRUND_NOT_FOUND]
    if not_found:
        print(
            f"\nFEHLER: N8N-Webhook '{workflow_name}' antwortet mit HTTP 404 (nicht gefunden).",
            file=sys.stderr,
        )
        print(
            f"        Ist der Webhook-Pfad korrekt? Prüfe N8N_WEBHOOK_BASE_URL und den Workflow-Namen.",
            file=sys.stderr,
        )
        sys.exit(1)


# ── Hauptverarbeitung ─────────────────────────────────────────────────────────

def process(rows: list[dict], client: N8nClient, error_log: list[dict]) -> tuple[list[dict], dict]:
    stats = {
        "total": len(rows),
        "b_asins": 0,
        "no_ean": 0,
        "no_price": 0,
        "final": 0,
    }

    # Schritt 1: B-ASINs sofort herausfiltern
    active = []
    for row in rows:
        if is_b_asin(row.get("asin", "").strip()):
            stats["b_asins"] += 1
        else:
            active.append(row)

    # Schritt 2: ISBN → EAN (parallel, Batches je 50)
    print(f"Schritt 2/3: ISBN→EAN fuer {len(active)} Zeilen ...")
    ean_results = _run_batch(_fetch_ean, active, client=client)
    _check_workflow_not_found(ean_results, "isbn2ean")

    with_ean = []
    for row, ean, grund in ean_results:
        if grund:
            stats["no_ean"] += 1
            error_log.append({"asin": row.get("asin"), "schritt": "isbn2ean", "grund": grund})
        elif not ean:
            stats["no_ean"] += 1
        else:
            row["_ean"] = ean
            with_ean.append(row)

    # Schritt 3: EAN → BBP (parallel, Batches je 50)
    print(f"Schritt 3/3: EAN→BBP fuer {len(with_ean)} Zeilen ...")
    bbp_results = _run_batch(_fetch_bbp, with_ean, client=client)
    _check_workflow_not_found(bbp_results, "ean2bbp")

    result = []
    for row, price, grund in bbp_results:
        if grund:
            stats["no_price"] += 1
            error_log.append({"asin": row.get("asin"), "schritt": "ean2bbp", "grund": grund})
        elif price is None:
            stats["no_price"] += 1
        else:
            price_max, price_min = calculate_prices(price)
            row["price_max"] = f"{price_max:.2f}"
            row["price_min"] = f"{price_min:.2f}"
            result.append(row)

    stats["final"] = len(result)
    return result, stats


# ── Ausgabe ───────────────────────────────────────────────────────────────────

def print_summary(stats: dict, outfile: Path) -> None:
    deleted = stats["b_asins"] + stats["no_ean"] + stats["no_price"]
    print(f"\n{'=' * 52}")
    print(f"Verarbeitete Zeilen:  {stats['total']}")
    print(f"Davon geloescht:      {deleted} "
          f"(B-ASINs: {stats['b_asins']}, kein EAN: {stats['no_ean']}, kein Preis: {stats['no_price']})")
    print(f"Finale Zeilen:        {stats['final']}")
    print(f"Datei gespeichert:    {outfile}")
    print(f"{'=' * 52}\n")


# ── Einstiegspunkt ────────────────────────────────────────────────────────────

def main() -> None:
    if len(sys.argv) < 2:
        print("Verwendung: python scripts/process_repricer.py <input.csv>", file=sys.stderr)
        sys.exit(1)

    # Konfiguration laden
    env = load_env()
    webhook_base_url = env.get("N8N_WEBHOOK_BASE_URL")
    if not webhook_base_url:
        print("FEHLER: N8N_WEBHOOK_BASE_URL ist nicht konfiguriert.", file=sys.stderr)
        print(f"       Setze die Variable in {ENV_FILE} oder als Umgebungsvariable.", file=sys.stderr)
        sys.exit(1)

    client = N8nClient(
        webhook_base_url=webhook_base_url,
        hmac_secret=env.get("N8N_HMAC_SECRET", ""),
    )

    # Schritt 0: Verbindungscheck
    print("Schritt 0: N8N-Verbindung pruefen ...")
    client.check_connection()
    print("           OK")

    # Schritt 1: CSV einlesen
    input_file = sys.argv[1]
    rows = read_csv(input_file)
    if not rows:
        print("Keine Zeilen zum Verarbeiten. Abbruch.", file=sys.stderr)
        sys.exit(1)
    print(f"Schritt 1: {len(rows)} Zeilen eingelesen, B-ASINs filtern ...")

    # Verarbeitung
    error_log: list[dict] = []
    result, stats = process(rows, client, error_log)

    # Ausgabe
    today = datetime.date.today().isoformat()
    outfile = OUTPUT_DIR / f"repricer_updated_{today}.csv"
    errfile = OUTPUT_DIR / f"repricer_errors_{today}.log"

    write_csv(result, outfile)
    write_error_log(error_log, errfile)
    print_summary(stats, outfile)

    if error_log:
        print(f"Fehlerlog gespeichert: {errfile} ({len(error_log)} Eintraege)")


if __name__ == "__main__":
    main()
