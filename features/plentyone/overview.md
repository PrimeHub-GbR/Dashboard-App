# PlentyONE-Migration — Dashboard-Tab

**Status:** In Progress
**Route:** `/dashboard/plentyone`
**Zugriff:** Admin + Manager

## Ziel

Der Amazon-Listing-Export wird im Dashboard hochgeladen. Zwei N8N-Workflows laufen
**parallel** und liefern zwei Ergebnisse: die für PlentyONE fertige Import-CSV und die
Buchcover als ZIP-Pakete. Der Nutzer sieht je Strang den Fortschritt, danach die Downloads,
die Mapping-Tabelle und einen Hinweisblock zu unvollständigen Titeln.

Ersetzt den bisherigen lokalen Ablauf (Python-Skript + zwei Form-Workflows in N8N).

## User Stories

- Als Admin lade ich den **Amazon-Originalexport** (`.txt`, Tab-getrennt) hoch und starte den Lauf.
- Ich sehe je Strang (CSV / Cover) den Status, ohne raten zu müssen, ob etwas hängt.
- Ich lade die fertige CSV und die Cover-ZIPs herunter.
- Ich sehe **im Dashboard**, welche ISBN welche Angaben fehlen — nicht als Fehler-CSV.
- Ich sehe die Mapping-Tabelle inkl. Beschreibung jeder Spalte, auch Monate später.
- Ich sehe die letzten **3 Läufe** mit Datum; CSV und Cover sind je Lauf klar verknüpft.

## Akzeptanzkriterien

1. Upload akzeptiert `.txt` und `.csv`, max. 50 MB; andere Typen werden abgewiesen.
2. Nur `admin` und `manager` können starten (Rolle serverseitig geprüft, RLS aktiv).
3. **Nur ein Lauf gleichzeitig** — die VLB erlaubt 2 Sessions, ein Lauf belegt beide.
   Ein zweiter Startversuch wird mit klarer Meldung abgewiesen.
4. Beide Stränge starten parallel und melden unabhängig per Callback zurück.
5. Der Lauf gilt als `success`, wenn beide Stränge erfolgreich sind; als `partial`,
   wenn genau einer fehlschlägt.
6. Es werden maximal **3 Läufe** aufbewahrt. Beim Start eines neuen Laufs wird der
   älteste samt seiner Dateien im Laufordner gelöscht. **Cover-ZIPs bleiben** — sie
   liegen laufübergreifend unter `plentyone/cover/` und hängen am Cover-Bestand.
6a. **Cover-Bestand** (`plentyone_cover`): jede je geladene ISBN mit Titel, Status
   (`ok`/`fehlt`), Paket, Ladezeitpunkt und Haken „in PlentyONE hochgeladen" (je Paket).
   Ein neuer Cover-Lauf holt nur ISBN, die dort noch nicht `ok` sind; `fehlt` wird
   erneut versucht. Der Storage wächst dadurch dauerhaft (~600 MB für 2.000 Cover) —
   bewusst, damit nie ein Cover zweimal aus der VLB geholt werden muss.
7. Der Hinweisblock listet je betroffener ISBN auf, was fehlt (kein VLB-Treffer, kein
   Cover, Gewicht pauschaliert, kein GPSR-Kontakt, kein gebundener Ladenpreis).
8. Die Mapping-Tabelle zeigt Quellspalte, Zielfeld, Zusatz-Dropdown und eine
   Klartext-Beschreibung des Inhalts.
9. Optionaler Testlauf: „nur die ersten N Zeilen" begrenzt den Lauf.

## Tech Design

### Ablauf
```
Upload (.txt)  ->  POST /api/plentyone/runs
                     legt Lauf an, löscht den ältesten (Retention 3),
                     lädt die Datei nach Storage
                     triggert BEIDE Webhooks parallel
                         |
        +----------------+----------------+
        v                                 v
  WF "plentyone-metadata"           WF "plentyone-cover"
  Aufbereitung + VLB-Stapelabruf    Aufbereitung + Cover-Abruf
  -> plentyONE_Import_final.csv     -> cover_0001-0250.zip ...
  -> Upload Storage                 -> Upload Storage
  -> Callback (csv)                 -> Callback (cover)
        |                                 |
        +----------------+----------------+
                         v
              UI pollt GET /api/plentyone/runs/<id>
```

**Beide Workflows enthalten denselben Aufbereitungs-Code.** Er wird aus einer Quelle
generiert, damit die Logik nicht auseinanderläuft. Sie laufen dadurch unabhängig
voneinander und brauchen keine Zwischendatei.

### Datenmodell — `plentyone_runs`

