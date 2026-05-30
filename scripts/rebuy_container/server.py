#!/usr/bin/env python3
"""
Rebuy Scraper — Flask mini-server
Runs on localhost:5000.
Endpoints: GET /health  POST /trigger  POST /cancel  POST /schedule  GET /logs
           POST /mode (NEU 2026-05-30)
Auth: All endpoints except /health require X-Api-Key header (from FLASK_API_KEY in .env)
"""

import hashlib
import hmac
import io
import json
import os
import signal
import threading
import subprocess
import logging
import time
from datetime import date
from functools import wraps
from pathlib import Path
from flask import Flask, request, jsonify
from dotenv import load_dotenv
import openpyxl
from openpyxl.styles import Font
import requests as _requests

load_dotenv(Path(__file__).parent / '.env')

app        = Flask(__name__)
FLASK_PORT = int(os.environ.get('FLASK_PORT', 5000))
FLASK_API_KEY = os.environ.get('FLASK_API_KEY', '')
SCRAPER_PY = '/opt/rebuy-scraper/venv/bin/python'
SCRAPER    = '/opt/rebuy-scraper/scraper.py'
LOG_FILE      = '/opt/rebuy-scraper/scraper.log'
PRODUCTS_FILE = Path('/opt/rebuy-scraper/sitemap_products.jsonl')
MODE_FILE     = Path('/opt/rebuy-scraper/default_mode.txt')
SUPABASE_URL  = os.environ.get('SUPABASE_URL', 'https://tcqdyzmhwyfamzyeyskj.supabase.co')
SUPABASE_KEY  = os.environ.get('SUPABASE_SERVICE_KEY', '')
NOTIFY_URL    = os.environ.get('DASHBOARD_NOTIFY_URL', '')
HMAC_SECRET   = os.environ.get('HMAC_SECRET', '')

VALID_MODES = ('bestseller', 'komplett')

logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')
log = logging.getLogger(__name__)

_lock  = threading.Lock()
_state = {'running': False, 'pid': None, 'scrape_id': None, 'mode': None}


def require_api_key(f):
    """Decorator: reject requests without valid X-Api-Key header (if key is configured)."""
    @wraps(f)
    def decorated(*args, **kwargs):
        if FLASK_API_KEY:
            provided = request.headers.get('X-Api-Key', '')
            if provided != FLASK_API_KEY:
                return jsonify({'error': 'Unauthorized'}), 401
        return f(*args, **kwargs)
    return decorated


def _load_default_mode() -> str:
    if MODE_FILE.exists():
        m = MODE_FILE.read_text().strip()
        if m in VALID_MODES:
            return m
    env_mode = os.environ.get('DEFAULT_MODE', '').strip()
    if env_mode in VALID_MODES:
        return env_mode
    return 'bestseller'


@app.route('/health', methods=['GET'])
def health():
    """Public endpoint — no auth required."""
    with _lock:
        proxy_configured = bool(os.environ.get('BACKUP_PROXY_URL', ''))
        scrapeops_configured = bool(os.environ.get('SCRAPEOPS_API_KEY', ''))
        return jsonify({
            'status':    'ok',
            'running':   _state['running'],
            'scrape_id': _state['scrape_id'],
            'mode':      _state['mode'],
            'default_mode': _load_default_mode(),
            'backup_proxy_configured': proxy_configured,
            'using_proxy': proxy_configured,
            'scrapeops_configured': scrapeops_configured,
        })


