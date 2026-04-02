# PrimeHub Dashboard v2

Zentrales Operations-Dashboard für E-Commerce (Workflow-Steuerung, Bestellungs-Management, Preisdatenbank, Repricer).

## Tech Stack

- **Framework:** Next.js (App Router), TypeScript
- **Styling:** Tailwind CSS + shadcn/ui
- **Backend:** Supabase (PostgreSQL + Auth + Storage)
- **Deployment:** Vercel → dashboard.primehubgbr.com
- **Prozesslogik:** N8N (https://n8n.primehubgbr.com)
- **Validation:** Zod + react-hook-form

## Project Structure

```
src/
  app/              Pages (Next.js App Router)
    api/            API Routes (Auth, Jobs, Orders, Prices, N8N)
    dashboard/      Dashboard-Seiten (workflow-hub, workflows, orders, prices, repricer)
  components/
    ui/             shadcn/ui components (NEVER recreate these)
  hooks/            Custom React hooks
  lib/              Utilities (supabase.ts, utils.ts, types)
features/           Feature-Specs — organisiert nach Dashboard-Tabs
  INDEX.md          Feature-Übersicht (Tabs + Status)
  workflow-hub/     Tab: Workflow Hub
  workflow-monitor/ Tab: Workflow Monitor
  orders/           Tab: Bestellungen
  prices/           Tab: Preisdatenbank
  repricer/         Tab: Repricer
  _foundation/      Querschnitt (Auth, Nav, Domain)
supabase/
  migrations/       Datenbankmigrationen (001–007)
docs/
  PRD.md            Product Requirements Document
  production/       Production-Guides (Security, Performance, etc.)
```

## Development Workflow

**Standard:** `/requirements "Feature-Idee"` → nach Approval läuft der Rest autonom.

```
/requirements   → Spec erstellen + Mensch bestätigt (einziger Checkpoint)
                  ↓ autonom
  architecture    → Tech-Design in Spec schreiben
  ui-ux-pro-max   → UI/UX-Spec mit Wireframes, States, Tailwind-Hints
  frontend        → UI-Komponenten bauen (nach UI/UX-Spec)
  backend         → APIs + DB (nur wenn Spec es erfordert)
  n8n             → Workflow bauen (nur wenn Prozesslogik vorhanden)
  qa              → Testen + Security-Audit
                    ↓ nur bei Critical/High Bugs: Mensch entscheidet Priorität
  deploy          → Deployment auf Vercel
```

**Manuell (optional):** Einzelne Schritte können jederzeit explizit aufgerufen werden, z.B. `/architecture features/repricer/dashboard.md`

## Autonomous Pipeline — Anweisungen für Claude

Wenn der Benutzer "Pipeline starten" bestätigt (nach `/requirements`):

### Schritt 1: Agents nacheinander starten
Jeden Agent via `Agent`-Tool starten. Den Handoff-Block aus der Ausgabe des vorherigen Agents lesen und als Kontext an den nächsten weitergeben.

```
architecture → liest Spec, schreibt Tech Design, gibt aus: BACKEND_NEEDED, N8N_NEEDED
    ↓ handoff block
ui-ux-pro-max → schreibt UI/UX-Spec (Wireframes, States, Tailwind-Hints), gibt aus: COMPONENTS_DESIGNED, SHADCN_COMPONENTS_NEEDED
    ↓ handoff block
frontend → baut UI nach UI/UX-Spec, gibt aus: API_ENDPOINTS_EXPECTED, BUILD_STATUS
    ↓ handoff block (wenn BACKEND_NEEDED=YES)
backend → baut APIs + DB, gibt aus: API_ROUTES_CREATED, N8N_WEBHOOK_ENDPOINT
    ↓ handoff block (wenn N8N_NEEDED=YES)
n8n-workflow-builder → baut Workflow, gibt aus: WEBHOOK_URL, WORKFLOW_ID
    ↓ handoff block
qa → testet via Playwright + Code-Analyse, gibt aus: QA_DECISION, BUG_COUNTS
    ↓ handoff block (nur wenn QA_DECISION=APPROVED)
deploy → deployed, überwacht Build-Loop, fixt Fehler automatisch
```

### Schritt 2: Handoff-Blöcke weitergeben
Jeder Agent gibt am Ende einen strukturierten Block aus:
```
=== HANDOFF: [agent] → [next] ===
SPEC: features/<tab>/<slug>.md
...entscheidende Informationen...
NEXT_AGENT: [name]
=== END HANDOFF ===
```
Diesen Block vollständig an den nächsten Agent übergeben — er ist der Kontext-Anker.

### Schritt 3: Statusmeldungen
Nach jedem Agent auf Deutsch kurz berichten:
> "✅ Architecture fertig — Backend nötig: JA, N8N nötig: NEIN. Frontend startet..."

### Einzige Haltepunkte:
- QA meldet `QA_DECISION: BLOCKED` → User über Bugs informieren, auf Anweisung warten
- Deploy schlägt nach 3 Fix-Versuchen fehl → User einschalten

**Entscheidungslogik:**
- Backend nötig? → Handoff enthält `BACKEND_NEEDED: YES`
- N8N nötig? → Handoff enthält `N8N_NEEDED: YES`
- Deploy starten? → Handoff enthält `QA_DECISION: APPROVED`

## N8N-First Rule

**Alle Prozesse laufen in N8N — nicht im Backend-Code.**

| In N8N (Pflicht) | Im Backend (erlaubt) |
|------------------|---------------------|
| CSV/Datei-Verarbeitung | Auth + Session |
| Externe API-Aufrufe | Job-Tracking (Supabase) |
| Batch-Operationen | Signed URLs generieren |
| Datei-Transformationen | Callback-Empfang von N8N |
| Automatische Sync-Jobs | Einfache CRUD-Operationen |

Details: `.claude/rules/n8n-first.md`

## Feature Tracking

Features in `features/INDEX.md`. Struktur folgt den Dashboard-Tabs.
Spec-Pfade: `features/<tab>/<slug>.md` — z.B. `features/repricer/dashboard.md`

## Key Conventions

- **Commits:** `feat(area/slug): description` — z.B. `feat(repricer/dashboard): CSV Upload`
- **Single Responsibility:** Eine Feature-Spec pro Datei
- **shadcn/ui first:** NIEMALS eigene Versionen von shadcn-Komponenten bauen
- **Sprache:** Alle Antworten an den Benutzer auf Deutsch

## Credentials & Tokens

**Regel: Keine Secrets in diese Datei oder andere Git-Dateien schreiben.**

### Wo die Werte zu finden sind

| Token / Secret | Wo hinterlegt | Wie abrufen |
|----------------|--------------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | `.env.local` | Supabase Dashboard → Project Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `.env.local` | Supabase Dashboard → Project Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | `.env.local` | Supabase Dashboard → Project Settings → API |
| `N8N_API_KEY` | `.env.local` | N8N → Settings → API Keys |
| `N8N_BASE_URL` | `.env.local` | `https://n8n.primehubgbr.com` |
| `N8N_WEBHOOK_BASE_URL` | `.env.local` | `https://n8n.primehubgbr.com/webhook` |
| `N8N_WHATSAPP_WEBHOOK_URL` | `.env.local` + Vercel Env | N8N → Workflow → Webhook-URL kopieren (nach WhatsApp-Einrichtung) |
| `GOOGLE_CLIENT_ID/SECRET` | `.env.local` | Google Cloud Console → APIs & Services → Credentials |
| `GOOGLE_REFRESH_TOKEN` | `.env.local` | OAuth-Flow einmalig ausgeführt (liegt in `.env.local`) |
| `CRON_SECRET` | `.env.local` | Selbst generiert (zufälliger String) |
| `KIOSK_DEVICE_SECRET` | `.env.local` | Selbst generiert |
| `REBUY_FLASK_API_KEY` | `.env.local` | LXC-Container-Setup |
| `REBUY_HMAC_SECRET` | `.env.local` | Selbst generiert |
| Vercel-Env-Vars | Vercel Dashboard → Settings → Environment Variables | Spiegeln von `.env.local` |

### Supabase Personal Access Token (für CLI / Migrationen)

Wird **nicht** in `.env.local` gespeichert — einmalig für CLI-Operationen:

1. [supabase.com/dashboard/account/tokens](https://supabase.com/dashboard/account/tokens) → "Generate new token"
2. Einmalig verwenden: `SUPABASE_ACCESS_TOKEN=xxx npx supabase db push`
3. Oder dauerhaft in Shell-Profil setzen: `~/.bashrc` oder `~/.bash_profile`

Nach Login: `npx supabase link --project-ref tcqdyzmhwyfamzyeyskj`

**Hinweis:** Ein Supabase MCP OAuth-Client ist in `~/.claude/.credentials.json` hinterlegt (`mcpOAuth → supabase|bcbe8046d2c9a4fd`), aber der Access Token war noch nicht eingeloggt. Login über Claude Code MCP: `/mcp` → Supabase → Authorize.

### MCP Server (N8N + Supabase)

- **N8N MCP:** Konfiguriert in `~/.claude/settings.json` — API-Key dort hinterlegt
- **Supabase MCP:** OAuth-Client in `~/.claude/.credentials.json` — Login über Claude Code `/mcp`
- Beide Dateien sind lokal, nicht in GitHub

## Build & Test Commands

```bash
npm run dev        # Development server (localhost:3000)
npm run build      # Production build
npm run lint       # ESLint
npm run start      # Production server
```

## Product Context

@docs/PRD.md

## Feature Overview

@features/INDEX.md
