# Feature Spec: Aufgaben

**Tab:** `/dashboard/aufgaben`
**Status:** Deployed
**Production:** https://dashboard.primehubgbr.com/dashboard/aufgaben
**Deployed:** 2026-03-23
**Priorität:** P1

## Ziel

Vollständiges Task-Management-System integriert ins PrimeHub Dashboard. Mitarbeiter können Aufgaben erstellen, an Kollegen delegieren, mit Fälligkeitsdaten und E-Mail-Erinnerungen versehen und als erledigt markieren.

## User Stories

- Als Admin möchte ich neue Aufgaben mit Titel, Beschreibung, Priorität und Status anlegen
- Als Admin möchte ich Aufgaben einem oder mehreren Mitarbeitern (aus dem employees-System) zuweisen
- Als Nutzer möchte ich Aufgaben mit einem Haken als erledigt markieren
- Als Nutzer möchte ich eine KPI-Übersicht sehen (Gesamt, Erledigt, Offen, Überfällig, Abschlussrate)
- Als Nutzer möchte ich Aufgaben nach Status, Priorität, Mitarbeiter und Fälligkeit filtern
- Als Nutzer möchte ich Aufgaben in Listen- oder Kanban-Ansicht sehen
- Als Nutzer möchte ich E-Mail-Erinnerungen für fällige Aufgaben konfigurieren

## Akzeptanzkriterien

- [ ] Aufgabe erstellen mit: Titel, Beschreibung, Status, Priorität, Fälligkeitsdatum, Erinnerung, Mitarbeiter
- [ ] Aufgabe bearbeiten über Klick auf Task
- [ ] Aufgabe löschen mit Bestätigung (via Dialog)
- [ ] Als erledigt markieren via Checkbox (Listen-View) oder Button (Dialog)
- [ ] KPI-Cards zeigen aktuelle Werte (live aus DB)
- [ ] Listen-View: sortierbar, mit Priorität/Status/Datum/Assignee-Spalten
- [ ] Kanban-View: 4 Spalten (Offen, In Bearbeitung, In Review, Erledigt), überfällige Tasks oben
- [ ] Filter: Status, Priorität, Mitarbeiter, Fälligkeit (heute/diese Woche/überfällig)
- [ ] E-Mail-Erinnerungen: reminder_at + reminder_email in DB gespeichert, N8N ruft `/api/aufgaben/due-reminders` auf

## Tech Design

### Datenbank
- `tasks` — Haupttabelle (id, title, description, status, priority, due_date, reminder_at, reminder_email, reminder_sent, created_by, timestamps)
- `task_assignees` — Zuweisungen (task_id → employee_id, many-to-many)
- Migration: `supabase/migrations/023_tasks.sql`

### API
- `GET /api/aufgaben` — Liste mit Filter-Params
- `POST /api/aufgaben` — Neue Aufgabe
- `PUT /api/aufgaben/[id]` — Bearbeiten
- `DELETE /api/aufgaben/[id]` — Löschen
- `GET /api/aufgaben/due-reminders` — Fällige Erinnerungen (für N8N)
- `PATCH /api/aufgaben/due-reminders` — reminder_sent=true setzen

### Komponenten
- `src/components/aufgaben/AufgabenClient.tsx` — Haupt-Container
- `src/components/aufgaben/AufgabenKPIs.tsx` — 5 KPI-Cards
- `src/components/aufgaben/AufgabenListView.tsx` — Tabellen-Ansicht
- `src/components/aufgaben/AufgabenKanbanView.tsx` — Kanban-Board
- `src/components/aufgaben/AufgabenFilterBar.tsx` — Filter
- `src/components/aufgaben/AufgabenDialog.tsx` — Erstellen/Bearbeiten Dialog
- `src/components/aufgaben/AufgabeCard.tsx` — Einzelne Kanban-Karte
- `src/components/aufgaben/AssigneeSelector.tsx` — Multi-Select Mitarbeiter
- `src/hooks/useAufgaben.ts` — Data-Fetching + CRUD

### E-Mail-Erinnerungen (N8N)
Der E-Mail-Versand erfolgt über N8N (N8N-First-Rule). Das Dashboard speichert `reminder_at` und `reminder_email`. Ein geplanter N8N-Workflow ruft täglich `/api/aufgaben/due-reminders` auf und sendet E-Mails via SMTP.

Anleitung: Scheduled Workflow in N8N anlegen → Webhook GET auf `/api/aufgaben/due-reminders` → For-Each Task → Gmail/SMTP Node → PATCH `/api/aufgaben/due-reminders` mit `{ task_ids: [...] }`

## Verifikation

1. `npm run build` — keine TypeScript-Fehler
2. Aufgabe erstellen → in Supabase `tasks` prüfen
3. Mitarbeiter zuweisen → `task_assignees` prüfen
4. Aufgabe als erledigt markieren → `completed_at` gesetzt, KPI-Rate steigt
5. Filter "Überfällig" → zeigt nur Tasks mit `due_date < heute AND status != 'done'`
6. Aufgabe löschen → kein verwaister Eintrag in `task_assignees` (CASCADE)

## Deployment

**Production URL:** https://dashboard.primehubgbr.com
**Deployed:** 2026-03-23
**Build:** Ready
**Vercel Deployment:** https://app-klue6b0yl-primehubgbr-2551s-projects.vercel.app