@app.route('/trigger', methods=['POST'])
@require_api_key
def trigger():
    data         = request.get_json(force=True, silent=True) or {}
    scrape_id    = data.get('scrape_id', '')
    mode         = data.get('mode') or _load_default_mode()
    credit_limit = data.get('credit_limit')
    if mode not in VALID_MODES:
        return jsonify({'error': 'invalid_mode', 'mode': mode}), 400
    try:
        credit_limit_int = int(credit_limit) if credit_limit is not None else 0
        if credit_limit_int < 0:
            credit_limit_int = 0
    except (TypeError, ValueError):
        return jsonify({'error': 'invalid_credit_limit', 'value': credit_limit}), 400

    with _lock:
        if _state['running']:
            return jsonify({'error': 'already_running', 'scrape_id': _state['scrape_id']}), 409

        env = os.environ.copy()
        if scrape_id:
            env['SCRAPE_ID'] = scrape_id
        env['MODE'] = mode
        env['CREDIT_LIMIT'] = str(credit_limit_int)

        # Immer komplett neu starten — Checkpoint und alte Daten löschen
        Path('/opt/rebuy-scraper/sitemap_checkpoint.json').unlink(missing_ok=True)
        Path('/opt/rebuy-scraper/scrape_checkpoint.json').unlink(missing_ok=True)
        Path('/opt/rebuy-scraper/sitemap_products.jsonl').unlink(missing_ok=True)
        Path('/opt/rebuy-scraper/sitemap_retry.txt').unlink(missing_ok=True)
        Path('/opt/rebuy-scraper/last_scrape.txt').unlink(missing_ok=True)
        Path('/tmp/rebuy_proxy_active').unlink(missing_ok=True)
        # scrape_id.txt aktualisieren damit push_status die richtige ID nutzt
        if scrape_id:
            Path('/opt/rebuy-scraper/scrape_id.txt').write_text(scrape_id)
        log.info('Fresh start — checkpoint and JSONL cleared')
        log_fd = open(LOG_FILE, 'a')
        proc = subprocess.Popen(
            [SCRAPER_PY, SCRAPER],
            env=env,
            stdout=log_fd,
            stderr=log_fd,
        )
        _state['running']   = True
        _state['pid']       = proc.pid
        _state['scrape_id'] = scrape_id
        _state['mode']      = mode
        log.info(f'Scraper started PID={proc.pid} scrape_id={scrape_id} mode={mode} credit_limit={credit_limit_int}')

    def _wait():
        proc.wait()
        with _lock:
            _state['running']   = False
            _state['pid']       = None
            _state['scrape_id'] = None
            _state['mode']      = None
        log.info(f'Scraper finished exit={proc.returncode}')

    threading.Thread(target=_wait, daemon=True).start()
    return jsonify({'ok': True, 'scrape_id': scrape_id, 'mode': mode, 'credit_limit': credit_limit_int, 'pid': proc.pid})


@app.route('/mode', methods=['POST'])
@require_api_key
def update_mode():
    """Persistiert den Default-Modus für systemd-/Cron-Selbsttrigger."""
    data = request.get_json(force=True, silent=True) or {}
    mode = (data.get('default_mode') or data.get('mode') or '').strip()
    if mode not in VALID_MODES:
        return jsonify({'error': 'invalid_mode', 'mode': mode}), 400
    MODE_FILE.write_text(mode)
    log.info(f'Default mode updated → {mode}')
    return jsonify({'ok': True, 'default_mode': mode})


@app.route('/cancel', methods=['POST'])
@require_api_key
def cancel():
    with _lock:
        if not _state['running'] or not _state['pid']:
            return jsonify({'error': 'not_running'}), 409
        try:
            os.kill(_state['pid'], signal.SIGTERM)
            _state['running']   = False
            _state['pid']       = None
            _state['scrape_id'] = None
            _state['mode']      = None
            log.info('Scraper cancelled via /cancel')
        except ProcessLookupError:
            _state['running']   = False
            _state['pid']       = None
            _state['scrape_id'] = None
            _state['mode']      = None
        except Exception as e:
            return jsonify({'error': str(e)}), 500
    return jsonify({'ok': True})


