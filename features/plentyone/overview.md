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
   älteste samt aller Dateien im Storage gelöscht.
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
| `cover_pakete` | jsonb | `[{name, path, von, bis, gefunden, fehlend, bytes}]` |
| `stats` | jsonb | Zählwerte für die Ergebnisanzeige |
| `hinweise` | jsonb | `[{isbn, variantennummer, titel, fehlt:[...]}]` |

Retention über `enforce_plentyone_retention()` beim Insert: älteste Läufe über 3 löschen.
Storage-Dateien werden von der API mitgelöscht (Storage kennt keine Fremdschlüssel).

### Storage — Bucket `plentyone` (privat)
```
<run_id>/input/<dateiname>
<run_id>/csv/plentyONE_Import_final.csv
<run_id>/cover/cover_0001-0250.zip
```

### API
| Route | Zweck |
|---|---|
| `POST /api/plentyone/runs` | Upload, Retention, Lauf anlegen, beide Webhooks triggern |
| `GET /api/plentyone/runs` | Liste der letzten 3 Läufe |
| `GET /api/plentyone/runs/[id]` | Status eines Laufs (Polling) |
| `POST /api/plentyone/runs/[id]/callback` | Rückmeldung aus N8N, Feld `strang` = `csv` \| `cover` |
| `GET /api/plentyone/runs/[id]/download` | signierte URL, Parameter `datei` |

Prozesslogik bleibt vollständig in N8N (N8N-First-Regel). Das Backend macht Upload,
Job-Tracking, signierte URLs und Callback-Empfang.

### Mapping-Tabelle
Statisch in `src/lib/plentyone-mapping.ts` — versioniert mit dem Code, kein DB-Zugriff nötig.
Enthält je Spalte: Nummer, Quellspalte, Zielfeld, Zusatz-Dropdown, Import an/aus,
Herkunft (Amazon / VLB / berechnet) und eine Klartext-Beschreibung.

## Offene Punkte
- Die 2 Cover unter 1.024 px lassen sich nicht verbessern — die VLB liefert nicht mehr.
- HTML in `vlb_beschreibung` bleibt erhalten (Entscheidung offen für Kaufland/eBay).
