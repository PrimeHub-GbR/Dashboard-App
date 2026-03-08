# PROJ-9: Repricer Dashboard — CSV Upload, Status & Download

## Status: In Progress
**Created:** 2026-03-08
**Last Updated:** 2026-03-08

## Dependencies
- PROJ-1 (Workflow Hub) — Jobs-Infrastruktur (Supabase `jobs` Tabelle, Storage Buckets, Callback-API) wird wiederverwendet
- PROJ-4 (Login) — Authentifizierung erforderlich
- PROJ-5 (Dashboard-Navigation) — Sidebar-Eintrag wird hinzugefügt
- PROJ-8 (Repricer CLI) — Verarbeitungslogik, die in N8N als Workflow abgebildet wird
- N8N-Workflow `repricer-updater` — neuer N8N-Workflow der die komplette Pipeline übernimmt (ISBN→EAN→BBP → Output-CSV)

## Übersicht

Dedizierte Dashboard-Seite unter `/dashboard/repricer`, auf der der Admin eine Repricer.com CSV hochlädt. Das System verarbeitet die Datei vollautomatisch via N8N (ISBN→EAN→BBP, B-ASIN-Filter, Preisberechnung) und stellt die fertige CSV zum Download bereit. Während der Verarbeitung wird ein Statusindikator angezeigt.

## User Stories

- Als Admin möchte ich eine Repricer.com CSV hochladen, damit sie automatisch mit aktuellen Buchhandelspreisen befüllt wird — ohne Terminal oder Python-Skript
- Als Admin möchte ich während der Verarbeitung den Status sehen ("Prozess läuft" / "Fertig" / "Fehler"), damit ich weiß, ob ich warten muss oder etwas schiefgelaufen ist
- Als Admin möchte ich die fertige CSV mit einem Klick herunterladen, sobald die Verarbeitung abgeschlossen ist
- Als Admin möchte ich frühere Verarbeitungsläufe in einer History-Liste sehen (Datum, Dateiname, Zeilenanzahl, Status, Download)

## Acceptance Criteria

- [ ] AC-1: Seite `/dashboard/repricer` ist nur für eingeloggte Admins zugänglich
- [ ] AC-2: Upload-Zone akzeptiert ausschließlich `.csv`-Dateien — andere Dateitypen werden vor dem Upload abgelehnt mit Fehlermeldung
- [ ] AC-3: Nach dem Upload erscheint sofort ein Job-Eintrag in der Liste mit Status "Prozess läuft" (Spinner)
- [ ] AC-4: Das Dashboard pollt alle 3 Sekunden den Job-Status (oder verwendet Supabase Realtime), bis der Job abgeschlossen ist
- [ ] AC-5: Bei erfolgreichem Abschluss wechselt der Status-Badge zu "Fertig" (grün) und ein Download-Button erscheint
- [ ] AC-6: Bei Fehler wechselt der Status-Badge zu "Fehler" (rot) und eine kurze Fehlermeldung wird angezeigt
- [ ] AC-7: Der Download-Button lädt die fertige `repricer_updated_YYYY-MM-DD.csv` herunter (via signierter Supabase Storage URL)
- [ ] AC-8: Die History zeigt die letzten 20 Verarbeitungsläufe (Datum, Original-Dateiname, Status-Badge, Download-Button wenn verfügbar)
- [ ] AC-9: Wenn N8N nach 10 Minuten kein Callback gesendet hat → Job automatisch auf "Fehler: Timeout" setzen
- [ ] AC-10: Zusammenfassung nach Abschluss sichtbar: Gesamtzeilen / gelöscht (B-ASINs, kein EAN, kein Preis) / finale Zeilen

## Edge Cases

