# PROJ-1: N8N Workflow Hub

## Status: Deployed
**Created:** 2026-03-03
**Last Updated:** 2026-03-03

## Dependencies
- None (erstes Feature, bildet die Grundlage für Workflow-Triggering)

## Übersicht

Zentraler Bereich im Dashboard, über den Dateien hochgeladen, n8n-Workflows getriggert und verarbeitete Ergebnisdateien heruntergeladen werden können. Ersetzt den bisherigen Telegram-basierten Workflow-Zugang.

## Betroffene n8n Workflows

| Workflow-Key | Beschreibung | Erwartete Eingabe | Erwartete Ausgabe |
|-------------|-------------|------------------|------------------|
| `sellerboard` | EK-Preise aus Sellerboard importieren | CSV/Excel Export aus Sellerboard | Bestätigungs-Status (kein Datei-Download) |
| `kulturgut` | Produktkatalog verarbeiten | Produktkatalog-Datei (CSV/Excel) | Verarbeiteter Katalog als Datei |
| `a43-export` | A43-Format Export für Lieferanten | Quelldatei | A43-formatierte Export-Datei |
| `avus-export` | Avus-Format Export (Admin only) | Quelldatei | Avus-formatierte Export-Datei |
| `blank-export` | Leere Report-Vorlage generieren | Keine Datei nötig | Vorlage als Datei |

## User Stories

- Als Admin möchte ich eine Sellerboard CSV/Excel hochladen, damit n8n automatisch die EK-Preise in die Datenbank importiert
- Als Admin möchte ich eine Kulturgut-Katalogdatei hochladen und die verarbeitete Version herunterladen
- Als Admin möchte ich nach dem Upload den Verarbeitungsstatus in Echtzeit verfolgen (Pending → Running → Success/Failed)
- Als Staff möchte ich die Upload-Historie der letzten 30 Tage sehen (Dateiname, Workflow, Datum, Status)
- Als Admin möchte ich fehlgeschlagene Workflows mit einer verständlichen Fehlermeldung sehen
- Als Admin möchte ich nach erfolgreichem Workflow die Ergebnisdatei mit einem Klick herunterladen

## Acceptance Criteria

- [ ] Gegeben ein angemeldeter Admin, wenn er eine .csv oder .xlsx Datei in den Upload-Bereich zieht, dann wird die Datei validiert und in Supabase Storage hochgeladen
- [ ] Gegeben eine hochgeladene Datei, wenn der Admin einen Workflow aus dem Dropdown auswählt und "Starten" klickt, dann wird der entsprechende n8n Webhook getriggert und ein Job-Eintrag in Supabase erstellt
- [ ] Gegeben ein laufender Job, wenn n8n den Workflow abgeschlossen hat, dann aktualisiert sich der Status-Badge automatisch (Polling alle 3 Sekunden oder Supabase Realtime)
- [ ] Gegeben ein erfolgreich abgeschlossener Job mit Ergebnisdatei, dann erscheint ein "Download" Button der zur Ergebnisdatei in Supabase Storage verlinkt
- [ ] Gegeben eine Datei größer 50 MB, wenn der User sie hochladen will, dann erscheint eine Fehlermeldung BEVOR der Upload startet
- [ ] Gegeben ein nicht erreichbarer n8n Server, wenn ein Workflow getriggert wird, dann wird der Job als "Failed" markiert und eine Fehlermeldung angezeigt
- [ ] Gegeben ein angemeldeter User (Admin oder Staff), dann sieht er in der History-Tabelle: Dateiname, Workflow-Typ, Datum/Uhrzeit, Status-Badge, Download-Button (wenn verfügbar)

## Edge Cases

- **Falscher Dateityp**: Nur .csv, .xlsx, .xls erlaubt — andere Typen werden vor Upload abgelehnt
- **Doppelter Upload**: Erlaubt — jeder Upload erzeugt eine neue Job-ID mit eigenem Timestamp
- **Abgelaufener Download-Link**: Signed URLs aus Supabase Storage haben TTL — bei Ablauf Fehlermeldung + Hinweis Job erneut zu starten
- **n8n Timeout**: Wenn n8n nach 5 Minuten kein Callback gesendet hat → Job automatisch als "Timeout" markieren
- **Leerer Blank-Export**: `blank-export` braucht keine Eingabedatei — Upload-Schritt wird übersprungen, nur Workflow-Trigger + Download
- **Staff Zugriff auf avus-export**: Staff-Nutzer können `avus-export` nicht sehen/triggern (Admin only)
- **Concurrent Uploads**: Mehrere Jobs gleichzeitig pro User erlaubt

