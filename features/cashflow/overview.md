# CashFlow — Barmittel-Tracking & Analyse

**Status:** Deployed
**Tab:** `/dashboard/cashflow`
**Zugriff:** Nur Admin/Manager

## Ziel

Zentrale Übersicht über die verfügbaren Barmittel. Der Manager dokumentiert zum
Monatsende den Barmittel-Stand je Konto/Firma. Das Dashboard bereitet die Daten
als Diagramme und Analyse auf — Kernfrage: **Haben wir Monat für Monat mehr oder
weniger Geld zur Verfügung?**

## Kontostruktur (verwaltbar)

Initial angelegt (im Tab „Konten" erweiterbar):

| Provider | Firmen |
|----------|--------|
| Finom | PrimeHub, PrimeMax, SolidStore24, ebay |
| Amazon | BuchDepot24, PrimeMax, SolidStore24 |

## Funktionen

- **Übersicht:** KPI-Karten (aktuelle Barmittel, Δ Vormonat absolut + %, höchster/
  niedrigster Stand), Trend-Flächendiagramm (Gesamtbarmittel über die Zeit),
  gestapeltes Balkendiagramm (Aufschlüsselung nach Konto), Monatsvergleichstabelle
  mit farbcodierter Vormonats-Differenz.
- **Eingabe:** Monat wählen oder neuen Monat hinzufügen; jeder Kontostand wird
  einzeln eingetragen (Auto-Save bei Verlassen des Felds, leeres Feld löscht den
  Stand). Live-Gesamtsumme.
- **Konten:** Konten anlegen/bearbeiten/löschen (Provider, Firma, Farbe,
  Reihenfolge, Aktiv-Status). Löschen entfernt per Cascade alle Monatsstände.

## Technik

- **DB:** `supabase/migrations/049_cashflow.sql` — Tabellen `cash_accounts`,
  `cash_balances` (UNIQUE account_id+month). RLS nur Admin/Manager via
  `public.is_admin_or_manager()`.
- **API:** `src/app/api/cashflow/{accounts,balances}/...` — Auth-Helper
  `requireManager()` (`_auth.ts`), Zod-Validierung, Service-Role-Client, Upsert
  auf (account_id, month).
- **Frontend:** `src/app/dashboard/cashflow/page.tsx` (Server, Rollen-Redirect),
  `src/components/cashflow/*` (Client, Recharts). Helper/Typen in
  `src/lib/cashflow.ts`.
- **N8N:** nicht nötig (reines CRUD + Visualisierung).