| Spalte | Typ | Inhalt |
|---|---|---|
| `id` | uuid | Lauf-ID, zugleich Storage-Ordner |
| `user_id` | uuid | Starter |
| `status` | text | `running` · `success` · `partial` · `failed` |
| `input_path` / `input_name` | text | hochgeladener Amazon-Export |
| `zeilen_limit` | int | optionaler Testlauf |
| `csv_status` / `csv_path` / `csv_error` | text | Strang 1 |
| `cover_status` / `cover_error` | text | Strang 2 |
| `cover_pakete` | jsonb | `[{name, datei, von, bis, gefunden, fehlend}]` — wächst während des Laufs je Paket-Callback |
| `stats` | jsonb | Zählwerte für die Ergebnisanzeige |
| `hinweise` | jsonb | `[{isbn, variantennummer, titel, fehlt:[...]}]` |

Retention in `POST /api/plentyone/runs`: älteste Läufe über 3 löschen, Storage-Dateien
nur aus dem Laufordner mitlöschen (Storage kennt keine Fremdschlüssel).

**Tabelle `plentyone_cover`** (Migration 145): `isbn` PK, `titel`, `status ok|fehlt`,
`grund`, `paket`, `paket_pfad`, `run_id` (SET NULL beim Löschen des Laufs), `geladen_am`,
`plenty_hochgeladen_am`. RPCs: `plentyone_cover_bekannt()` (alle `ok`-ISBN als Array —
PostgREST kappt Listen bei 1.000), `plentyone_cover_melden(run, paket, pfad, cover jsonb)`
(Upsert, ein vorhandenes `ok` wird nie auf `fehlt` zurückgesetzt), `plentyone_cover_zaehler()`.

### Storage — Bucket `workflow-results` (privat)
```
plentyone/<run_id>/plentyONE_Import_final.csv      (+ Eigenschaften-/Hersteller-CSV)
plentyone/cover/<run_id>_cover_0001-0050.zip       laufübergreifend, wird nie gelöscht
```
Eingabedatei: Bucket `workflow-uploads`, `plentyone/<run_id>/<dateiname>`.

### API
| Route | Zweck |
|---|---|
| `POST /api/plentyone/runs` | Upload, Retention, Lauf anlegen, beide Webhooks triggern |
| `GET /api/plentyone/runs` | Liste der letzten 3 Läufe |
| `GET /api/plentyone/runs/[id]` | Status eines Laufs (Polling) |
| `POST /api/plentyone/runs/[id]/strang` | einen Strang (`csv`/`cover`) aus `pending`/`failed` nachstarten |
| `POST /api/plentyone/runs/[id]/callback` | Rückmeldung aus N8N, `strang` = `csv` \| `cover`; `status` = `success` \| `failed` \| `paket` (Cover: je ZIP sofort, füllt den Bestand) |
| `GET /api/plentyone/runs/[id]/download` | signierte URL, Parameter `datei` |
| `GET /api/plentyone/cover` | Cover-Bestand: Suche `q`, `nur_offen=1`, `seite` (100 je Seite), Zähler |
| `PATCH /api/plentyone/cover` | `{paket_pfad, hochgeladen}` → Haken „in PlentyONE" für das ganze Paket |
| `GET /api/plentyone/cover/[isbn]/download` | signierte URL auf das ZIP-Paket der ISBN |

Prozesslogik bleibt vollständig in N8N (N8N-First-Regel). Das Backend macht Upload,
Job-Tracking, signierte URLs und Callback-Empfang.

### Mapping-Tabelle
Statisch in `src/lib/plentyone-mapping.ts` — versioniert mit dem Code, kein DB-Zugriff nötig.
Enthält je Spalte: Nummer, Quellspalte, Zielfeld, Zusatz-Dropdown, Import an/aus,
Herkunft (Amazon / VLB / berechnet) und eine Klartext-Beschreibung.

### n8n — Cover-Strang (Stand 13.09.2026)
Aufbereiten → **Bekannte Cover laden** (RPC) → **Neue Cover filtern** (50er-Pakete) →
IF „Neue Cover vorhanden?" (nein → direkt Cover-Ergebnis, kein VLB-Login) → VLB Login →
Loop: Cover laden → bündeln → IF „Paket brauchbar?" (volles Paket ohne ein einziges Cover
→ Fehlerpfad) → ZIP → Upload → **Paket melden** (Callback `paket`) → Paket merken.
Voraussetzung auf dem n8n-Host: `N8N_DEFAULT_BINARY_DATA_MODE=filesystem` und
`saveExecutionProgress` aus — sonst wächst der Ausführungsdatensatz quadratisch und der
Lauf bleibt nach ~6 Paketen stehen. Quelle: `plentyone-migration/scripts/gen_wf_dashboard.py`.

## Offene Punkte
- Die 2 Cover unter 1.024 px lassen sich nicht verbessern — die VLB liefert nicht mehr.
- HTML in `vlb_beschreibung` bleibt erhalten (Entscheidung offen für Kaufland/eBay).
