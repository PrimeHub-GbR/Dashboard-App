# CashFlow — Lagerbestand pro Monat

**Status:** Planned
**Tab:** `/dashboard/cashflow`
**Zugriff:** Nur Admin/Manager (wie CashFlow)
**Created:** 2026-10-27
**Last Updated:** 2026-10-27

## Ziel

Neben den Barmitteln wird zum Monatsende auch der **Lagerbestand** dokumentiert,
und zwar **pro Amazon-Konto** (BuchDepot24, PrimeMax, SolidStore24, ...). Der
Lagerbestand ist ein **eigener Bereich**: Er wird **nicht** mit den Barmitteln
verrechnet und verändert keine Barmittel-Summen oder -KPIs.

Kernfrage: **Wächst oder schrumpft unser Lager, und wie verhält sich das zum
Cashflow?** Zum Beispiel: Barmittel steigen, Lager sinkt (Abverkauf), oder
Barmittel sinken, Lager steigt (Einkauf).

## Datenpunkte je Amazon-Konto und Monat

| Feld | Einheit | Bedeutung |
|------|---------|-----------|
| Einheiten | Stück (ganzzahlig) | Anzahl Bücher im Lager |
| Einkaufspreis | EUR | **Gesamtwert** EK aller Bücher im Lager (nicht pro Stück) |
| Potenzieller Umsatz | EUR | Erwarteter Umsatz, wenn alles verkauft wird |
| Potenzieller Gewinn | EUR | **Manuell** eingetragen (kann z. B. Gebühren berücksichtigen), wird nicht berechnet |

## Dependencies

- Requires: `cashflow/overview` (Deployed): Tab, Rollenprüfung, Konten
  (`cash_accounts`), Monatslogik, Eingabe-Muster.
- Lager-Konten = alle **aktiven** `cash_accounts` mit Provider `Amazon`. Wer im Tab
  „Konten" ein neues Amazon-Konto anlegt, bekommt automatisch ein Lagerfeld.

## User Stories

1. Als **Manager** möchte ich am Monatsende pro Amazon-Konto Einheiten,
   Einkaufspreis, potenziellen Umsatz und potenziellen Gewinn eintragen, damit der
   Lagerstand dokumentiert ist.
2. Als **Manager** möchte ich in der Eingabe die Summe aller Amazon-Konten live
   sehen, damit ich meine Zahlen beim Eintippen prüfen kann.
3. Als **Geschäftsführung** möchte ich in der Übersicht den aktuellen Lagerbestand
   mit der Veränderung zum Vormonat (absolut und %) sehen, damit ich erkenne, ob
   das Lager wächst oder schrumpft.
4. Als **Geschäftsführung** möchte ich eine Monatsvergleichstabelle des
   Lagerbestands mit farbiger Veränderung, damit ich die Entwicklung über mehrere
   Monate verfolgen kann.
5. Als **Geschäftsführung** möchte ich Barmittel und Lagerwert (EK) in einem
   gemeinsamen Diagramm sehen, plus eine Linie „Gesamtvermögen" (Barmittel +
   Lager-EK), damit ich sehe, ob Geld ins Lager fließt oder aus dem Lager
   zurückkommt.
6. Als **Manager** möchte ich einzelne Werte nachtragen oder korrigieren können,
   ohne immer alle vier Felder auf einmal ausfüllen zu müssen.

## Acceptance Criteria

### Eingabe (Tab „Eingabe")
- [ ] Unter der Karte „Barmittel — {Monat}" steht eine eigene Karte
      **„Lagerbestand — {Monat}"**. Sie nutzt denselben Monat wie die Monatsauswahl.
- [ ] Die Karte hat eine Zeile pro aktivem Amazon-Konto (Reihenfolge nach
      `sort_order`) mit vier Eingabefeldern: Einheiten, Einkaufspreis,
      Potenzieller Umsatz, Potenzieller Gewinn.
- [ ] Jedes Feld speichert sich **einzeln** beim Verlassen (Auto-Save, wie bei
      den Barmitteln). Wird ein Feld geleert, wird dieser eine Wert gelöscht.
      Die anderen Felder bleiben erhalten.
- [ ] Einheiten akzeptieren nur ganze Zahlen ≥ 0. EUR-Felder akzeptieren Zahlen
      mit bis zu 2 Nachkommastellen, deutsches Format (Komma) wird verstanden.
- [ ] Potenzieller Gewinn darf **negativ** sein. Alle anderen Felder müssen ≥ 0 sein.
- [ ] Ungültige Eingaben werden nicht gespeichert, das Feld zeigt einen Fehler.
      Serverseitig validiert Zod dieselben Regeln.
- [ ] Eine Summenzeile zeigt live die Summen der vier Spalten über alle Konten.
- [ ] Gibt es kein aktives Amazon-Konto, zeigt die Karte einen Hinweis
      („Lege im Tab „Konten" ein Amazon-Konto an").