@app.route('/finalize', methods=['POST'])
@require_api_key
def finalize():
    """Stop scraper early, generate Excel from current data, upload to Supabase."""
    with _lock:
        if not _state['running'] or not _state['pid']:
            return jsonify({'error': 'not_running'}), 409
        pid       = _state['pid']
        scrape_id = _state['scrape_id'] or ''
        try:
            os.kill(pid, signal.SIGTERM)
        except ProcessLookupError:
            pass
        except Exception as e:
            return jsonify({'error': str(e)}), 500
        _state['running']   = False
        _state['pid']       = None
        _state['scrape_id'] = None
        _state['mode']      = None

    # Wait up to 15s for the process to fully flush its JSONL writes
    for _ in range(15):
        try:
            os.kill(pid, 0)   # raises if process is gone
            time.sleep(1)
        except ProcessLookupError:
            break

    # Generate Excel from sitemap_products.jsonl
    if not PRODUCTS_FILE.exists() or PRODUCTS_FILE.stat().st_size == 0:
        return jsonify({'error': 'Keine Produktdaten vorhanden (JSONL leer)'}), 409

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = 'Rebuy Bücher'
    headers = ['EAN', 'ISBN', 'Titel', 'Preis VK (€)', 'Format', 'Zustand', 'URL']
    ws.append(headers)
    for cell in ws[1]:
        cell.font = Font(bold=True)

    row_count = 0
    try:
        with open(PRODUCTS_FILE, encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    p = json.loads(line)
                except json.JSONDecodeError:
                    continue
                raw_price = p.get('price')
                price_eur = round(raw_price / 100, 2) if isinstance(raw_price, (int, float)) else None
                ws.append([
                    p.get('ean', ''),
                    p.get('isbn', ''),
                    p.get('title', ''),
                    price_eur,
                    p.get('format', ''),
                    p.get('condition', ''),
                    p.get('url', ''),
                ])
                row_count += 1
    except Exception as e:
        log.exception('Excel-Generierung fehlgeschlagen')
        return jsonify({'error': f'Excel-Generierung fehlgeschlagen: {e}'}), 500

    if row_count == 0:
        return jsonify({'error': 'Keine verwertbaren Produkte in JSONL'}), 409

    buf = io.BytesIO()
    wb.save(buf)
    excel_bytes = buf.getvalue()

    # Upload to Supabase Storage
    file_path = f'{scrape_id}.xlsx' if scrape_id else f'partial-{date.today().isoformat()}.xlsx'
    upload_url = f'{SUPABASE_URL}/storage/v1/object/rebuy-results/{file_path}'
    try:
        r = _requests.put(
            upload_url,
            data=excel_bytes,
            headers={
                'Authorization': f'Bearer {SUPABASE_KEY}',
                'apikey': SUPABASE_KEY,
                'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                'x-upsert': 'true',
            },
            timeout=60,
        )
        if r.status_code not in (200, 201):
            log.error('Supabase upload error: %s %s', r.status_code, r.text)
            return jsonify({'error': f'Supabase Upload fehlgeschlagen: {r.status_code}'}), 500
    except Exception as e:
        log.exception('Supabase upload exception')
        return jsonify({'error': f'Upload-Fehler: {e}'}), 500

    # Notify dashboard (best-effort, same as scraper does after normal finish)
    if NOTIFY_URL and scrape_id:
        body = json.dumps({
            'scrape_id':   scrape_id,
            'scrape_date': date.today().isoformat(),
            'file_path':   file_path,
            'row_count':   row_count,
            'status':      'success',
        })
        headers = {'Content-Type': 'application/json'}
        if HMAC_SECRET:
            sig = hmac.new(HMAC_SECRET.encode(), body.encode(), hashlib.sha256).hexdigest()
            headers['x-rebuy-signature'] = f'sha256={sig}'
        try:
            _requests.post(NOTIFY_URL, data=body, headers=headers, timeout=10)
        except Exception:
            pass  # Dashboard-Route macht das ohnehin auch selbst

    log.info('Finalize abgeschlossen: %d Produkte → %s', row_count, file_path)
    return jsonify({'file_path': file_path, 'row_count': row_count})


@app.route('/resume', methods=['POST'])
@require_api_key
def resume():
    """Restart scraper from checkpoint after proxy top-up. Does NOT clear JSONL or checkpoint."""
    with _lock:
        if _state['running']:
            return jsonify({'error': 'already_running', 'scrape_id': _state['scrape_id']}), 409

        # Read existing scrape_id from file (set during original trigger)
        scrape_id_file = Path('/opt/rebuy-scraper/scrape_id.txt')
        scrape_id = scrape_id_file.read_text().strip() if scrape_id_file.exists() else ''

        env = os.environ.copy()
        if scrape_id:
            env['SCRAPE_ID'] = scrape_id
        env['MODE'] = _load_default_mode()

        log_fd = open(LOG_FILE, 'a')
        proc = subprocess.Popen(
            [SCRAPER_PY, SCRAPER],
            env=env,
            stdout=log_fd,
            stderr=log_fd,
        )
        _state['running']   = True
        _state['pid']       = proc.pid
        _state['scrape_id'] = scrape_id
        _state['mode']      = env.get('MODE')
        log.info(f'Scraper RESUMED from checkpoint PID={proc.pid} scrape_id={scrape_id}')

    def _wait():
        proc.wait()
        with _lock:
            _state['running']   = False
            _state['pid']       = None
            _state['scrape_id'] = None
            _state['mode']      = None
        log.info(f'Scraper finished (resumed) exit={proc.returncode}')

    threading.Thread(target=_wait, daemon=True).start()
    return jsonify({'ok': True, 'scrape_id': scrape_id, 'pid': proc.pid})


@app.route('/rotate-ip', methods=['POST'])
@require_api_key
def rotate_ip():
    """Disconnect + reconnect Cloudflare Warp to get a new IP."""
    try:
        subprocess.run(['warp-cli', '--accept-tos', 'disconnect'], capture_output=True, timeout=10)
        import time; time.sleep(2)
        result = subprocess.run(['warp-cli', '--accept-tos', 'connect'], capture_output=True, timeout=15)
        if result.returncode != 0:
            return jsonify({'error': 'warp connect failed', 'stderr': result.stderr.decode()}), 500
        log.info('IP rotated via Cloudflare Warp')
        return jsonify({'ok': True})
    except FileNotFoundError:
        return jsonify({'error': 'Cloudflare Warp nicht installiert'}), 503
    except Exception as e:
        log.exception(e)
        return jsonify({'error': str(e)}), 500


@app.route('/schedule', methods=['POST'])
@require_api_key
def update_schedule():
    data     = request.get_json(force=True, silent=True) or {}
    schedule = data.get('schedule', '')

    schedule_map = {'manual': None}

    if ' *-*-* ' in schedule or schedule.startswith('*-*-*'):
        on_calendar = schedule
    elif schedule in schedule_map:
        on_calendar = schedule_map[schedule]
    else:
        on_calendar = schedule if schedule else None

    timer_path = '/etc/systemd/system/rebuy-scraper.timer'

    if on_calendar is None:
        subprocess.run(['sudo', 'systemctl', 'disable', '--now', 'rebuy-scraper.timer'],
                       capture_output=True)
        log.info('Schedule set to manual — timer disabled')
        return jsonify({'ok': True, 'schedule': 'manual'})

    timer_content = (
        '[Unit]\n'
        'Description=Rebuy Scraper Timer\n'
        'Requires=rebuy-server.service\n\n'
        '[Timer]\n'
        f'OnCalendar={on_calendar}\n'
        'Persistent=true\n\n'
        '[Install]\n'
        'WantedBy=timers.target\n'
    )

    try:
        result = subprocess.run(
            ['sudo', 'tee', timer_path],
            input=timer_content.encode(),
            capture_output=True,
        )
        if result.returncode != 0:
            return jsonify({'error': 'failed to write timer file'}), 500

        subprocess.run(['sudo', 'systemctl', 'daemon-reload'], capture_output=True)
        subprocess.run(['sudo', 'systemctl', 'enable', '--now', 'rebuy-scraper.timer'],
                       capture_output=True)
        log.info(f'Schedule updated: {on_calendar}')
        return jsonify({'ok': True, 'on_calendar': on_calendar})
    except Exception as e:
        log.exception(e)
        return jsonify({'error': str(e)}), 500


@app.route('/logs', methods=['GET'])
@require_api_key
def get_logs():
    """Return last 150 log lines, filtering out sensitive data."""
    SENSITIVE = ('supabase.co', 'service_key', 'SUPABASE', 'HMAC_SECRET', 'API_KEY')
    try:
        with open(LOG_FILE, 'r') as f:
            lines = f.readlines()
        filtered = [
            line.rstrip() for line in lines
            if not any(s in line for s in SENSITIVE)
        ]
        return jsonify({'lines': filtered[-150:], 'total': len(lines)})
    except FileNotFoundError:
        return jsonify({'lines': [], 'total': 0})


@app.route('/logs/clear', methods=['POST'])
@require_api_key
def clear_logs():
    """Truncate the scraper log file."""
    try:
        open(LOG_FILE, 'w').close()
        log.info('Log file cleared')
        return jsonify({'ok': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/proxy', methods=['POST'])
@require_api_key
def update_proxy():
    data = request.get_json(force=True, silent=True) or {}
    proxy_url = data.get('backup_proxy_url', '')
    env_path = Path(__file__).parent / '.env'
    lines = [l for l in env_path.read_text().splitlines()
             if not l.startswith('BACKUP_PROXY_URL=')
             and not l.startswith('HTTP_PROXY=')
             and not l.startswith('HTTPS_PROXY=')]
    if proxy_url:
        lines.append('BACKUP_PROXY_URL=' + proxy_url)
    env_path.write_text(chr(10).join(lines) + chr(10))
    if proxy_url:
        os.environ['BACKUP_PROXY_URL'] = proxy_url
    else:
        os.environ.pop('BACKUP_PROXY_URL', None)
    os.environ.pop('HTTP_PROXY', None)
    os.environ.pop('HTTPS_PROXY', None)
    status = 'set' if proxy_url else 'cleared'
    log.info('Backup proxy ' + status)
    return jsonify({'ok': True})


if __name__ == '__main__':
    log.info(f'Starting Flask on 127.0.0.1:{FLASK_PORT}')
    app.run(host='127.0.0.1', port=FLASK_PORT, debug=False)
