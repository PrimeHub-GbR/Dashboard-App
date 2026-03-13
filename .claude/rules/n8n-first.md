# N8N-First Rule

## Core Principle

ALL process logic (data processing, file transformation, external API calls, batch operations) MUST be implemented as N8N workflows — NEVER as backend code in Next.js API routes.

## What belongs in N8N (mandatory)

- CSV/Excel processing and transformation
- ISBN/EAN conversions and price lookups
- External API calls (Sellerboard, Buchhandel, Google Drive, etc.)
- Batch operations (processing many rows or entries)
- File transformations (input → output)
- Scheduled sync jobs (time-triggered executions)
- Any process that could take longer than 10 seconds

## What stays in the backend (allowed)

- Authentication + session management
- Job tracking (status, history in Supabase `jobs` table)
- Signed URL generation for Supabase Storage
- Webhook receipt (callback from N8N: `/api/jobs/[id]/callback`)
- Simple CRUD operations on the database (no process logic)
- Rate limiting + input validation (before triggering N8N)
- File upload to Supabase Storage (before N8N is triggered)

## Why this rule

- **Visibility**: N8N workflows are visible and editable in the N8N dashboard without code deployment
- **No timeout**: Vercel functions max out at 60 sec — N8N workflows can run for hours
- **Reusability**: Sub-workflows (isbn2ean, ean2bbp) can be used by multiple features
- **Debugging**: Errors in N8N are immediately visible in the execution log, with input/output per node
- **Low maintenance**: Process logic in N8N needs no code review, no deployment, no test setup

## N8N Workflow Read-Only Rule (MANDATORY)

**Claude darf N8N-Workflows NUR LESEN — niemals erstellen, verändern oder löschen.**

Erlaubte MCP-Operationen:
- `list_workflows` ✅
- `get_workflow` ✅
- `get_executions` ✅
- `search_nodes` ✅

Verbotene MCP-Operationen:
- `create_workflow` ❌
- `update_workflow` ❌
- `delete_workflow` ❌
- `activate_workflow` ❌
- `execute_workflow` ❌

Wenn ein Workflow geändert werden muss, erstellt Claude eine **Schritt-für-Schritt-Anleitung für Anfänger** (siehe unten), die der Nutzer selbst im N8N-Dashboard ausführt.

## Anleitung-Format bei notwendigen Workflow-Änderungen

Wenn Workflow-Änderungen benötigt werden, gibt Claude IMMER diese Struktur aus:

```
## N8N Anleitung: [Beschreibung der Änderung]

**Was geändert werden muss:** [kurze Erklärung warum]

### Schritt 1 — N8N Dashboard öffnen
1. Öffne https://n8n.primehubgbr.com im Browser
2. Melde dich an

### Schritt 2 — Workflow finden
1. Klicke links in der Sidebar auf "Workflows"
2. Suche nach dem Workflow "[Workflow-Name]"
3. Klicke darauf, um ihn zu öffnen

### Schritt 3 — [Spezifische Änderung]
[Detaillierte, bildhafte Beschreibung — z.B.:]
1. Klicke auf die Node "[Node-Name]" (erkennbar am [Icon/Position])
2. Auf der rechten Seite öffnet sich ein Einstellungs-Panel
3. Ändere das Feld "[Feldname]" von "[alter Wert]" auf "[neuer Wert]"
4. Klicke auf "Save" oder das Häkchen ✓

### Schritt 4 — Änderungen speichern
1. Klicke oben rechts auf den roten "Save"-Button
2. Der Button wird grau — das bedeutet: gespeichert ✓

### Schritt 5 — Testen (optional aber empfohlen)
1. Klicke oben rechts auf "Test Workflow"
2. [Beschreibung was passieren soll]
3. Prüfe unten im Execution-Log ob alle Nodes grün sind ✓
```

## Skill consequence

When a feature requires process logic:
1. `/architecture` documents the N8N workflow as a dependency
2. Claude analysiert den bestehenden Workflow (read-only) und erstellt eine Anleitung
3. Nutzer führt die Änderungen manuell im N8N-Dashboard aus
4. `/qa` tests the workflow + dashboard integration together
5. `/deploy` deploys the dashboard — the N8N workflow is already live

## Code review triggers

The following patterns in backend code are FORBIDDEN and must be moved to N8N:

```
// FORBIDDEN in API routes:
- Parsing and transforming CSV files
- Calling external APIs (except Supabase + N8N trigger)
- Loops over data sets with API calls inside
- Downloading, processing, and re-uploading files
- Calculating prices or normalizing data
```

```
// ALLOWED in API routes:
- await supabase.from('jobs').insert(...)
- await supabase.storage.from('...').upload(...)
- fetch(N8N_WEBHOOK_URL, { body: JSON.stringify({ job_id, file_url }) })
- Zod validation of inputs
- Auth check via Supabase
```
