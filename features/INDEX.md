# Feature Index — PrimeHub Dashboard v2

> Zentrale Übersicht aller Features. Organisiert nach Dashboard-Tabs.
> Vor jeder Arbeit lesen. Nach Statusänderung aktualisieren.

## Status-Legende
- **Planned** — Anforderungen geschrieben, bereit für Entwicklung
- **In Progress** — Wird gerade gebaut
- **In Review** — QA-Testing läuft
- **Deployed** — Live in Produktion

---

## Workflow Hub `/dashboard/workflow-hub`

| Feature | Status | Spec |
|---------|--------|------|
| Upload + N8N-Trigger + Download | Deployed | [workflow-hub/overview.md](workflow-hub/overview.md) |
| N8N Repricer-Workflow (ISBN→EAN→BBP) | Deployed | [workflow-hub/n8n-workflow-builder.md](workflow-hub/n8n-workflow-builder.md) |

## Workflow Monitor `/dashboard/workflows`

| Feature | Status | Spec |
|---------|--------|------|
| N8N Liste + Toggle + Statistiken | Deployed | [workflow-monitor/overview.md](workflow-monitor/overview.md) |

## Bestellungen `/dashboard/orders`

| Feature | Status | Spec |
|---------|--------|------|
| Google Drive → Supabase → Tabelle | Deployed | [orders/overview.md](orders/overview.md) |

## Preisdatenbank `/dashboard/prices`

| Feature | Status | Spec |
|---------|--------|------|
| SKU/ASIN + EAN-Map + Repricer Status | Deployed | [prices/overview.md](prices/overview.md) |

## Repricer `/dashboard/repricer`

| Feature | Status | Spec |
|---------|--------|------|
| Dashboard (Upload + Status + Download) | Deployed | [repricer/dashboard.md](repricer/dashboard.md) |
| N8N Updater (Preisberechnung) | Deployed | [repricer/n8n-updater.md](repricer/n8n-updater.md) |

## Rebuy Scraper `/dashboard/rebuy`

| Feature | Status | Spec |
|---------|--------|------|
| Rebuy Buch-Scraper (LXC + Live-Status + Excel) | In Progress | [rebuy-scraper/overview.md](rebuy-scraper/overview.md) |

---

## Foundation (kein Tab — Querschnittsfunktionen)

| Feature | Status | Spec |
|---------|--------|------|
| Login / Authentifizierung | Deployed | [_foundation/login.md](_foundation/login.md) |
| Dashboard-Navigation (Sidebar) | Deployed | [_foundation/navigation.md](_foundation/navigation.md) |
| Custom Domain Setup | Deployed | [_foundation/custom-domain.md](_foundation/custom-domain.md) |

---

## Neues Feature anlegen

1. Passenden Tab-Ordner wählen (oder `_foundation/` für Querschnitt)
2. Spec-Datei anlegen: `features/<tab>/<slug>.md`
3. Zeile in der passenden Tab-Tabelle oben eintragen, Status: `Planned`
4. Commit: `feat(<tab>/<slug>): initial spec`