## Technical Requirements

- **Performance**: Upload bis 50 MB, Feedback innerhalb 500ms nach File-Drop
- **Security**: Nur authentifizierte User; Avus-Export nur für Admin-Rolle
- **Storage**: Supabase Storage Buckets: `workflow-uploads` (Input-Dateien), `workflow-results` (Ergebnis-Dateien)
- **Job Tracking**: Supabase Tabelle `jobs` (id, user_id, workflow_key, input_file_url, result_file_url, status, error_message, created_at, updated_at)
- **n8n Kommunikation**: HMAC-signierte Webhooks (wie PrimeHub); n8n schreibt Ergebnis via Callback zurück
- **Polling**: `useEffect` + Interval alle 3s ODER Supabase Realtime auf `jobs` Tabelle

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)

### A) Komponentenstruktur

```
/dashboard/workflow-hub  (neue Route)
+-- WorkflowHubPage
    +-- PageHeader ("Workflow Hub")
    +-- WorkflowCard  (Upload + Trigger)
    |   +-- WorkflowSelector  (Dropdown → Select)
    |   |   Workflows: sellerboard, kulturgut, a43-export, avus-export*, blank-export
    |   |   * avus-export nur sichtbar für Admin-Rolle
    |   +-- FileDropZone  (Drag & Drop Bereich)
    |   |   +-- FilePreview (Dateiname + Größe)
    |   |   Sonderfall: blank-export → FileDropZone ausgeblendet
    |   +-- StartButton  (deaktiviert bis Workflow + Datei gewählt)
    +-- ActiveJobsBanner  (laufende Jobs, Realtime-Update)
    |   +-- StatusBadge (Pending / Running)
    |   +-- Spinner
    +-- JobHistoryTable  (letzte 30 Tage)
        +-- Spalten: Dateiname | Workflow | Datum/Uhrzeit | Status | Aktion
        +-- StatusBadge (Pending / Running / Success / Failed / Timeout)
        +-- DownloadButton (nur wenn result_file_url vorhanden)
```

**Verwendete shadcn/ui Komponenten (alle bereits installiert):**
`Select`, `Button`, `Card`, `Badge`, `Table`, `Skeleton`, `Sonner`

---

### B) Datenmodell

**Supabase Tabelle: `jobs`**

| Feld | Typ | Beschreibung |
|------|-----|-------------|
| `id` | UUID | Eindeutige Job-ID (auto-generiert) |
| `user_id` | UUID | Wer hat den Job gestartet |
| `workflow_key` | Text | sellerboard / kulturgut / a43-export / avus-export / blank-export |
| `input_file_url` | Text (optional) | Pfad zur Input-Datei im Storage |
| `result_file_url` | Text (optional) | Pfad zur Ergebnisdatei im Storage |
| `status` | Enum | pending → running → success / failed / timeout |
| `error_message` | Text (optional) | Fehlermeldung von n8n |
| `created_at` | Timestamp | Wann gestartet |
| `updated_at` | Timestamp | Wann zuletzt aktualisiert |

**Supabase Storage Buckets (beide privat, Zugriff via Signed URLs):**
- `workflow-uploads` → Input-Dateien
- `workflow-results` → Ergebnis-Dateien

**User-Rollen:** Admin (alle Workflows) / Staff (ohne avus-export)
Gespeichert in Supabase `user_roles` Tabelle mit RLS.

---

### C) Tech-Entscheidungen

| Entscheidung | Warum |
|-------------|-------|
| Supabase Realtime auf `jobs` | Sofortige UI-Updates ohne dauerndes Polling |
| Polling (3s) als Fallback | Absicherung falls Realtime-Verbindung abbricht |
| Private Storage + Signed URLs | Dateien nie öffentlich zugänglich, Links laufen automatisch ab |
| HMAC-Signatur auf n8n Callback | Schützt Callback-Endpunkt vor gefälschten Anfragen |
| RLS auf `jobs` Tabelle | Jeder User sieht nur seine eigenen Jobs |

