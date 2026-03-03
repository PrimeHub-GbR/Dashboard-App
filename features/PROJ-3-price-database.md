# PROJ-3: Preisdatenbank (Sellerboard SKU/ASIN + Repricer Status)

## Status: Planned
**Created:** 2026-03-03
**Last Updated:** 2026-03-03

## Dependencies
- PROJ-1 (N8N Workflow Hub) — Sellerboard Sync nutzt denselben Job-Tracking-Mechanismus

## Übersicht

Zentrale Preisdatenbank aller Produkte mit SKU, ASIN, EK-Preis (Einkaufspreis), Sellerboard Min/Max-Preisen und aktuellem Repricer-Status (MAX vs BBP — Buy Box Price). Daten werden automatisch via n8n aus der Sellerboard API gezogen. Der Repricer-Status kommt ebenfalls aus einem n8n Workflow, der die Repricing-API abfragt.

## Datenfluss

```
Sellerboard API + Repricing API
  ↓ [n8n "sellerboard" Workflow]
Supabase (products Tabelle)
  ↓ [Next.js API / Supabase Client]
Dashboard (Preisdatenbank-Ansicht)
```

## User Stories

- Als Admin möchte ich alle Produkte mit SKU, ASIN, EK-Preis, Min-Preis, Max-Preis und Repricer-Status in einer zentralen Tabelle sehen
- Als Admin möchte ich nach SKU oder ASIN suchen, um schnell ein bestimmtes Produkt zu finden
- Als Admin möchte ich nach Repricer-Status filtern (z.B. alle Produkte die auf BBP stehen), um Handlungsbedarf zu erkennen
- Als Admin möchte ich sofort sehen, welche Produkte potenziell mit Verlust verkauft werden (Max-Preis < EK-Preis + Mindestmarge)
- Als Admin möchte ich einen "Sellerboard Sync" Button, der den n8n Workflow triggert und alle Preis- und Repricer-Daten aktualisiert
- Als Admin möchte ich die gesamte Preistabelle als CSV exportieren, um sie extern weiterverarbeiten zu können

## Acceptance Criteria

- [ ] Gegeben Produkte in der Datenbank, dann zeigt die Tabelle: SKU, ASIN, EK-Preis (€), Min-Preis (€), Max-Preis (€), Repricer-Status Badge, Zuletzt aktualisiert
- [ ] Gegeben ein Produkt mit Repricer-Status "MAX", dann zeigt ein grüner Badge "MAX"; bei "BBP" ein blauer Badge "BBP"
- [ ] Gegeben ein Admin tippt in die Suchleiste, dann filtert die Tabelle sofort nach SKU und ASIN (Echtzeit-Suche)
- [ ] Gegeben ein aktiver Filter "Repricer-Status: BBP", dann zeigt die Tabelle nur Produkte mit BBP-Status
- [ ] Gegeben ein Produkt wo Max-Preis < EK-Preis × 1.10 (10% Mindestmarge), dann wird die Zeile rot hervorgehoben und ein Verlust-Warning-Icon angezeigt
- [ ] Gegeben ein Klick auf "Sellerboard Sync", dann startet der n8n Workflow, ein Spinner erscheint im Button, und nach Abschluss aktualisiert sich die Tabelle
- [ ] Gegeben ein Klick auf "CSV Export", dann wird die aktuell gefilterte Ansicht als .csv Datei heruntergeladen
- [ ] Gegeben ein Produkt ohne EK-Preis, dann zeigt die EK-Preis Zelle "-" und die Verlust-Warnung wird nicht berechnet

## Edge Cases

- **SKU ohne EK-Preis**: EK-Preis Zelle zeigt "-", Margin-Berechnung wird übersprungen, keine Verlust-Warnung
- **Sellerboard API nicht erreichbar**: Fehler-Toast, letzte bekannte Daten bleiben in Supabase unverändert
- **Repricer API nicht erreichbar**: Repricer-Status Spalte zeigt "Unbekannt" Badge (grau) für betroffene Produkte
- **Doppelte SKUs**: n8n verwendet Upsert mit SKU als unique key — keine Duplikate
- **Sehr viele Produkte (>5.000)**: Serverseitige Pagination (100 Zeilen pro Seite) + serverseitige Suche/Filterung
- **Repricer-Status Werte ausserhalb MAX/BBP**: Als "Unbekannt" Badge anzeigen und im Error-Log festhalten
- **Gleichzeitiger Sync-Klick**: Button während laufendem Job deaktiviert

## Technical Requirements

- **Performance**: Erste 100 Zeilen laden in < 1 Sekunde; Suche reagiert in < 300ms auch bei 5.000+ Produkten
- **Security**:
  - Nur authentifizierte User (Admin + Staff)
  - RLS auf `products` Tabelle
  - Sync-Trigger nur für Admin-Rolle
- **Supabase Tabelle `products`**:
  - `id` (uuid, PK)
  - `sku` (text, unique, NOT NULL)
  - `asin` (text, nullable)
  - `ek_price` (numeric(10,2), nullable) — Einkaufspreis
  - `min_price` (numeric(10,2), nullable) — Sellerboard Min
  - `max_price` (numeric(10,2), nullable) — Sellerboard Max
  - `repricer_status` (text, nullable) — "MAX" | "BBP" | null
  - `updated_at` (timestamptz, NOT NULL)
  - Index auf `sku`, `asin`, `repricer_status`
- **Verlust-Warnung Logik**: `max_price < ek_price * 1.10` (serverseitig berechnet + als computed column)
- **n8n Workflow `sellerboard`**: Erweitern um Repricer-Status-Abruf aus Repricing-API; Upsert in `products` Tabelle
- **Frontend Library**: TanStack Table v8 für Filtering, Sorting, Pagination
- **CSV Export**: Client-seitiger Export der aktuell geladenen + gefilterten Daten (papaparse oder ähnlich)

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)
_To be added by /architecture_

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