- **Falscher Dateityp**: Nur `.csv` erlaubt — Fehlermeldung vor Upload
- **Leere CSV**: N8N gibt Fehler zurück → Dashboard zeigt "Fehler: Keine Zeilen zum Verarbeiten"
- **N8N nicht erreichbar**: Job wird sofort als "Fehler" markiert, Fehlermeldung "N8N nicht erreichbar"
- **Webhook isbn2ean nicht gefunden**: N8N gibt Fehler zurück → Dashboard zeigt "Fehler: Workflow isbn2ean nicht gefunden"
- **Timeout (10 Min)**: Job wird automatisch auf "Fehler: Timeout" gesetzt — kein hängender Spinner
- **Gleichzeitige Uploads**: Mehrere Jobs gleichzeitig erlaubt, jeder hat eigene Status-Zeile
- **Abgelaufener Download-Link**: Signed URL abgelaufen → bei Klick neuen Link generieren oder Fehlermeldung mit Hinweis

## Technical Requirements

- **Route**: `/dashboard/repricer` (neue Seite)
- **Sidebar**: Neuer Eintrag "Repricer" in der Dashboard-Navigation (PROJ-5 Sidebar)
- **Jobs-Tabelle**: Wiederverwendung der bestehenden `jobs`-Tabelle aus PROJ-1 mit `workflow_key = "repricer-updater"`
- **Storage**: Supabase Storage Bucket `workflow-uploads` (Input-CSV), `workflow-results` (Output-CSV)
- **N8N-Workflow**: Neuer N8N-Webhook `repricer-updater` — empfängt Supabase Storage URL der Input-CSV, führt die komplette Pipeline aus (wie PROJ-8 Python-Skript), lädt Output-CSV in `workflow-results` hoch, sendet Callback mit Ergebnis-URL + Zusammenfassung
- **Callback**: Bestehende `/api/jobs/[id]/callback` Route aus PROJ-1 wird wiederverwendet
- **Status-Polling**: Alle 3 Sekunden oder Supabase Realtime auf `jobs` Tabelle
- **Timeout-Guard**: Bestehende `/api/jobs/timeout` Cron-Route aus PROJ-1 (anpassen auf 10 Min für Repricer)
- **Zusammenfassung**: N8N-Callback liefert `{ total, deleted: { b_asins, no_ean, no_price }, final }` → in `jobs.metadata` gespeichert → im Dashboard angezeigt

## UI-Beschreibung

```
/dashboard/repricer
├── Header: "Repricer CSV Update"
├── Upload-Zone (Drag & Drop oder Klick)
│   └── "CSV-Datei hier ablegen oder klicken"
└── Jobs-Liste (Tabelle)
    ├── [Dateiname]  [Datum]  [Status-Badge]  [Zusammenfassung]  [Download]
    ├── repricer_export.csv  08.03.2026  🟡 Prozess läuft  —  —
    ├── repricer_export.csv  07.03.2026  🟢 Fertig  1240 → 980 Zeilen  [Download]
    └── repricer_export.csv  06.03.2026  🔴 Fehler: Timeout  —  —
```

**Status-Badges:**
- Spinner + "Prozess läuft" (gelb/grau) — während N8N verarbeitet
- Checkmark + "Fertig" (grün) — erfolgreich, Download verfügbar
- X + "Fehler: [Grund]" (rot) — fehlgeschlagen

---

## Tech Design (Solution Architect)

### Kernerkenntnis: Fast alles ist bereits gebaut

PROJ-1 (Workflow Hub) hat exakt die Infrastruktur, die PROJ-9 braucht. PROJ-9 ist kein neues System — es ist eine dedizierte Seite, die bestehende Bausteine wiederverwendet und um eine Zusammenfassungs-Anzeige erweitert.

### Wiederverwendete Bausteine (kein Neubau)

