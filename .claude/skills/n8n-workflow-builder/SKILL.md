---
name: n8n-workflow-builder
description: Build N8N workflows via MCP from feature specs. Use when a feature requires process logic (CSV processing, API calls, batch operations, file transformations) that must run in N8N — not in backend code.
argument-hint: "features/<tab>/<slug>.md"
user-invocable: true
---

# N8N Workflow Engineer

## Role
You are an experienced N8N Workflow Engineer. You build production-ready N8N workflows via MCP tools from feature specifications. You ensure every process runs in N8N — never in backend code.

## Before Starting
1. Read `features/INDEX.md` for project context
2. Read the feature spec: `features/<tab>/<slug>.md` (e.g. `features/repricer/n8n-updater.md`)
3. Check existing N8N workflows: `list_workflows` via MCP — avoid duplicates
4. Identify reusable sub-workflows (e.g., isbn2ean, ean2bbp)
5. Read the n8n-mcp-tools-expert skill for correct MCP tool usage

## Workflow

### 1. Design (document before building)

Before touching MCP, write down:
- **Workflow name**: MUST follow the naming convention (see below)
- **Webhook path**: `kebab-case` (e.g., `repricer-updater`, `kulturgut-processor`)
- **Input**: What does the dashboard send? (job_id, csv_url, etc.)
- **Output**: What does the callback return? (result_url, summary, etc.)
- **Node structure**: Trigger → Validation → Processing → Upload → Callback
- **Error handling**: What triggers an error callback?

Present the design to the user and wait for approval.

### Naming Convention (MANDATORY)

Every workflow created by this skill MUST be identifiable as Dashboard-generated:

**Workflow Name Format:** `[Dashboard] workflow-name`

Examples:
- `[Dashboard] repricer-updater`
- `[Dashboard] kulturgut-processor`
- `[Dashboard] isbn2ean`

**Tag:** Every created workflow MUST receive the tag `claude-generated` when creating/updating via MCP.

This allows the team to:
- Immediately identify Claude-generated workflows in the n8n list
- Filter by tag to see all Dashboard workflows at once
- Distinguish them from manually created or legacy workflows

### 2. Build via MCP

Use `create_workflow` with the full node structure. Follow the Standard Pattern below exactly.

**Coding Style in Code Nodes (MANDATORY):**
- Language: **JavaScript only** (not Python)
- Error handling: **every Code node** has try/catch
- On error: send callback `{ success: false, error: message }` and stop
- Variables: `camelCase`
- N8N expressions: `{{ $json.field }}` syntax
- No `console.log` in production — use N8N error workflow instead
- Comments: only where logic is not self-evident

**Node-Kommentare (PFLICHT — Deutsch):**

Jede Node MUSS einen deutschen Kommentar erhalten. Kommentare werden über das `notes`-Feld der Node gesetzt (im Node-JSON als `"notes": "..."` Eigenschaft). Zusätzlich MUSS am Anfang des Workflows eine Sticky Note mit einer allgemeinen Beschreibung des Workflows platziert werden.

**Sticky Note (Workflow-Beschreibung) — immer als erste Node:**
```json
{
  "id": "sticky-description",
  "name": "Workflow-Beschreibung",
  "type": "n8n-nodes-base.stickyNote",
  "typeVersion": 1,
  "position": [-200, -300],
  "parameters": {
    "content": "## [Dashboard] workflow-name\n\n**Aufgabe:** Kurze Beschreibung was dieser Workflow macht (1-3 Sätze).\n\n**Trigger:** Wer/was löst diesen Workflow aus?\n**Input:** Welche Daten empfängt er?\n**Output:** Was gibt er zurück (Callback-Format)?\n\n**Sub-Workflows:** isbn2ean, ean2bbp (falls genutzt)\n**Erstellt:** YYYY-MM-DD via Claude Code"
  }
}
```

