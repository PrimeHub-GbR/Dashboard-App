# Product Requirements Document — PrimeHub Dashboard v2

## Vision

Zentrales Operations-Dashboard für ein E-Commerce-Unternehmen. Das Dashboard ersetzt den bisherigen Telegram-basierten Zugang zu n8n-Automatisierungen und schafft eine einheitliche Oberfläche für:

- **Workflow-Steuerung**: Dateien hochladen, n8n-Workflows triggern, Ergebnisse herunterladen
- **Bestellungs-Management**: Google Drive Excel-Daten strukturiert einsehen, suchen, filtern und bearbeiten
- **Preisdatenbank**: Sellerboard SKUs/ASINs mit EK-Preisen, Min/Max-Preisen und Repricer-Status zentral verwalten

## Target Users

**Primäre Nutzer**: Admin / Geschäftsführung (1 Person)
**Sekundäre Nutzer**: Staff (2–3 Personen) mit eingeschränkten Rechten

**Pain Points bisher**:
- Workflow-Trigger nur über Telegram möglich (keine Übersicht, kein Status)
- Bestellungen nur direkt in Google Drive einsehbar (kein Filter, kein Suchen)
- Preisdaten verteilt auf Sellerboard + eigene Excel-Tabellen (kein zentraler Überblick)

## Core Features (Roadmap)

| Priorität | Feature | ID | Status |
|-----------|---------|-----|--------|
| P0 (Foundation) | Login / Authentifizierung — Email + Passwort, Supabase Auth | PROJ-4 | Planned |
| P0 (Foundation) | Dashboard-Navigation — Sidebar Shell für alle Features | PROJ-5 | Planned |
| P0 (MVP) | N8N Workflow Hub — Datei-Upload + Verarbeitung + Download | PROJ-1 | Deployed |
| P0 (MVP) | Bestellungs-Viewer — Google Drive → Supabase → Excel-Ansicht | PROJ-2 | Planned |
| P1 | Preisdatenbank — Sellerboard SKU/ASIN + Repricer Status | PROJ-3 | Planned |
| P1 | WhatsApp Business Kommunikation — Hub + Kontext-Buttons + Versandhistorie | PROJ-6 | Planned |

## Success Metrics

- Admin kann Workflows ohne Telegram bedienen (0 Telegram-Abhängigkeit für Kernprozesse)
- Bestellungssuche in < 2 Sekunden für bis zu 10.000 Zeilen
- Preisdatenbank ist täglich automatisch aktuell (via geplanten n8n Sync)

## Constraints

- **n8n**: Bestehende Instanz unter https://n8n.primehubgbr.com — keine neue Infrastruktur
- **Google Drive**: Anbindung via n8n oder Google Service Account
- **Auth**: Single-Tenant (kein Multi-Tenant, kein Self-Registration)
- **Stack**: Next.js 16, TypeScript, Tailwind CSS, shadcn/ui, Supabase

## Non-Goals (Version 1)

- Kein eigenständiger Repricer — nur Anzeige des Status aus der API
- Keine direkten Schreibzugriffe zurück zu Google Drive (Drive = Source, Supabase = Master)
- Kein Multi-Language Support
- Keine mobile App

---

_Letzte Aktualisierung: 2026-03-03_
_Nächster Schritt: `/frontend` für PROJ-4 (Login) und PROJ-5 (Dashboard-Navigation)_