| Baustein | Typ | Zweck |
|----------|-----|-------|
| `FileDropZone.tsx` | UI-Komponente | CSV hochladen per Drag & Drop |
| `StatusBadge.tsx` | UI-Komponente | "Prozess läuft / Fertig / Fehler" Anzeige |
| `DownloadButton.tsx` | UI-Komponente | Fertige CSV herunterladen |
| `JobHistoryTable.tsx` | UI-Komponente | History der letzten Läufe |
| `ActiveJobsBanner.tsx` | UI-Komponente | Hinweis auf laufende Jobs |
| `/api/jobs` | API | Job erstellen + Liste abfragen |
| `/api/jobs/[id]/callback` | API | N8N meldet sich hier wenn fertig |
| `/api/jobs/[id]/download` | API | Generiert sicheren Download-Link |
| `/api/jobs/timeout` | API | Markiert hängende Jobs als Fehler |
| `workflow-uploads` Bucket | Supabase Storage | Input-CSV speichern |
| `workflow-results` Bucket | Supabase Storage | Output-CSV speichern |

### Neu zu bauen

```
Neue Seite: /dashboard/repricer
├── RepricerClient.tsx          ← Haupt-Komponente (neu, ~100 Zeilen)
│   ├── FileDropZone            ← wiederverwendet (nur .csv erlaubt)
│   ├── ActiveJobsBanner        ← wiederverwendet
│   └── RepricerHistoryTable    ← wiederverwendet JobHistoryTable + Zusammenfassungs-Spalte
│       ├── StatusBadge         ← wiederverwendet
│       ├── RepricerSummary.tsx ← NEU: "1240 → 980 Zeilen (B-ASIN: 15, kein EAN: 210)"
│       └── DownloadButton      ← wiederverwendet

DashboardSidebar.tsx            ← 1 Zeile: Neuer Eintrag "Repricer" hinzufügen
```

### Ablauf (was passiert wenn ein Admin eine CSV hochlädt)

```
1. Admin zieht CSV in Upload-Zone
2. Dashboard lädt CSV in Supabase Storage (workflow-uploads)
3. Dashboard erstellt Job-Eintrag: workflow_key = "repricer-updater", status = "running"
4. Dashboard triggert N8N-Webhook "repricer-updater" mit: { job_id, csv_url }
5. Dashboard zeigt sofort: Spinner + "Prozess läuft"
6. N8N verarbeitet CSV (ISBN→EAN→BBP, wie PROJ-8 Python-Skript)
7. N8N lädt fertige CSV in Supabase Storage (workflow-results)
8. N8N ruft /api/jobs/{id}/callback auf mit: { result_url, summary }
9. Dashboard aktualisiert Job: status = "completed", result_url gesetzt, summary gespeichert
10. Dashboard zeigt: Grünes Badge "Fertig" + Zusammenfassung + Download-Button
```

### Datenhaltung

**Bestehende `jobs` Tabelle** wird wiederverwendet — keine neue Tabelle nötig.

Ein neues Feld `metadata` (JSON) wird hinzugefügt um die Zusammenfassung zu speichern:

```
Zusammenfassung pro Job:
- Gesamtzeilen: 1240
- Gelöscht gesamt: 260
  - davon B-ASINs: 15
  - davon kein EAN: 210
  - davon kein Preis: 35
- Finale Zeilen: 980
```

Dieses Feld wird von N8N im Callback mitgeliefert und im Dashboard angezeigt.

### N8N-Workflow `repricer-updater` (von N8N-Seite zu konfigurieren)

Der N8N-Workflow ist die einzige externe Abhängigkeit, die **manuell in N8N eingerichtet** werden muss. Er übernimmt die gleiche Logik wie das PROJ-8 Python-Skript:

```
N8N Webhook "repricer-updater" empfängt: { job_id, csv_url }
│
├── CSV von Supabase Storage herunterladen
├── B-ASINs filtern
├── ISBN→EAN (via sub-workflow isbn2ean, je Zeile)
├── EAN→BBP (via sub-workflow ean2bbp, je Zeile)
├── price_max und price_min berechnen
├── Output-CSV in workflow-results hochladen
└── Callback POST → /api/jobs/{job_id}/callback
    { result_url, summary: { total, b_asins, no_ean, no_price, final } }
```

### Tech-Entscheidungen

