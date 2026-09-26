# n8n-Server — Betrieb und Störung vom 26.09.2026

_Stand 26.09.2026._

## Steckbrief

| | |
|---|---|
| Adresse | https://n8n.primehubgbr.com (über Cloudflare-Tunnel, kein offener Port) |
| Host | Proxmox-Container **CT 113**, Hostname `n8n`, Root-Disk **20 GB** |
| n8n | 1.121.3, global per npm installiert (`/usr/lib/node_modules/n8n`) |
| Betriebsart | Queue-Modus: `n8n.service` (Main) + `n8n-worker.service` (Worker) |
| Datenbank | PostgreSQL 15 lokal, DB `n8n_main` (die `database.sqlite` in `~/.n8n` ist leer und ungenutzt) |
| Binärdaten | `N8N_DEFAULT_BINARY_DATA_MODE=filesystem` → `/root/.n8n/binaryData` |
| Aufbewahrung | `EXECUTIONS_DATA_MAX_AGE=72` (Stunden) |
| Tunnel | `cloudflared.service`, Konfiguration `/etc/cloudflared/config.yml` |

Zugang: Proxmox-Oberfläche → CT 113 → Console (als `root`). Claude hat **keinen**
Zugang zum Server — Befehle führt der Nutzer aus.

## Die Störung vom 26.09.2026

**Symptom:** n8n antwortete mit `503 Database is not ready!`, danach Cloudflare-Fehler
**1033** (Tunnel weg). Dashboard, PlentyONE-Abholungen und n8n-MCP ohne Verbindung.

**Letzter Lauf vor dem Ausfall:** 24.09.2026 19:15 (fehlgeschlagen). Die Nachtläufe
vom **25. und 26.09.** (Bilder verknüpfen, Listings prüfen, Statusbericht) fielen aus.
Sie sind wiederholbar und holen alles beim nächsten Lauf nach.

### Ursache 1 — Platte voll (99 %)

| Verbraucher | Größe |
|---|---|
| `/root/.n8n/binaryData` | **13 GB** |
| `/root/.npm/_cacache` (npm-Cache) | 1,4 GB |
| PostgreSQL | 0,9 GB |

Die 13 GB lagen fast vollständig in **`binaryData/workflows/<id>/executions/temp`**.
Dort legt n8n Binärdaten während eines Laufs ab; bei Läufen, die nicht gespeichert
werden, bleiben sie liegen — die Aufbewahrungsfrist (72 h) räumt nur Ordner
gespeicherter Ausführungen weg. Verwaiste Ordner gespeicherter Ausführungen: **0**.

| Workflow | ID | temp |
|---|---|---|
| Schreibe neue EANs in Datenbank | `vuudL1ZjSLRgaQAl` | 4,8 GB |
| Blank Workflow | `OP7PJDERAnoqSI3X` | 4,8 GB |
| A43 Order | `kMPmYif8Z3vbcpy4` | 1,8 GB |
| [Dashboard] Blank Wareneingang | `PUcABZg5Mx0xUNwm` | 1,3 GB |
| Blank Order | `6FrRBIqdZWKOCivP` | 0,3 GB |

### Ursache 2 — `/etc/resolv.conf` leer

Beim Volllaufen wurde `/etc/resolv.conf` auf **0 Byte** geschrieben (16:26). Ohne
Namensserver fragte `cloudflared` bei `[::1]:53` nach, dort läuft keiner → der Tunnel
beendete sich bei jedem Start (`status=1/FAILURE`, Restart-Zähler > 130).
Log-Zeile: `lookup region1.v2.argotunnel.com on [::1]:53: ... connection refused`.

Die Meldung `Cannot determine default origin certificate path` erscheint bei jedem
Start und ist **harmlos**.

### Behebung

```bash
# Platz schaffen
npm cache clean --force
find /root/.n8n/binaryData/workflows/*/executions/temp -type f -mmin +1440 -delete
find /root/.n8n/binaryData/workflows/*/executions/temp -mindepth 1 -type d -empty -delete
# → 23 % belegt, 15 GB frei

# Dienste neu starten
systemctl restart postgresql
systemctl restart n8n n8n-worker

# Namensauflösung wiederherstellen, dann Tunnel
printf 'nameserver 192.168.178.1\nnameserver 1.1.1.1\n' > /etc/resolv.conf
systemctl restart cloudflared
```

## Dauerhafte Vorsorge (eingerichtet)

`/etc/cron.d/n8n-binary-cleanup` — täglich **06:30**, nach der Nachtkette:

```
30 6 * * * root find /root/.n8n/binaryData/workflows/*/executions/temp -type f -mmin +1440 -delete; find /root/.n8n/binaryData/workflows/*/executions/temp -mindepth 1 -type d -empty -delete
```

Löscht nur `temp`-Dateien, die älter als 24 Stunden sind — kein laufender Workflow
braucht sie dann noch.

## Schnell-Diagnose

```bash
df -h /                                                   # Platte
curl -s localhost:5678/healthz/readiness; echo            # n8n + DB: {"status":"ok"}
systemctl status n8n n8n-worker cloudflared --no-pager | grep -E "●|Active"
journalctl -u cloudflared -n 30 --no-pager                # Tunnel-Fehler
cat /etc/resolv.conf                                      # darf nicht leer sein
du -sh /root/.n8n/binaryData/workflows/*/executions/temp 2>/dev/null | sort -rh | head
```

| Von außen sichtbar | Bedeutung |
|---|---|
| `503 Database is not ready!` | Postgres nicht erreichbar — meist Platte voll |
| Cloudflare **1033** / HTTP 530 | Tunnel down — `cloudflared` prüfen, oft DNS |
| `{"status":"ok"}` auf `/healthz/readiness` | alles in Ordnung |

## Offene Punkte

1. **Datenbank-Passwort ändern.** Der Wert von `DB_POSTGRESDB_PASSWORD` war am
   26.09.2026 in einem Screenshot im Claude-Chat sichtbar. Postgres hört nur auf
   `127.0.0.1` — Risiko gering, trotzdem neu setzen (Postgres + n8n-Umgebung, beide
   Dienste neu starten).
2. **Zeitzone.** Die Zeitpläne laufen sechs Stunden später als vorgesehen („04:00"
   startete um 10:00 deutscher Zeit) — n8n rechnet offenbar in New Yorker Zeit.
   Abhilfe: `GENERIC_TIMEZONE=Europe/Berlin` in der n8n-Umgebung.
3. **n8n-API-Schlüssel** in `.env.local` (`N8N_API_KEY`) wird abgelehnt
   (`unauthorized`). Prüfen, ob der Wert in Vercel ebenfalls veraltet ist
   (Workflow-Monitor im Dashboard).
4. **Platte beobachten.** Optional Root-Disk in Proxmox vergrößern
   (CT 113 → Resources → Root Disk → Resize, wirkt ohne Neustart) und eine Warnung
   ab 80 % einrichten.