---

### D) API-Routen

| Route | Zweck |
|-------|-------|
| `POST /api/jobs` | Datei hochladen → Job anlegen → n8n Webhook triggern |
| `POST /api/jobs/[id]/callback` | n8n Callback (HMAC-geprüft, kein User-Auth) |
| `GET /api/jobs/[id]/download` | Frische Signed URL für Ergebnisdatei generieren |

---

### E) Abhängigkeiten

Keine neuen Pakete nötig — alle Libraries bereits installiert:
`@supabase/supabase-js`, `zod`, `sonner`, alle shadcn/ui Komponenten

## QA Test Results

**Tested:** 2026-03-03
**App URL:** http://localhost:3000/dashboard/workflow-hub
**Tester:** QA Engineer (AI)
**Build Status:** PASS (Next.js 16.1.6 compiles without errors)

### Acceptance Criteria Status

#### AC-1: File upload via drag-and-drop (.csv/.xlsx)
- [x] FileDropZone implements drag-and-drop with `onDragOver`, `onDrop`, `onClick` handlers
- [x] File validation checks MIME type against `config.acceptedMimeTypes` before accepting
- [x] File size validation via Zod schema (max 50 MB) runs client-side before upload
- [x] Server-side `POST /api/jobs` re-validates file size and MIME type
- [x] File is uploaded to Supabase Storage under `workflow-uploads/{user_id}/{timestamp}-{filename}`
- **PASS**

#### AC-2: Workflow selection + "Starten" triggers n8n webhook and creates job
- [x] WorkflowSelector renders all workflow options from `WORKFLOW_CONFIGS`
- [x] Start button disabled until workflow selected AND file provided (or no-file workflow)
- [x] `POST /api/jobs` creates job record with `status: 'pending'`, triggers n8n webhook, updates to `running`
- [x] FormData sent via XMLHttpRequest with upload progress tracking
- **PASS**

#### AC-3: Real-time status updates (Polling/Realtime)
- [x] Supabase Realtime subscription on `jobs` table for INSERT and UPDATE events
- [x] Polling fallback every 3 seconds when Realtime is not connected
- [x] StatusBadge updates reactively from job state
- [x] Toast notifications for success, failed, and timeout transitions
- **PASS**

#### AC-4: Download button for completed jobs with result file
- [x] DownloadButton rendered when `config.hasResultFile && job.status === 'success'`
- [x] `GET /api/jobs/[id]/download` generates signed URL (1 hour TTL)
- [x] Ownership check: `job.user_id !== user.id` returns 403
- **PASS**

#### AC-5: File size > 50 MB rejected BEFORE upload
- [x] Client-side: `fileValidationSchema` with Zod `.max(MAX_FILE_SIZE_BYTES)` rejects before upload
- [x] Server-side: Secondary check in `POST /api/jobs` (`file.size > MAX_FILE_SIZE_BYTES`)
- **PASS**

#### AC-6: Unreachable n8n server marks job as "Failed" with error message
- [x] `fetch` to n8n wrapped in try/catch
- [x] Network error: job updated to `status: 'failed'`, `error_message: 'n8n nicht erreichbar: ...'`
- [x] Non-OK response: job updated to `status: 'failed'`, error text captured
- [x] Missing `N8N_WEBHOOK_BASE_URL`: job marked failed with config error message
- **PASS**

#### AC-7: History table shows Dateiname, Workflow, Datum/Uhrzeit, Status-Badge, Download-Button
- [x] JobHistoryTable renders all 5 columns as specified
- [x] Filename extracted from `input_file_url` with timestamp prefix stripped
- [x] Date formatted in de-DE locale (DD.MM.YYYY HH:MM)
- [x] StatusBadge with appropriate icons and colors for all 5 statuses
- [x] DownloadButton conditionally rendered
- [x] Empty state with "Noch keine Jobs" message
- [x] Loading state with skeleton rows
- [x] Error state with descriptive message
- **PASS**

