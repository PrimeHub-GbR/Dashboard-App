# PROJ-2: Bestellungs-Viewer (Google Drive → Supabase → Excel-Ansicht)

## Status: Planned
**Created:** 2026-03-03
**Last Updated:** 2026-03-03

## Dependencies
- PROJ-1 (N8N Workflow Hub) — Sync-Trigger nutzt denselben Job-Tracking-Mechanismus

## Übersicht

Bestellungen aus Google Drive Excel-Dateien werden via n8n in Supabase importiert und im Dashboard als interaktive Tabelle angezeigt. Die Ansicht bietet Suchen, Filtern, Sortieren und Inline-Bearbeitung — quasi eine Excel-Ansicht direkt im Dashboard. Google Drive ist die Datenquelle, Supabase ist der Master nach dem Import.

## Datenfluss

```
Google Drive (Excel-Dateien)
  ↓ [n8n "google-drive-sync" Workflow]
Supabase (orders Tabelle)
  ↓ [Next.js API / Supabase Client]
Dashboard (TanStack Table Ansicht)
```

## User Stories

- Als Admin möchte ich alle Bestellungen aus Google Drive in einer strukturierten Tabelle im Dashboard sehen, damit ich nicht mehr direkt in Google Drive suchen muss
- Als Admin möchte ich eine globale Suchleiste haben, die gleichzeitig über Bestellnummer, Produkt, Lieferant und alle anderen Spalten sucht
- Als Admin möchte ich die Bestellungen nach Datumsbereich, Status und Lieferant filtern können
- Als Admin möchte ich alle Spalten auf- und absteigend sortieren können
- Als Admin möchte ich einzelne Felder (Status, Notizen) direkt in der Tabelle bearbeiten, damit sie in Supabase gespeichert werden
- Als Admin möchte ich einen "Sync aus Google Drive" Button, der den n8n-Workflow triggert und neue/aktualisierte Bestellungen importiert
- Als Admin möchte ich sehen, wann der letzte Sync stattgefunden hat
- Als Staff möchte ich die Tabelle sehen und durchsuchen, aber keine Daten bearbeiten oder Sync triggern

## Acceptance Criteria

- [ ] Gegeben ein erfolgreicher Sync, dann zeigt die Tabelle alle Bestellungen aus der Supabase `orders` Tabelle mit Pagination (50 Zeilen pro Seite)
- [ ] Gegeben ein Admin in der Tabellenansicht, wenn er Text in die Suchleiste tippt, dann filtert die Tabelle in Echtzeit über alle sichtbaren Spalten
- [ ] Gegeben gesetzte Filter (Datumsbereich, Status, Lieferant), dann zeigt die Tabelle nur passende Einträge und die aktiven Filter sind als Chips/Badges sichtbar
- [ ] Gegeben ein Klick auf einen Spalten-Header, dann sortiert die Tabelle nach dieser Spalte (erneuter Klick kehrt Richtung um)
- [ ] Gegeben ein Admin klickt auf ein editierbares Feld (Status oder Notiz), dann öffnet sich ein Inline-Edit-Modus und die Änderung wird nach Bestätigung in Supabase gespeichert
- [ ] Gegeben ein Admin klickt "Sync aus Google Drive", dann wird ein n8n Job gestartet, ein Lade-Spinner erscheint, und nach Abschluss aktualisiert sich die Tabelle automatisch
- [ ] Gegeben noch kein Sync durchgeführt, dann zeigt die Seite einen leeren State mit einem prominenten "Ersten Sync starten" Button
- [ ] Gegeben >500 Zeilen, dann funktioniert die Tabelle performant via serverseitiger Pagination und Filterung

## Edge Cases

- **Kein Google Drive Zugriff beim Sync**: Fehler-Toast anzeigen, bestehende Supabase-Daten bleiben unverändert
- **Doppelte Bestellungen nach Sync**: n8n verwendet Upsert mit Bestellnummer als unique key — keine Duplikate
- **Unbekannte Excel-Spalten**: Beim ersten Sync werden alle Spalten aus der Excel-Datei gemappt; neue Spalten in späteren Syncs werden als JSON-Feld in der DB gespeichert
- **Leere Zeilen in Excel**: Werden beim Import übersprungen
- **Gleichzeitiger Sync-Klick**: Zweiter Klick deaktiviert den Button solange ein Job läuft
- **Sehr große Excel-Dateien (>10.000 Zeilen)**: n8n verarbeitet in Batches; Dashboard nutzt serverseitige Pagination
- **Zeichenkodierung**: n8n normalisiert auf UTF-8 beim Import (wichtig für deutsche Umlaute)

## Technical Requirements

- **Performance**: Tabelle lädt initiale 50 Zeilen in < 1 Sekunde; Suche reagiert in < 200ms
- **Security**:
  - Nur authentifizierte User sehen die Tabelle
  - Inline-Bearbeitung und Sync-Trigger nur für Admin-Rolle
  - RLS auf `orders` Tabelle
- **Supabase Tabelle `orders`**:
  - `id` (uuid, PK)
  - `order_number` (text, unique)
  - `order_date` (date)
  - `supplier` (text)
  - `status` (text)
  - `notes` (text, nullable)
  - `raw_data` (jsonb) — alle weiteren Spalten aus Excel
  - `synced_at` (timestamptz)
  - `updated_at` (timestamptz)
- **n8n Workflow `google-drive-sync`**: Neuer Workflow — liest Excel aus Google Drive, transformiert Daten, schreibt via Supabase API (upsert on order_number)
- **Frontend Library**: TanStack Table v8 für Filtering, Sorting, Pagination
- **Sync Status**: Supabase Tabelle `sync_log` (workflow_key, status, synced_at, rows_imported)

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)
_To be added by /architecture_

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