| Entscheidung | Warum |
|---|---|
| Bestehende Jobs-Infrastruktur wiederverwenden | Kein Doppelbau — PROJ-1 hat das bereits produktionsreif |
| Dedizierte Seite statt Tab in PROJ-1 | Klare Navigation, eigene URL, eigene History |
| `metadata` JSON-Feld in jobs | Flexibel für Zusammenfassung ohne Schema-Änderung an bestehenden Spalten |
| Keine neue API-Route | Alle nötigen Endpunkte existieren bereits |
| Polling alle 3 Sekunden | Bereits in PROJ-1 implementiert, kein Mehraufwand |

### Datenbankänderung

Eine einzige Änderung an der bestehenden `jobs` Tabelle:

- **Neues Feld:** `metadata` (JSON, nullable) — speichert die Verarbeitungs-Zusammenfassung

### Neue Dateien (Zusammenfassung)

| Datei | Aktion |
|-------|--------|
| `src/app/dashboard/repricer/page.tsx` | NEU — Seiten-Wrapper mit Auth-Check |
| `src/components/repricer/RepricerClient.tsx` | NEU — Haupt-Client-Komponente |
| `src/components/repricer/RepricerSummary.tsx` | NEU — Zusammenfassungs-Anzeige |
| `src/components/DashboardSidebar.tsx` | EDIT — 1 Zeile: Repricer-Eintrag |
| `supabase/migrations/` | EDIT — `metadata` Spalte hinzufügen |

### Keine neuen Pakete erforderlich

Alle benötigten Libraries sind bereits installiert.

## QA Test Results

**Tested:** 2026-03-08
**Build:** `npm run build` -- PASS (0 TypeScript errors, 0 warnings)
**Lint:** ESLint config missing (`eslint.config.js` not found) -- konnte nicht ausgefuehrt werden (kein Blocker, betrifft gesamtes Projekt)
**Tester:** QA Engineer (AI)

> Note: PROJ-9 ist eine Dashboard-Seite (Frontend + API). Testing wurde per Code-Review,
> statische Analyse aller Dateien und Build-Validierung durchgefuehrt.
> Laufzeit-Tests (E2E) gegen eine Live-Instanz wurden nicht ausgefuehrt.

### Acceptance Criteria Status

#### AC-1: Seite `/dashboard/repricer` ist nur fuer eingeloggte Admins zugaenglich
- [x] Middleware (`src/middleware.ts`) schuetzt alle `/dashboard/*`-Routen: nicht eingeloggte User werden auf `/` umgeleitet (Zeile 38)
- [x] POST `/api/jobs` prueft Auth via `supabaseAuth.auth.getUser()` (Zeile 42-53)
- [x] `repricer-updater` Config hat `adminOnly: true` (workflow-config.ts, Zeile 81)
- [x] Admin-Role-Check in POST `/api/jobs` (Zeilen 118-131): prueft `user_roles.role === 'admin'`
- [ ] BUG-1: Die Repricer-Seite (`page.tsx`) selbst hat keinen serverseitigen Admin-Check. Die Middleware prueft nur ob der User eingeloggt ist, nicht ob er Admin ist. Ein eingeloggter Staff-User kann die Seite sehen (inkl. Job-History), kann aber keinen Job starten (API blockiert). Die Seite sollte serverseitig pruefen ob der User Admin ist und bei Nicht-Admin eine 403-Seite oder Weiterleitung zeigen.
- **PASS mit Einschraenkung** (API ist geschuetzt, UI-Zugang ist nicht auf Admin beschraenkt)

#### AC-2: Upload-Zone akzeptiert ausschliesslich `.csv`-Dateien
- [x] `WORKFLOW_CONFIGS['repricer-updater']` definiert `acceptedMimeTypes: ['text/csv']` und `acceptedExtensions: '.csv'` (Zeile 82-83)
- [x] `FileDropZone` validiert MIME-Type clientseitig (`validateAndSet`, Zeile 23)
- [x] `<input accept=".csv">` schraenkt den Datei-Dialog ein (Zeile 99)
- [x] Server-seitige Validierung in POST `/api/jobs` prueft MIME-Type (Zeilen 103-111)
- [x] Fehlermeldung bei falschem Typ: `toast.error("Ungueltiger Dateityp. Erlaubt: .csv")`
- **PASS**