### Edge Cases Status

#### EC-1: Wrong file type rejected before upload
- [x] Client-side MIME type check in `FileDropZone.validateAndSet()`
- [x] Server-side MIME type check in `POST /api/jobs`
- [x] Toast error message shown to user with allowed types
- **PASS**

#### EC-2: Duplicate uploads allowed with unique job IDs
- [x] Each upload creates new job record with auto-generated UUID
- [x] File path includes timestamp for uniqueness: `{user_id}/{timestamp}-{filename}`
- **PASS**

#### EC-3: Expired download link shows error + hint
- [x] DownloadButton shows toast error "Download-Link abgelaufen. Bitte starte den Job erneut."
- [ ] BUG: Same error message shown for ALL download failures (auth, network, etc.) -- not just expired links (see BUG-6)
- **PARTIAL PASS**

#### EC-4: n8n timeout after 5 minutes
- [ ] BUG: No timeout mechanism implemented. There is no cron job, scheduled function, or background worker that marks jobs as "timeout" after 5 minutes. Jobs can remain in "pending" or "running" state indefinitely. (see BUG-3)
- **FAIL**

#### EC-5: Blank-export skips file upload step
- [x] `blank-export` config has `acceptsFile: false`
- [x] WorkflowCard hides FileDropZone when `workflowConfig.acceptsFile === false`
- [x] `canSubmit` logic allows submission without file for non-file workflows
- [x] Server rejects file if sent for non-file workflow
- **PASS**

#### EC-6: Staff cannot see/trigger avus-export
- [x] WorkflowSelector filters out `adminOnly` workflows when `role !== 'admin'`
- [x] Server-side `POST /api/jobs` checks `user_roles` table for admin role on avus-export
- **PASS**

#### EC-7: Concurrent uploads allowed
- [x] No mutex or queue limiting simultaneous jobs
- [x] Each job gets independent record and file path
- **PASS**

### Security Audit Results

#### Authentication & Authorization
- [ ] **BUG-1 (Critical): No authentication middleware on /dashboard routes.** There is no `middleware.ts` file. The `/dashboard/workflow-hub` page is statically generated and accessible to unauthenticated users. While API routes check auth, the page itself renders with an empty state and no redirect to login.
- [x] API route `POST /api/jobs` verifies user session via `supabaseAuth.auth.getUser()`
- [x] API route `GET /api/jobs/[id]/download` verifies user session and job ownership
- [x] Avus-export admin-only check on server side
- [x] Callback endpoint uses HMAC signature verification (timing-safe)
- [x] RLS enabled on `jobs` table (users see only own jobs)
- [x] RLS enabled on `user_roles` table (users see only own role)
- [x] Storage RLS scopes uploads to user's folder

#### Input Validation
- [x] Workflow key validated with Zod enum schema
- [x] Callback body validated with Zod schema
- [x] Job ID validated as UUID format in callback and download routes
- [x] File name sanitized: `file.name.replace(/[^a-zA-Z0-9._-]/g, '_')`
- [x] File size validated client-side and server-side

#### Rate Limiting
- [ ] **BUG-2 (High): No rate limiting on any API endpoint.** An attacker with valid credentials could trigger unlimited n8n webhooks via `POST /api/jobs`, potentially causing denial of service on the n8n instance.

#### Security Headers
- [ ] **BUG-4 (Medium): No security headers configured.** `next.config.ts` is empty. Missing: X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Strict-Transport-Security as required by project security rules.

#### Secrets
- [x] `.env.local` is in `.gitignore`
- [x] `SUPABASE_SERVICE_ROLE_KEY` and `N8N_HMAC_SECRET` are server-side only (no `NEXT_PUBLIC_` prefix)
- [x] `.env.local.example` uses dummy values

#### Injection
- [x] React JSX auto-escapes rendered strings (XSS protection for error messages)
- [x] Supabase client uses parameterized queries
- [x] UUID regex validation prevents SQL injection via job ID

#### Data Exposure
- [x] Download endpoint verifies job ownership before generating signed URL
- [x] Signed URLs have 1-hour TTL
- [x] Storage buckets are private (not public)

### Bugs Found