**Node `notes`-Feld Beispiele (Deutsch, prägnant):**
```
Webhook Trigger:  "Empfängt den Job-Auftrag vom Dashboard (job_id, input_file_url, callback_url) und antwortet sofort mit 200 OK."
Input Validation: "Prüft ob alle Pflichtfelder vorhanden sind. Bei fehlendem Feld → Fehler-Callback und Abbruch."
Download CSV:     "Lädt die Input-CSV von der signierten Supabase-URL herunter."
Process CSV:      "Hauptlogik: B-ASINs filtern, ISBN→EAN, EAN→BBP, Preise berechnen, Output-CSV erstellen."
Upload Result:    "Lädt die fertige CSV in den Supabase Storage Bucket 'workflow-results' hoch."
Success Callback: "Meldet dem Dashboard: Job erfolgreich. Sendet result_file_path + metadata (Statistik)."
Error Callback:   "Fängt alle Fehler ab und meldet dem Dashboard: Job fehlgeschlagen mit Fehlertext."
```

**Regel:** Kein Node ohne `notes`. Der Kommentar erklärt *was* die Node tut — nicht *wie* (das steht im Code).

### 3. Standard Pattern (ALWAYS use this structure)

```
Webhook-Trigger
  └── responseMode: responseNode
  └── httpMethod: POST

Input Validation (Code Node or IF Node)
  └── Check required fields exist
  └── On invalid: HTTP Request → Callback (error) → Stop

Main Processing (Code Nodes + HTTP Request Nodes)
  └── Call sub-workflows if needed (isbn2ean, ean2bbp)
  └── try/catch every external call
  └── On error: HTTP Request → Callback (error) → Stop

Result Upload (HTTP Request Node)
  └── Upload output file to Supabase Storage (workflow-results bucket)
  └── On error: HTTP Request → Callback (error) → Stop

Success Callback (HTTP Request Node)
  └── POST to {{ $json.callbackUrl }} or /api/jobs/{job_id}/callback
  └── Body: { success: true, result_url, summary }

Error Callback (HTTP Request Node — shared error branch)
  └── POST to callback URL
  └── Body: { success: false, error: "Beschreibung auf Deutsch" }
```

### 4. Callback Format (MUST match dashboard expectation)

**Success:**
```json
{
  "success": true,
  "result_url": "https://..../workflow-results/...",
  "summary": {
    "total": 1240,
    "b_asins": 15,
    "no_ean": 210,
    "no_price": 35,
    "final": 980
  }
}
```

**Error:**
```json
{
  "success": false,
  "error": "N8N: isbn2ean Webhook nicht gefunden (HTTP 404)"
}
```

### 5. Activate and Smoke-Test

After `create_workflow`:
1. `update_workflow` if adjustments needed
2. Activate: set `active: true` in workflow
3. **Smoke-Test (mandatory):**
   - Call webhook with minimal valid payload
   - Verify callback is received by dashboard (check job status)
   - Call webhook with invalid payload → verify error callback received
4. Check N8N execution log for errors

### 6. Document in Feature Spec

Add `## N8N Workflow` section to the feature spec (`features/<tab>/<slug>.md`):

```markdown
## N8N Workflow

**Name:** [Dashboard] [workflow-name]
**Workflow ID:** [n8n-id from MCP]
**Webhook Path:** /webhook/[path]
**Tag:** claude-generated
**Status:** Active

### Input
POST /webhook/[path]
{ "job_id": "uuid", "csv_url": "https://..." }

### Output (Callback)
POST /api/jobs/{job_id}/callback
Success: { success: true, result_url, summary }
Error:   { success: false, error: "..." }

### Sub-Workflows Used
- isbn2ean (ID: ...)
- ean2bbp (ID: ...)
```

## Context Recovery
If compacted mid-task:
1. Re-read feature spec
2. Run `list_workflows` to see what was already created
3. Check feature spec for "## N8N Workflow" section — if exists, workflow was built
4. Run `get_executions` to see recent test runs
5. Continue from where you left off

## Checklist
See [checklist.md](checklist.md)

## Handoff
After smoke-test passes:
> "N8N Workflow `[name]` ist aktiv und getestet! Nächster Schritt: `/qa` ausführen um Workflow + Dashboard zusammen zu testen."

## Git Commit
```
feat(area/slug): Add N8N workflow [workflow-name]

- Workflow ID: [n8n-id]
- Webhook: /webhook/[path]
- Sub-workflows: [list]
- Smoke-tested: yes
```
Example: `feat(repricer/n8n-updater): Add N8N workflow repricer-updater`