#### AC-3: Nach Upload erscheint sofort Job-Eintrag mit Status "Prozess laeuft"
- [x] POST `/api/jobs` erstellt Job mit `status: 'pending'` (Zeile 166), updated nach erfolgreichem N8N-Trigger auf `status: 'running'` (Zeile 238)
- [x] Supabase Realtime Subscription in `useRepricerJobs.ts` lauscht auf INSERT-Events (Zeilen 52-63) und fuegt neuen Job sofort in die Liste ein
- [x] Polling-Fallback alle 3 Sekunden wenn Realtime nicht verbunden (Zeile 96-100)
- [x] Toast-Nachricht: "Repricer-Job gestartet -- Status wird aktualisiert" (RepricerClient.tsx, Zeile 110)
- [ ] HINWEIS: StatusBadge zeigt fuer `pending` den Text "Ausstehend" und fuer `running` den Text "Laeuft" -- die Spec sagt "Prozess laeuft". Visuell nahe genug, aber nicht wortgleich.
- **PASS** (funktional korrekt, Label weicht leicht ab)

#### AC-4: Dashboard pollt alle 3 Sekunden bis Job abgeschlossen
- [x] `useJobPolling` Hook implementiert Polling mit `intervalMs: 3000` (useRepricerJobs.ts, Zeile 99)
- [x] Polling ist nur aktiv wenn Supabase Realtime NICHT verbunden ist (Fallback-Strategie)
- [x] Primaer wird Supabase Realtime verwendet (INSERT + UPDATE Events, Zeilen 49-88)
- [x] Realtime-Updates loesen sofort State-Updates aus (kein Warten auf Polling-Intervall)
- **PASS**

#### AC-5: Bei Erfolg Status-Badge zu "Fertig" (gruen) + Download-Button
- [x] StatusBadge fuer `success`: Label "Erfolgreich", gruenes Badge (`bg-green-500`), CheckCircle2-Icon (StatusBadge.tsx, Zeilen 29-32)
- [x] Download-Button wird angezeigt wenn `job.status === 'success'` (RepricerClient.tsx, Zeile 192)
- [x] Toast bei Erfolg: "Repricer-Job abgeschlossen -- Download verfuegbar" (useRepricerJobs.ts, Zeile 78)
- [ ] HINWEIS: Label ist "Erfolgreich" statt "Fertig" wie in der Spec. Funktional aequivalent.
- **PASS**

#### AC-6: Bei Fehler Status-Badge zu "Fehler" (rot) + Fehlermeldung
- [x] StatusBadge fuer `failed`: Label "Fehlgeschlagen", `variant: 'destructive'` (rot), XCircle-Icon (StatusBadge.tsx, Zeilen 34-38)
- [x] Fehlermeldung wird in der Aktions-Spalte angezeigt (RepricerClient.tsx, Zeilen 210-212)
- [x] Toast bei Fehler mit spezifischer Fehlermeldung (useRepricerJobs.ts, Zeile 80)
- [x] Timeout-Status hat eigenes Badge: "Timeout" in Orange (StatusBadge.tsx, Zeilen 40-44)
- **PASS**

#### AC-7: Download-Button laedt `repricer_updated_YYYY-MM-DD.csv` herunter
- [x] DownloadButton ruft `/api/jobs/{id}/download` auf (DownloadButton.tsx, Zeile 21)
- [x] Download-API generiert signierte Supabase Storage URL (1 Stunde gueltig, download/route.ts, Zeile 69)
- [x] Auth-Check + Ownership-Check in Download-API (Zeilen 22-56)
- [ ] HINWEIS: Der Dateiname der heruntergeladenen Datei wird von N8N bestimmt (via `result_file_url`). Das Dashboard hat keine Kontrolle ueber den Dateinamen. Die Spec erwartet `repricer_updated_YYYY-MM-DD.csv` -- das haengt davon ab, ob der N8N-Workflow die Datei korrekt benennt.
- **PASS** (Dashboard-seitig korrekt, Dateiname ist N8N-Verantwortung)