#### BUG-1: No authentication middleware on dashboard routes
- **Severity:** Critical
- **Steps to Reproduce:**
  1. Open browser (not logged in)
  2. Navigate directly to `http://localhost:3000/dashboard/workflow-hub`
  3. Expected: Redirect to login page
  4. Actual: Page renders. WorkflowSelector may show loading/error state but the page is accessible. No redirect occurs.
- **Root Cause:** No `middleware.ts` file exists in `src/`. No authentication guard on the dashboard layout.
- **Priority:** Fix before deployment

#### BUG-2: No rate limiting on API endpoints
- **Severity:** High
- **Steps to Reproduce:**
  1. Authenticate as any user
  2. Send rapid `POST /api/jobs` requests (e.g., 100 requests in 10 seconds)
  3. Expected: Requests throttled after a threshold
  4. Actual: All requests processed, each triggering an n8n webhook
- **Impact:** Could overload n8n instance, cause excessive storage usage, or rack up costs
- **Priority:** Fix before deployment

#### BUG-3: No 5-minute timeout mechanism for stuck jobs
- **Severity:** High
- **Steps to Reproduce:**
  1. Start a workflow
  2. Simulate n8n never sending a callback
  3. Wait 5+ minutes
  4. Expected: Job automatically marked as "timeout"
  5. Actual: Job remains in "pending" or "running" status indefinitely
- **Root Cause:** No server-side cron job, Supabase database function, or Edge Function to detect and mark timed-out jobs
- **Priority:** Fix before deployment

#### BUG-4: No security headers in Next.js config
- **Severity:** Medium
- **Steps to Reproduce:**
  1. Open browser DevTools, Network tab
  2. Load any page
  3. Expected: Response headers include X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Strict-Transport-Security
  4. Actual: None of these headers are present
- **Root Cause:** `next.config.ts` has no `headers()` configuration
- **Priority:** Fix before deployment

#### BUG-5: Callback endpoint allows status overwrite on completed jobs
- **Severity:** Medium
- **Steps to Reproduce:**
  1. Wait for a job to reach "success" status
  2. Send a valid HMAC-signed callback with `status: "failed"` for the same job ID
  3. Expected: Callback rejected (job already in terminal state)
  4. Actual: Job status overwritten to "failed"
- **Root Cause:** Callback route does not check current job status before applying update
- **Priority:** Fix in next sprint

#### BUG-6: DownloadButton shows generic error for all failure types
- **Severity:** Low
- **Steps to Reproduce:**
  1. Trigger a download when not authenticated
  2. Expected: "Nicht authentifiziert" error message
  3. Actual: Shows "Download-Link abgelaufen. Bitte starte den Job erneut." regardless of the actual error
- **Root Cause:** `DownloadButton` catch block and `!res.ok` branch both show the same hardcoded message instead of parsing the error response
- **Priority:** Nice to have

#### BUG-7: n8n webhook request lacks authentication
- **Severity:** Medium
- **Steps to Reproduce:**
  1. Inspect the outgoing request from `POST /api/jobs` to n8n
  2. Expected: Request includes HMAC signature or API key for n8n to verify the caller
  3. Actual: Request is a plain `POST` with `Content-Type: application/json` and no authentication header
- **Root Cause:** The HMAC secret is only used for verifying inbound callbacks from n8n, not for outbound requests to n8n
- **Priority:** Fix before deployment (n8n webhooks should verify caller identity)

#### BUG-8: Root layout missing lang="de" attribute
- **Severity:** Low
- **Steps to Reproduce:**
  1. View page source
  2. Expected: `<html lang="de">` (all UI text is in German)
  3. Actual: `<html lang="en">`
- **Priority:** Nice to have

#### BUG-9: WorkflowCard does not trigger job list refresh after submission
- **Severity:** Medium
- **Steps to Reproduce:**
  1. Submit a new job
  2. Expected: Job immediately appears in history table
  3. Actual: Job only appears after Realtime event or next polling cycle (up to 3 seconds delay). If Realtime is connected but the INSERT event is missed, the job may not appear until a page refresh.
- **Root Cause:** `WorkflowCard` has no reference to the `refresh()` function from `useJobs`. The two components are siblings with no shared callback.
- **Priority:** Fix in next sprint

