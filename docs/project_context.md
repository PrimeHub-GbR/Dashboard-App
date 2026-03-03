# Project Context

## Projektübersicht

**Name:** Dashboard App
**Template:** AI Coding Starter Kit
**Stack:** Next.js 16 · TypeScript · Tailwind CSS · shadcn/ui · Supabase
**Deployment:** Vercel

## Technischer Stand

| Bereich | Status |
|---------|--------|
| Next.js Dev Server | Läuft auf localhost:3002 |
| Supabase Client | Konfiguriert (`src/lib/supabase.ts`) |
| Supabase Projekt URL | https://tcqdyzmhwyfamzyeyskj.supabase.co |
| MCP Server | Konfiguriert (`.mcp.json`) |
| shadcn/ui Komponenten | 35+ vorinstalliert |
| Abhängigkeiten | Installiert & bereinigt (0 Vulnerabilities) |

## Projektstruktur

```
Dashboard v2/
├── .claude/              ← Claude Code Regeln & Skills
│   ├── rules/            ← Auto-angewendete Coding-Standards
│   ├── skills/           ← Aufrufbare Workflows (/requirements, /frontend, etc.)
│   └── agents/           ← Sub-Agent Konfigurationen
└── app/                  ← Next.js Anwendung
    ├── src/
    │   ├── app/          ← Seiten (App Router)
    │   ├── components/ui/← shadcn/ui Komponenten
    │   ├── hooks/        ← Custom React Hooks
    │   └── lib/          ← Utilities (supabase.ts, utils.ts)
    ├── features/         ← Feature-Spezifikationen
    │   └── INDEX.md      ← Feature-Status-Übersicht
    └── docs/             ← Dokumentation & PRD
```

## Entwicklungs-Workflow

```
1. /requirements  →  Feature-Spec erstellen (features/PROJ-X.md)
2. /architecture  →  Tech-Design planen
3. /frontend      →  UI-Komponenten bauen
4. /backend       →  API + Datenbank (Supabase)
5. /qa            →  Tests & Sicherheitsaudit
6. /deploy        →  Deployment auf Vercel
```

## Konventionen

- **Feature IDs:** PROJ-1, PROJ-2, ... (sequenziell)
- **Commits:** `feat(PROJ-X): beschreibung`
- **UI:** shadcn/ui first — nie custom Versionen von installierten Komponenten
- **Backend:** RLS immer aktivieren, Zod für Validierung
- **Secrets:** Nur in `.env.local` (gitignored)

## Umgebungsvariablen

| Variable | Beschreibung |
|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase Projekt URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase Anon/Public Key |

## Verfügbare Skills

| Skill | Befehl | Zweck |
|-------|--------|-------|
| Requirements | `/requirements` | Feature-Spec aus Idee erstellen |
| Architecture | `/architecture` | Tech-Architektur planen |
| Frontend | `/frontend` | UI mit React + shadcn/ui bauen |
| Backend | `/backend` | API + Datenbank mit Supabase |
| QA | `/qa` | Tests & Sicherheitsaudit |
| Deploy | `/deploy` | Deployment auf Vercel |
| Help | `/help` | Aktueller Status & nächster Schritt |