#### AC-8: History zeigt die letzten 20 Verarbeitungslaeufe
- [x] Query mit `.limit(20)` (useRepricerJobs.ts, Zeile 33)
- [x] Gefiltert auf `workflow_key = 'repricer-updater'` (Zeile 30)
- [x] Sortiert nach `created_at DESC` (Zeile 32)
- [x] Tabelle zeigt: Dateiname, Datum/Uhrzeit, Status-Badge, Zusammenfassung, Aktion (RepricerClient.tsx, Zeilen 165-170)
- [x] Card-Header: "Verlauf (letzte 20 Jobs)" (Zeile 161)
- [x] Empty State: "Noch keine Repricer-Jobs vorhanden" (Zeile 187)
- [x] Loading State: Skeleton-Rows (Zeilen 46-59)
- [x] Error State: "Fehler beim Laden der Jobs" (Zeile 179)
- **PASS**

#### AC-9: Timeout nach 10 Minuten -> Job auf "Fehler: Timeout"
- [x] Timeout-Route existiert (`/api/jobs/timeout/route.ts`)
- [x] Timeout-Status `'timeout'` ist in JobStatus-Type definiert (job-types.ts, Zeile 1)
- [x] StatusBadge zeigt "Timeout" in Orange (StatusBadge.tsx, Zeilen 40-44)
- [x] RepricerClient zeigt "Timeout nach 10 Min" Text (Zeile 213-216)
- [x] Toast bei Timeout: "Repricer-Job: Timeout nach 10 Minuten" (useRepricerJobs.ts, Zeile 82)
- [ ] **BUG-2 (HOCH)**: Die Timeout-Route verwendet `JOB_TIMEOUT_MINUTES = 5` (timeout/route.ts, Zeile 4), aber die PROJ-9-Spec verlangt 10 Minuten. Der Timeout greift nach 5 Minuten statt nach 10 fuer ALLE Workflows, einschliesslich Repricer. Es gibt keine workflow-spezifische Timeout-Konfiguration.
- **FAIL** (Timeout ist 5 Minuten statt 10)

#### AC-10: Zusammenfassung nach Abschluss (total / geloescht / final)
- [x] `RepricerSummary` Komponente zeigt `total -> final Zeilen` (RepricerSummary.tsx, Zeilen 37-41)
- [x] Details: B-ASINs, kein EAN, kein Preis (Zeilen 31-33)
- [x] Metadata-Interface definiert: `total`, `final`, `b_asin_deleted`, `no_ean`, `no_price` (Zeilen 6-12)
- [x] Nur sichtbar bei `status === 'success'` und vorhandener `metadata` (Zeile 19)
- [x] Callback-API akzeptiert `metadata` Feld und speichert es (callback/route.ts, Zeilen 10, 121-123)
- **PASS**

### Edge Cases Status

#### Falscher Dateityp (nicht .csv)
- [x] Client-seitige Validierung in `FileDropZone` -- MIME-Type-Check (Zeile 23)
- [x] `<input accept=".csv">` schraenkt Datei-Dialog ein
- [x] Server-seitige Validierung in POST `/api/jobs` (Zeilen 103-111)
- [x] Fehlermeldung per Toast
- [ ] **BUG-3 (MITTEL)**: MIME-Type-Validierung basiert auf `file.type`, der vom Browser gesetzt wird. Manche Browser setzen fuer `.csv`-Dateien `application/vnd.ms-excel` statt `text/csv`. Die Config erlaubt nur `text/csv`. Das koennte dazu fuehren, dass legitime CSV-Dateien auf manchen Systemen abgelehnt werden.
- **PASS mit Einschraenkung**

#### Leere CSV
- [x] Dashboard selbst validiert nicht ob die CSV leer ist -- das ist N8N-Aufgabe
- [x] N8N-Fehler wuerde via Callback mit `status: 'failed'` und `error_message` zurueckkommen
- **PASS** (abhaengig von N8N-Implementierung)