### Cross-Browser Testing
- Note: Code review only (no live browser testing performed). The implementation uses standard React, Tailwind CSS, and shadcn/ui components which have strong cross-browser support.
- [x] No browser-specific APIs used (XMLHttpRequest is universally supported)
- [x] No CSS features requiring vendor prefixes beyond what Tailwind handles
- [x] Drag-and-drop uses standard HTML5 DnD events

### Responsive Testing
- Note: Code review only. Observations from Tailwind classes:
- [x] `max-w-5xl` and `mx-auto` provide proper content containment
- [x] Button uses `w-full sm:w-auto sm:self-end` for mobile/desktop adaptation
- [x] FilePreview uses `truncate max-w-xs` to handle long filenames
- [x] Table columns may overflow on 375px viewport (no horizontal scroll wrapper)
- [ ] BUG: JobHistoryTable has no horizontal scroll wrapper for mobile viewports. A 5-column table will likely overflow on 375px screens. (Low severity, documented below)

#### BUG-10: Job history table may overflow on mobile (375px)
- **Severity:** Low
- **Steps to Reproduce:**
  1. View `/dashboard/workflow-hub` on a 375px-wide viewport
  2. Expected: Table scrolls horizontally or collapses gracefully
  3. Actual: 5-column table likely overflows the viewport width
- **Priority:** Nice to have

### Summary
- **Acceptance Criteria:** 7/7 passed (all code-level criteria met)
- **Edge Cases:** 6/7 passed (1 failed: timeout mechanism missing)
- **Bugs Found:** 10 total (1 critical, 2 high, 4 medium, 3 low)
- **Security:** Issues found (no auth middleware, no rate limiting, no security headers, callback overwrite)
- **Production Ready:** NO
- **Recommendation:** Fix BUG-1 (auth middleware), BUG-2 (rate limiting), BUG-3 (timeout mechanism), BUG-7 (n8n auth) before deployment. BUG-4 (security headers) and BUG-5 (callback overwrite) should also be addressed.

## QA Regression Verification (2026-03-05)

**Tester:** QA Engineer (AI) -- Independent regression audit during PROJ-2 QA
**Method:** Full static code analysis of all PROJ-1 source files
**Build Status:** PASS

### Previously Fixed Bugs -- Status

| Bug | Original Severity | Still Fixed | Evidence |
|-----|-------------------|-------------|----------|
| BUG-1: No auth middleware | Critical | YES | `middleware.ts` exists, redirects unauthenticated from `/dashboard/*` to `/` |
| BUG-2: No rate limiting | High | YES | `POST /api/jobs` has inline `checkRateLimit()` -- 10 req/min per user |
| BUG-3: No timeout mechanism | High | YES | `/api/jobs/timeout` endpoint with CRON_SECRET auth marks stuck jobs |
| BUG-4: No security headers | Medium | YES | `next.config.ts` has all 4 required headers |
| BUG-5: Callback overwrite | Medium | YES | Callback route checks `terminalStatuses` array before update |
| BUG-7: n8n outbound auth | Medium | YES | `signOutboundPayload()` sends HMAC via `x-dashboard-signature` |
| BUG-8: lang="en" | Low | YES | Root layout uses `<html lang="de">` |

### Known Remaining Low-Priority Issues (Unchanged)

| Bug | Severity | Status |
|-----|----------|--------|
| BUG-6: DownloadButton generic error message | Low | OPEN -- same message for all error types |
| BUG-9: WorkflowCard no job list refresh | Medium | OPEN -- relies on Realtime/polling for update |
| BUG-10: Job history table mobile overflow | Low | OPEN -- no horizontal scroll wrapper |

### Regression Result

**PASS** -- No regressions detected. All previously fixed Critical, High, and Medium bugs remain resolved. Three low-priority issues remain unchanged and acceptable for production.

## Deployment
## Deployment Info

**Deployed:** 2026-03-03
**Production URL:** https://dashboard.primehubgbr.com/dashboard/workflow-hub
**Timeout Cron:** Supabase pg_cron (every minute → marks pending/running jobs > 5 min as timeout)