### Übersicht (Tab „Übersicht")
- [ ] Ein eigener Abschnitt **„Lagerbestand"** ist optisch klar von den
      Barmitteln getrennt (eigene Überschrift).
- [ ] **KPI-Karten:** vier Karten (Einheiten, Einkaufspreis, Potenzieller Umsatz,
      Potenzieller Gewinn) für den neuesten Monat mit Lagerdaten, jeweils als
      Summe aller Amazon-Konten und mit Δ absolut + % zum Vergleichsmonat.
- [ ] **Monatsvergleichstabelle:** eine Zeile pro Monat mit Lagerdaten, Spalten
      = die vier Summenwerte, jeweils mit farbiger Δ zum Vergleichsmonat
      (grün = gestiegen, rot = gesunken). Pro Konto aufklappbar oder per Filter
      einsehbar.
- [ ] **Diagramm Barmittel vs. Lager:** Liniendiagramm über alle Monate mit
      Barmittel gesamt und Lager-Einkaufspreis gesamt.
- [ ] **Gesamtvermögen-Linie:** im selben Diagramm eine dritte Linie
      Barmittel + Lager-EK. Das ist nur eine Anzeige und wird nirgends gespeichert.
- [ ] Bestehende Barmittel-KPIs, -Charts und -Tabelle zeigen **exakt dieselben
      Werte wie vorher** (keine Verrechnung mit Lager).

### Vergleichslogik
- [ ] Vergleichsmonat = der **letzte frühere Monat mit Wert** für dieses Feld.
      Ist das nicht der direkte Vormonat, steht dabei, womit verglichen wird
      (z. B. „zu Aug '26").
- [ ] Ein fehlender Wert zählt als „kein Wert", **nicht als 0**. Er erzeugt also
      keinen künstlichen Einbruch.
- [ ] Δ % wird nicht angezeigt (stattdessen „–"), wenn der Vergleichswert 0 ist
      oder fehlt.

### Zugriff
- [ ] Nur Admin/Manager können Lagerdaten lesen und schreiben (API + RLS),
      genau wie bei den Barmitteln. Staff bekommt 403 und keine Daten.

## Edge Cases

- **Amazon-Konto wird deaktiviert:** Es erscheint nicht mehr in der Eingabe.
  Historische Lagerwerte bleiben in Übersicht und Tabelle sichtbar.
- **Amazon-Konto wird gelöscht:** Seine Lagerwerte werden mitgelöscht (Cascade,
  wie bei den Barmitteln). Der Lösch-Dialog im Tab „Konten" weist darauf hin.
- **Provider wird geändert** (Amazon ↔ anderer Provider): Das Konto erscheint
  bzw. verschwindet in der Lager-Eingabe. Bereits gespeicherte Lagerwerte bleiben
  erhalten und zählen weiter in die Historie.
- **Nur einige Konten eingetragen:** Die Summen enthalten nur vorhandene Werte.
  Die KPI-Karte weist darauf hin, wenn für ein aktives Konto Werte fehlen
  (z. B. „2 von 3 Konten").
- **Monat hat Barmittel, aber kein Lager (oder umgekehrt):** Im Diagramm hat die
  fehlende Linie an dieser Stelle eine Lücke. Die Gesamtvermögen-Linie wird nur
  für Monate gezeigt, in denen **beide** Werte vorhanden sind.
- **Noch gar keine Lagerdaten:** Der Abschnitt „Lagerbestand" zeigt einen
  Leerzustand mit Hinweis auf den Tab „Eingabe" (keine leeren KPI-Karten mit 0).
- **Gleichzeitiges Speichern** desselben Feldes: Der letzte Schreibvorgang gewinnt
  (Upsert pro Konto + Monat).
- **Sehr große Zahlen:** Bis 999.999.999,99 € bzw. 99.999.999 Einheiten erlaubt.

## Technical Requirements

- Kein N8N nötig (reines CRUD + Visualisierung, wie `cashflow/overview`).
- Neue Tabelle mit RLS (Admin/Manager) und eigener Migration (nächste Nr. 152).
  Eindeutig pro Konto + Monat.
- API mit `requireManager()` und Zod, Muster wie `/api/cashflow/balances`.
- Responsive: Die Eingabe-Tabelle mit 4 Spalten ist auf 375 px bedienbar
  (z. B. eine Karte pro Konto statt Tabellenzeile).
- Laden der Lagerdaten verlangsamt die Übersicht nicht spürbar (< 500 ms zusätzlich).

## Nicht-Ziele

- Keine automatische Übernahme aus Amazon/FBA-Berichten (manuelle Eingabe).
- Keine Berechnung des Gewinns aus Umsatz − EK.
- Keine Verrechnung des Lagers mit Barmittel-Summen oder -KPIs (außer der rein
  angezeigten Gesamtvermögen-Linie).

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)
_To be added by /architecture_

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