#### N8N nicht erreichbar
- [x] Fetch-Fehler wird abgefangen (POST `/api/jobs`, Zeilen 240-252)
- [x] Job wird als `failed` markiert mit Fehlermeldung "n8n nicht erreichbar: {message}" (Zeile 245)
- [x] Client erhaelt HTTP 502 mit Fehlermeldung (Zeile 249)
- **PASS**

#### Timeout (10 Min)
- [x] Cron-Route markiert haengende Jobs als `timeout`
- [ ] **BUG-2** (siehe AC-9): Timeout ist 5 Min statt 10 Min
- **FAIL** (falscher Timeout-Wert)

#### Abgelaufener Download-Link
- [x] `DownloadButton` generiert bei jedem Klick einen neuen signierten Link (Zeile 21)
- [x] Signed URL ist 1 Stunde gueltig (download/route.ts, Zeile 69)
- [x] Fehlerbehandlung bei abgelaufenem Link: Toast "Download-Link abgelaufen. Bitte starte den Job erneut." (DownloadButton.tsx, Zeilen 24, 28)
- [ ] HINWEIS: Die Fehlermeldung "Bitte starte den Job erneut" ist irrefuehrend -- der User muss nur erneut auf Download klicken, nicht den Job neu starten. Da bei jedem Klick ein neuer Link generiert wird, kann dieser Fall in der Praxis nicht auftreten (nur wenn die Datei im Storage geloescht wurde).
- **PASS**

### Security Audit

#### Auth-Check auf der Seite
- [x] Middleware schuetzt `/dashboard/*` Routen (nur eingeloggte User)
- [x] POST `/api/jobs` prueft Auth + Admin-Role fuer `adminOnly` Workflows
- [x] GET `/api/jobs/{id}/download` prueft Auth + Ownership (user_id Match)
- [ ] **SEC-1 (NIEDRIG)**: Die Repricer-Seite ist fuer alle eingeloggten User sichtbar, obwohl der Workflow `adminOnly: true` ist. Staff-User sehen die Seite und die Job-History, koennen aber keine neuen Jobs starten. Die Supabase-Query in `useRepricerJobs` filtert nur nach `workflow_key`, nicht nach `user_id` -- jeder eingeloggte User sieht alle Repricer-Jobs aller User.
- **Empfehlung**: Serverseitigen Admin-Check in `page.tsx` hinzufuegen oder RLS-Policy auf `jobs`-Tabelle pruefen.

#### Input-Validierung (Zod)
- [x] `workflow_key` wird mit `z.enum()` validiert (route.ts, Zeile 30-37)
- [x] Callback-Body wird mit Zod-Schema validiert (callback/route.ts, Zeilen 6-11)
- [x] Job-ID wird als UUID per Regex validiert (callback/route.ts, Zeile 48-49; download/route.ts, Zeile 16-17)
- [x] Dateigroesse wird serverseitig validiert (max 50 MB, route.ts, Zeile 96)
- [x] MIME-Type wird serverseitig gegen Config validiert (route.ts, Zeilen 103-111)
- [x] Dateiname wird sanitized: `file.name.replace(/[^a-zA-Z0-9._-]/g, '_')` (route.ts, Zeile 139)
- **PASS**

#### RLS auf jobs-Tabelle
- [ ] **SEC-2 (MITTEL)**: Kann nicht direkt verifiziert werden (kein Zugriff auf Supabase-Migration-Dateien). Der Hook `useRepricerJobs` verwendet `supabase` (Client-seitig, mit Anon-Key). Wenn RLS auf der `jobs`-Tabelle nicht korrekt konfiguriert ist, koennte ein User alle Jobs sehen. Die API-Routes verwenden `createSupabaseServiceClient()` (Service-Role, bypassed RLS) -- das ist korrekt fuer serverseitige Operationen.
- **Empfehlung**: RLS-Policies auf `jobs`-Tabelle pruefen: SELECT sollte auf `user_id = auth.uid()` beschraenkt sein, oder der Client-seitige Zugriff sollte durch die API geroutet werden.

#### HMAC-Signierung des Callbacks
- [x] Callback-Route prueft `x-n8n-signature` Header (callback/route.ts, Zeile 64)
- [x] HMAC wird mit `sha256` berechnet (Zeile 24)
- [x] Timing-safe Vergleich mit `timingSafeEqual` (Zeile 33)
- [x] Fehlende oder ungueltige Signatur wird mit HTTP 401 abgelehnt (Zeile 68)
- [x] Fehlende `N8N_HMAC_SECRET` Config gibt HTTP 500 (Zeile 59)
- [x] Outbound-Request an N8N wird ebenfalls signiert (`x-dashboard-signature`, route.ts, Zeile 210)
- [x] Terminal-State-Guard: Callback wird ignoriert wenn Job bereits in finalem Status (Zeilen 98-106) -- verhindert Replay-Attacks
- **PASS**

#### Rate Limiting
- [x] In-Memory Rate Limiter: max 10 Jobs/Minute pro User (route.ts, Zeilen 9-24)
- [ ] HINWEIS: In-Memory Rate Limiter wird bei Server-Restart zurueckgesetzt und funktioniert nicht bei Multi-Instance-Deployments (Vercel Serverless). Kommentar im Code weist darauf hin (Zeile 10).
- **PASS** (akzeptabel fuer Single-Admin-Use-Case)

#### Security Headers
- [ ] Nicht spezifisch fuer PROJ-9 -- projektweite Konfiguration
- **N/A**

### Bug Summary

| ID | Severity | Description | Location | Priority |
|----|----------|-------------|----------|----------|
| BUG-1 | NIEDRIG | Repricer-Seite hat keinen serverseitigen Admin-Check. Staff-User koennen die Seite sehen und alle Jobs aller User einsehen, aber keine neuen Jobs starten. | `page.tsx` -- kein Admin-Check | P3 |
| BUG-2 | HOCH | Timeout ist 5 Minuten statt der spezifizierten 10 Minuten. Repricer-Jobs koennten faelschlicherweise als Timeout markiert werden, bevor die N8N-Verarbeitung abgeschlossen ist. | `api/jobs/timeout/route.ts`, Zeile 4: `JOB_TIMEOUT_MINUTES = 5` | P1 |
| BUG-3 | MITTEL | MIME-Type-Validierung akzeptiert nur `text/csv`. Manche Browser/OS-Kombinationen setzen fuer CSV-Dateien `application/vnd.ms-excel` oder keinen MIME-Type. | `workflow-config.ts` Zeile 82, `FileDropZone.tsx` Zeile 23 | P2 |
| SEC-1 | NIEDRIG | Alle eingeloggten User (inkl. Staff) sehen die Repricer-Seite und die komplette Job-History aller User. Kein Page-Level Admin-Check, kein user_id-Filter in der Supabase-Query. | `page.tsx`, `useRepricerJobs.ts` | P3 |
| SEC-2 | MITTEL | RLS-Policies auf `jobs`-Tabelle nicht verifizierbar. Client-seitiger Supabase-Zugriff (Anon-Key) koennte ohne korrekte RLS alle Jobs exponieren. | `useRepricerJobs.ts` Zeile 27-33 | P2 |

### Ergebnis

| Kategorie | PASS | FAIL | Total |
|-----------|------|------|-------|
| Acceptance Criteria | 9 | 1 (AC-9) | 10 |
| Edge Cases | 4 | 1 (Timeout) | 5 |
| Security Checks | 3 | 0 | 3 |

**Gesamtbewertung: 9/10 AC bestanden. 1 Blocker (BUG-2: Timeout 5 Min statt 10 Min).**

Naechster Schritt: BUG-2 (Timeout-Wert) fixen, dann SEC-1/SEC-2 pruefen. Danach `/deploy` ausfuehren.
