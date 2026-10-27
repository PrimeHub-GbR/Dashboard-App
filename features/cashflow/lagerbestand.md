# CashFlow — Lagerbestand pro Monat

**Status:** Deployed
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

_Erstellt: 2026-10-27. Baut auf `cashflow/overview` auf (Migration 049, `/api/cashflow/*`,
`src/components/cashflow/*`). Kein Code, nur Entscheidungen._

### A) Komponenten-Struktur

```
/dashboard/cashflow  (Server-Seite, Rollen-Redirect: unverändert)
└── CashFlowClient                      [erweitert] lädt Konten + Barmittel + NEU Lagerwerte parallel
    ├── Tab „Übersicht"
    │   ├── CashFlowOverview            [unverändert] Barmittel-KPIs, Trend, Stapel, Tabelle
    │   └── InventoryOverview           [NEU] Abschnitt „Lagerbestand" (eigene Überschrift, Trenner)
    │       ├── Leerzustand             (keine Lagerdaten → Hinweis auf Tab „Eingabe")
    │       ├── Fehlerzustand           (Lagerdaten nicht ladbar → Barmittel bleiben sichtbar)
    │       ├── InventoryKpiCards       4 Karten: Einheiten · Einkaufspreis · Pot. Umsatz · Pot. Gewinn
    │       │                           je Karte: Summe, Δ absolut + %, Vergleichsmonat, „2 von 3 Konten"
    │       ├── CashVsInventoryChart    Liniendiagramm: Barmittel gesamt · Lager-EK gesamt · Gesamtvermögen
    │       └── InventoryMonthTable     eine Zeile pro Monat mit Lagerdaten, 4 Spalten mit farbiger Δ
    │           └── Konto-Filter        Auswahl „Alle Amazon-Konten" oder ein einzelnes Konto
    ├── Tab „Eingabe"
    │   └── CashFlowEntry               [erweitert] Monatsauswahl kennt auch Monate mit nur Lagerdaten
    │       ├── Karte „Barmittel — {Monat}"   [unverändert]
    │       └── InventoryEntryCard      [NEU] Karte „Lagerbestand — {Monat}", gleicher Monat
    │           ├── Hinweis ohne Amazon-Konto („Lege im Tab „Konten" ein Amazon-Konto an")
    │           ├── InventoryEntryRow   je aktivem Amazon-Konto (sort_order): 4 Felder mit Auto-Save
    │           │                       Desktop: Tabellenzeile · Mobil (375 px): eine Karte pro Konto
    │           └── Summenzeile         live, 4 Spalten über alle Konten
    └── Tab „Konten"
        └── CashFlowAccounts            [kleine Änderung] Lösch-Dialog nennt auch die Lagerwerte
```

Verwendete shadcn/ui-Bausteine (alle vorhanden): Card, Input, Label, Select, Table, Badge,
Tooltip, Skeleton, Separator, AlertDialog. Diagramme mit Recharts (bereits im Projekt, wie die
bestehenden CashFlow-Charts). Keine neuen Bibliotheken.

Neue Dateien liegen in `src/components/cashflow/` (Präfix `Inventory…`). Rechen- und
Formathelfer (Summen, Vergleichsmonat, Δ, deutsches Zahlenformat) kommen nach
`src/lib/cashflow.ts` bzw. in eine Nachbardatei `src/lib/cashflow-inventory.ts`, damit Übersicht
und Eingabe dieselbe Logik nutzen.

### B) Datenmodell

**Neue Tabelle `cash_inventory`** (Migration `152_cashflow_inventory.sql`), eine Zeile pro
Amazon-Konto und Monat:

| Information | Bedeutung | Regeln |
|---|---|---|
| Konto | Verweis auf `cash_accounts` | Pflicht; Konto gelöscht → Zeile wird mitgelöscht (Cascade) |
| Monat | Periodenschlüssel = 1. des Monats (wie Barmittel) | Pflicht |
| Einheiten | Stück im Lager | leer erlaubt; ganzzahlig, 0 bis 99.999.999 |
| Einkaufspreis | Gesamt-EK aller Bücher in EUR | leer erlaubt; 0 bis 999.999.999,99 |
| Potenzieller Umsatz | EUR | leer erlaubt; 0 bis 999.999.999,99 |
| Potenzieller Gewinn | EUR, manuell | leer erlaubt; **darf negativ sein**, ± 999.999.999,99 |
| Angelegt/geändert von, Zeitstempel | Nachvollziehbarkeit | automatisch |

- **Eindeutig pro Konto + Monat.** Gleichzeitiges Speichern: der letzte Schreibvorgang gewinnt.
- **Jedes der vier Felder ist einzeln leer-bar.** „Leer" heißt „kein Wert", nicht 0.
- Sind alle vier Felder einer Zeile leer, wird die Zeile entfernt (keine Leichen in der DB).
- Die Wertebereiche werden zusätzlich in der Datenbank abgesichert (dritte Verteidigungslinie
  nach Browser und Zod).
- **Zugriff:** RLS aktiv, nur Admin/Manager über die vorhandene Funktion
  `public.is_admin_or_manager()` — exakt wie `cash_balances`.
- Indizes auf Monat und auf Konto + Monat (wie bei den Barmitteln).
- **Keine** Änderung an `cash_accounts` oder `cash_balances`. Ob ein Konto ein Lager-Konto ist,
  wird nicht gespeichert, sondern immer aus „aktiv + Provider = Amazon" abgeleitet.
- Das **Gesamtvermögen** wird nirgends gespeichert, es entsteht nur in der Anzeige.

Datenmenge: ca. 3 Konten × 12 Monate = 36 Zeilen pro Jahr. Die gesamte Historie wird in einem
Aufruf geladen, das liegt deutlich unter der 500-ms-Grenze.

### C) Technische Entscheidungen (Begründung)

1. **Eigene Tabelle statt Erweiterung von `cash_balances`.** Lager ist fachlich getrennt und darf
   die Barmittel nie beeinflussen. Getrennte Tabelle = keine Gefahr, dass bestehende Summen,
   KPIs oder Charts sich verändern (Akzeptanzkriterium „exakt dieselben Werte wie vorher").

2. **Eine Zeile pro Konto + Monat mit vier Feldern** (statt einer Zeile pro Feld). Entspricht der
   Spec („eindeutig pro Konto + Monat"), ist leicht lesbar und passt 1:1 zur Eingabe-Zeile.

3. **Teil-Speichern pro Feld.** Beim Verlassen eines Felds schickt die Oberfläche nur dieses eine
   Feld. Der Server ändert nur dieses Feld und lässt die anderen drei unberührt. Ein geleertes
   Feld wird als „Wert löschen" geschickt. So können zwei Felder kurz nacheinander gespeichert
   werden, ohne sich gegenseitig zu überschreiben.

4. **Kein Neuladen der ganzen Seite nach jedem Speichern.** Die bestehende Barmittel-Eingabe
   lädt nach jedem Speichern alles neu und zeigt dabei kurz den Lade-Zustand. Bei bis zu
   12 Lagerfeldern pro Monat wäre das störend (springender Tab, verlorener Fokus). Die
   Lager-Karte übernimmt deshalb die Antwort des Servers direkt in den lokalen Stand. Die
   Barmittel-Eingabe bleibt unverändert.

5. **Lager-Konten werden immer live abgeleitet.** Eingabe: nur aktive Konten mit Provider
   Amazon, sortiert nach `sort_order`. Übersicht und Tabelle: **alle** Konten mit
   gespeicherten Lagerwerten, auch deaktivierte oder auf einen anderen Provider umgestellte.
   Historie geht also nie verloren. Das weicht bewusst von den Barmitteln ab, die inaktive Konten
   in der Übersicht ausblenden. Diese Abweichung fordert die Spec.

6. **Vergleichslogik, einheitlich für KPI-Karten und Tabelle:**
   - Monatssumme eines Felds = Summe der Konten, die für dieses Feld einen Wert haben. Hat kein
     Konto einen Wert, hat der Monat für dieses Feld „keinen Wert" (nicht 0).
   - Vergleichsmonat = letzter früherer Monat, der für **dieses Feld** einen Wert hat. Ist das
     nicht der direkte Vormonat, wird er angezeigt („zu Aug '26").
   - Δ % zeigt „–", wenn der Vergleichswert 0 ist oder fehlt.
   - Farben: grün = gestiegen, rot = gesunken, grau = unverändert (gilt für alle vier Felder,
     auch Einkaufspreis, wie in der Spec festgelegt).
   - KPI-Karten zeigen den **neuesten Monat mit irgendwelchen Lagerdaten**. Hinweis
     „x von y Konten", wenn für dieses Feld nicht jedes aktive Amazon-Konto einen Wert hat.

7. **Diagramm Barmittel vs. Lager.** Die Barmittel-Linie verwendet **genau dieselbe
   Gesamtsumme** wie der bestehende Trend-Chart, damit beide Diagramme übereinstimmen. Die
   Zeitachse umfasst alle Monate mit Barmitteln oder Lager-EK. Fehlt ein Wert, hat die Linie
   eine Lücke (sie wird nicht auf 0 gezogen). Die Gesamtvermögen-Linie erscheint nur in Monaten,
   in denen beide Werte vorliegen.

8. **Pro-Konto-Ansicht per Filter statt Aufklappen.** Eine Kontoauswahl über der
   Monatsvergleichstabelle („Alle Amazon-Konten" / einzelnes Konto, inaktive mit Zusatz
   „inaktiv"). Gleiche Vergleichslogik, nur auf ein Konto bezogen. Das funktioniert auf dem
   Handy besser als verschachtelte Zeilen. KPI-Karten und Diagramm zeigen immer die Summe.

9. **Deutsches Zahlenformat wird verstanden.** Komma ist das Dezimalzeichen. Punkte gelten als
   Tausendertrenner (1.234,56 → 1234,56). Ein Punkt mit nur 1–2 Ziffern dahinter wird als
   Dezimalzeichen gelesen (12.50 → 12,50). EUR höchstens 2 Nachkommastellen, Einheiten nur ganze
   Zahlen. Ungültige Eingabe: Feld rot mit Meldung, es wird **nichts** gespeichert und der
   gespeicherte Wert bleibt bestehen. Ein Minus ist nur im Feld Potenzieller Gewinn erlaubt.
   Diese Regeln stehen in einem gemeinsamen Helfer und gelten im Browser und, über Zod, auf dem
   Server gleich.

10. **Monatsauswahl gemeinsam.** Die Monatsliste in der Eingabe enthält künftig auch Monate,
    die nur Lagerdaten haben. Sonst wären sie nicht mehr erreichbar. Die Barmittel-Übersicht
    filtert weiterhin nur auf Monate mit Barmitteln, ihre Werte ändern sich also nicht.

11. **Fehler isolieren.** Schlägt das Laden der Lagerdaten fehl, bleibt der Barmittel-Teil voll
    nutzbar. Nur der Lager-Abschnitt bzw. die Lager-Karte zeigt einen Fehlerhinweis mit
    „Erneut laden".

### D) Backend nötig? **JA**

- **Datenbank:** neue Tabelle `cash_inventory` mit RLS (Admin/Manager), Migration
  `supabase/migrations/152_cashflow_inventory.sql`.
- **API** (neu, Muster wie `/api/cashflow/balances`: Rollenprüfung, Zod, Service-Client):
  - `GET /api/cashflow/inventory`: alle Lagerzeilen (optional von/bis-Monat), aufsteigend nach
    Monat, mit Obergrenze für die Anzahl.
  - `POST /api/cashflow/inventory`: Teil-Upsert für Konto + Monat. Nur die mitgeschickten Felder
    werden geändert, ein mitgeschicktes „leer" löscht diesen Wert, nicht mitgeschickte Felder
    bleiben. Sind danach alle vier leer, wird die Zeile entfernt. Antwort: die aktuelle Zeile
    (oder „entfernt"), damit die Oberfläche ohne Neuladen weiterarbeiten kann.
  - Server prüft zusätzlich, dass das Konto existiert (sonst 400/404). Schreiben ist nur für
    Konten mit Provider Amazon erlaubt. So kann die API keine Lagerwerte an Finom-Konten hängen.
  - Ein eigener Lösch-Endpunkt ist nicht nötig, denn Leeren läuft über den Teil-Upsert.
- **Zugriff:** Die Spec fordert für Staff **403**. Der bestehende Helfer `requireManager()`
  unterscheidet nicht zwischen „nicht eingeloggt" und „falsche Rolle" (beides 401 in den
  Barmittel-Routen). Für die neuen Routen gilt: kein Login → 401, eingeloggt ohne
  Admin/Manager-Rolle → 403. Dafür bekommt `_auth.ts` eine Variante, die den Grund liefert.
  `requireManager()` selbst und die bestehenden Routen bleiben unverändert. Das ist keine
  Änderung am Login-Ablauf.
- **Kleine Frontend-Änderung im Tab „Konten":** Der Lösch-Dialog nennt zusätzlich „und alle
  Lagerwerte".

### E) N8N nötig? **NEIN**

Reine Dateneingabe (CRUD) und Darstellung, keine Datei-Verarbeitung, keine externen APIs, keine
Batch- oder Zeitjobs. Eine Übernahme aus Amazon/FBA-Berichten ist ausdrücklich Nicht-Ziel.

### Reihenfolge für die nächsten Agents

1. UI/UX: Lager-Abschnitt in Übersicht und Lager-Karte in Eingabe (Desktop-Tabelle und Mobil-Karte),
   alle Zustände (laden, leer, Fehler, kein Amazon-Konto, ungültige Eingabe, speichert, gespeichert).
2. Frontend: Komponenten + gemeinsame Helfer. Barmittel-Komponenten nur minimal anfassen
   (Monatsliste, Lösch-Text, Einbindung).
3. Backend: Migration 152 + `/api/cashflow/inventory` (GET, POST).
4. QA: zusätzlich prüfen, dass die Barmittel-KPIs, Charts und Tabelle vor/nach identisch sind.

## UI/UX Design

_Erstellt: 2026-10-27. Baut auf den bestehenden CashFlow-Komponenten auf (`CashFlowOverview`,
`CashFlowEntry`, `CashFlowAccounts`). Ziel: Der Lager-Teil sieht aus wie der Barmittel-Teil
(gleiche Karten, gleiche KPI-Optik, Recharts, Auto-Save beim Verlassen), ist aber durch eine
eigene Abschnittsüberschrift klar getrennt. Die Hinweise sind Richtwerte für Tailwind, kein
fertiger Code._

### Verbindliche Gestaltungsentscheidungen

1. **Reihenfolge wie bei den Barmitteln:** KPI-Karten → Diagramm → Monatstabelle. Gleiche
   Kartenabstände (`space-y-6`), gleiches KPI-Raster (`grid gap-4 sm:grid-cols-2 lg:grid-cols-4`).
2. **„Kein Wert“ ist immer „—“** (Geviertstrich, `text-muted-foreground`), nie „0“. Das gilt für
   Werte, Summen, Tabellenzellen und Platzhalter in den Eingabefeldern. Ein fehlendes Δ % wird
   als „–“ angezeigt.
3. **Farbe nie allein:** Eine Veränderung hat immer Vorzeichen und Pfeil-Icon
   (`ArrowUpRight` / `ArrowDownRight` / `Minus`), die Farbe kommt nur dazu.
4. **Δ-Farben (neue Komponenten):** gestiegen `text-green-700 dark:text-green-400`, gesunken
   `text-red-600 dark:text-red-400`, unverändert oder kein Vergleich `text-muted-foreground`.
   Das ist bewusst eine Stufe dunkler als das `text-green-600` der Barmittel, damit kleine Schrift
   AA (4,5:1) erreicht. Die Barmittel-Komponenten werden **nicht** angepasst.
5. **Kein Erfolgs-Toast pro Feld.** Bei bis zu 12 Feldern pro Monat wäre das zu viel. Das
   Speichern wird direkt am Feld angezeigt (Spinner → Haken). Toasts (`sonner`) gibt es nur bei
   Serverfehlern.
6. **Kein globaler Lade-Zustand nach dem Speichern.** Die Lager-Karte springt nicht und behält
   den Fokus (siehe Tech Design C4).

### Zahlenformate (gemeinsamer Helfer in `src/lib/cashflow-inventory.ts`)

| Wert | Anzeige | Beispiel |
|---|---|---|
| Einheiten | `de-DE`, ganzzahlig + „ Stk.“ | `12.345 Stk.` |
| EUR (KPI, Tabelle, Summe) | `formatEUR` (vorhanden) | `48.210,50 €` |
| EUR-Achse im Diagramm | `formatEURShort` (vorhanden) | `48.211 €` |
| Δ absolut | Vorzeichen immer, `+` / `−` | `+1.240 Stk.`, `−2.310,00 €` |
| Δ % | 1 Nachkommastelle, Komma, Leerzeichen vor % | `+4,1 %`, `−12,0 %`, `–` |
| Vergleichsmonat | nur wenn nicht direkter Vormonat, `formatMonthShort` | `zu Aug '26` |
| Eingabefeld nach dem Speichern | deutsch normalisiert, ohne Währungszeichen (das steht als Suffix) | `1.234,56` |
| Eingabefeld beim Tippen | Rohtext des Nutzers, keine Umformatierung | `1234,5` |

Alle Zahlen in Tabellen, Karten und Eingabefeldern: `tabular-nums`, rechtsbündig.

---

### Seite `/dashboard/cashflow`

Einzige Änderung am Seitenkopf (`page.tsx`): Untertitel wird zu
**„Barmittel und Lagerbestand pro Monatsende — Trend & Analyse über alle Konten“**.
Tabs „Übersicht · Eingabe · Konten“ bleiben unverändert.

**Initiales Laden (`CashFlowClient`):** Die drei Abrufe laufen parallel (`Promise.allSettled`).
Das bestehende Seiten-Skeleton bleibt sichtbar, bis alle drei fertig sind (Erfolg oder Fehler).
Ein Fehler beim Lager-Abruf blockiert die Seite **nicht**. Der Client merkt sich nur
`inventoryError = true` und gibt das an `InventoryOverview` und `InventoryEntryCard` weiter.
„Erneut laden“ ruft nur `GET /api/cashflow/inventory` neu ab, nicht die Barmittel.

---

### Tab „Übersicht“

```
┌────────────────────────────────────────────────────────────────────────┐
│ [CashFlowOverview — unverändert: KPIs, Trend, Aufschlüsselung, Tabelle] │
├────────────────────────────────────────────────────────────────────────┤  ← Separator my-2
│ [Package] Lagerbestand                          [Stand: Oktober 2026]   │  ← Abschnittskopf
│ Amazon-Konten · wird nicht mit den Barmitteln verrechnet                │
│                                                                        │
│ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐    │
│ │ Einheiten    │ │ Einkaufspreis│ │ Pot. Umsatz  │ │ Pot. Gewinn  │    │
│ │ 12.345 Stk.  │ │ 48.210,50 €  │ │ 96.400,00 €  │ │ 21.300,00 €  │    │
│ │ ↗ +1.240 Stk.│ │ ↘ −2.310,00 €│ │ ↗ +3.100,00 €│ │ – —          │    │
│ │ +11,2 % · zu │ │ −4,6 %       │ │ +3,3 %       │ │ kein Vergl.  │    │
│ │ Aug '26      │ │ [2 von 3 K.] │ │              │ │              │    │
│ └──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘    │
│                                                                        │
│ ┌ Barmittel vs. Lager (EK) ──────────────────────────────────────────┐ │
│ │  ── Barmittel   ── Lager-EK   - - Gesamtvermögen                   │ │
│ │  [LineChart, 300 px]                                               │ │
│ │  Gesamtvermögen = Barmittel + Lager-EK, nur Monate mit beiden Werten│ │
│ └────────────────────────────────────────────────────────────────────┘ │
│                                                                        │
│ ┌ Monatsvergleich Lager ────────────────── [Alle Amazon-Konten   ▾] ─┐ │
│ │ Monat     │ Einheiten   │ Einkaufspreis │ Pot. Umsatz │ Pot. Gewinn│ │
│ │ Aug 2026  │ 11.105 Stk. │ 50.520,50 €   │ …           │ —          │ │
│ │           │ —           │ —             │             │            │ │
│ │ Okt 2026  │ 12.345 Stk. │ 48.210,50 €   │ …           │ 21.300,00 €│ │
│ │           │ ↗ +1.240 ·  │ ↘ −2.310,00 € │             │ –          │ │
│ │           │ +11,2 %     │ · −4,6 %      │             │            │ │
│ │           │ zu Aug '26  │ zu Aug '26    │             │            │ │
│ └────────────────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────────────┘
```

**Einbindung:** `InventoryOverview` steht **unter** `CashFlowOverview` im selben `TabsContent`
(Wrapper `space-y-6`). Hat die Übersicht keine Barmittel-Daten, zeigt `CashFlowOverview` wie bisher
seine Leer-Karte und der Lager-Abschnitt folgt trotzdem darunter.

#### InventoryOverview (Abschnitt)

- **Container:** `<section aria-labelledby="inventory-heading" className="space-y-6">`, davor
  `<Separator className="my-2" />`.
- **Abschnittskopf:** `flex flex-wrap items-start justify-between gap-2`
  - Links: `h2#inventory-heading` mit `Package`-Icon (`h-5 w-5 text-muted-foreground`,
    `aria-hidden`) + „Lagerbestand“, `flex items-center gap-2 text-lg font-medium`. Darunter
    `text-sm text-muted-foreground`: „Amazon-Konten · wird nicht mit den Barmitteln verrechnet“.
  - Rechts: `Badge variant="secondary"` „Stand: {formatMonthLabel(kpiMonth)}“ (nur wenn Daten da sind).
- **Zustände:**

| Zustand | Darstellung |
|---|---|
| Laden (nur bei „Erneut laden“) | Abschnittskopf bleibt, darunter 4× `Skeleton h-28` im KPI-Raster + `Skeleton h-80` + `Skeleton h-64` |
| Leer (keine Lagerzeile) | Eine Card im Stil der Barmittel-Leer-Karte: `CardContent flex flex-col items-center gap-3 py-16 text-center`, Icon `Package h-10 w-10 text-muted-foreground`, Titel `font-medium` „Noch kein Lagerbestand erfasst“, Text `text-sm text-muted-foreground` „Trage im Tab „Eingabe“ unter „Lagerbestand“ die Werte deiner Amazon-Konten ein. Die Auswertung erscheint hier automatisch.“ Keine KPI-Karten mit 0. |
| Leer + kein aktives Amazon-Konto | Gleiche Leer-Karte, Text: „Lege zuerst im Tab „Konten“ ein Amazon-Konto an.“ |
| Ladefehler | `Alert variant="destructive"` mit `AlertCircle`: Titel „Lagerbestand konnte nicht geladen werden“, Text „Die Barmittel sind davon nicht betroffen.“, rechts `Button variant="outline" size="sm"` „Erneut laden“ (`RotateCw`-Icon). Mobil steht der Button unter dem Text (`flex-col sm:flex-row`). |
| Daten | KPI-Karten, Diagramm, Tabelle |

#### InventoryKpiCards

- **Raster:** `grid gap-4 sm:grid-cols-2 lg:grid-cols-4` (identisch zu den Barmitteln).
- **Karte** (gleiche Struktur wie `KpiCard`):
  - `CardHeader pb-2` → `CardTitle text-sm font-medium text-muted-foreground`: „Einheiten“,
    „Einkaufspreis (EK)“, „Potenzieller Umsatz“, „Potenzieller Gewinn“.
  - Wert: `text-2xl font-bold tabular-nums`. Kein Wert in diesem Monat → „—“ in
    `text-muted-foreground`, darunter `text-xs text-muted-foreground` „Kein Wert für {Monat}“.
  - Δ-Zeile: `mt-1 flex items-center gap-1 text-sm font-medium tabular-nums` + Δ-Farbe +
    Icon `h-4 w-4` (`aria-hidden`). Inhalt: „+1.240 Stk.“.
  - Unterzeile: `text-xs text-muted-foreground`: „+11,2 %“ bzw. „–“, danach „ · zu Aug '26“,
    falls der Vergleich nicht der direkte Vormonat ist. Kein Vergleichsmonat → nur
    „Kein Vergleichsmonat“ (keine Δ-Zeile).
  - Abdeckung: Haben nicht alle aktiven Amazon-Konten für **dieses Feld** einen Wert →
    `Badge` mit Warn-Stil `mt-2 border-transparent bg-yellow-100 text-yellow-800
    dark:bg-yellow-900/30 dark:text-yellow-400` „2 von 3 Konten“. Badge in einem `Tooltip`:
    „Fehlt: SolidStore24“ (kommagetrennt). Der Trigger ist fokussierbar (`tabIndex={0}`), damit
    der Tooltip auch per Tastatur erreichbar ist.
- **Potenzieller Gewinn negativ:** Wert mit Minus „−1.200,00 €“, Farbe bleibt `text-foreground`
  (Rot ist für Veränderungen reserviert).
- **Barrierefreiheit:** Jede Karte hat `aria-label` als vollständigen Satz, z. B.
  „Einheiten Oktober 2026: 12.345 Stück, plus 1.240 zu August 2026, plus 11,2 Prozent, 2 von 3 Konten“.
- **Responsive:** 375 px: 1 Spalte · ab `sm` 2 Spalten · ab `lg` 4 Spalten.

#### CashVsInventoryChart

- **Container:** `Card` → `CardHeader` mit `CardTitle` „Barmittel vs. Lager (EK)“ und
  `CardDescription` „Fließt Geld ins Lager oder kommt es zurück?“. `CardContent`.
- **Diagramm:** Recharts `LineChart` in `ResponsiveContainer width="100%"`, Höhe 300 px
  (unter `sm` 260 px), `margin={{ top: 10, right: 10, left: 0, bottom: 0 }}`, Raster, Achsen,
  Schrift 12 und `YAxis width={80} tickFormatter=formatEURShort` wie im Trend-Chart.
- **Linien:**

| Linie | Daten | Farbe | Stil |
|---|---|---|---|
| Barmittel | **dieselbe Summe wie der Trend-Chart** | `#22c55e` (gleich wie Trend) | durchgezogen, `strokeWidth 2` |
| Lager-EK | Summe Einkaufspreis | `#f59e0b` (Amber) | durchgezogen, `strokeWidth 2` |
| Gesamtvermögen | nur Monate mit beiden Werten | `#3b82f6` (Blau) | gestrichelt `strokeDasharray="5 4"`, `strokeWidth 2` |

- `type="monotone"`, `connectNulls={false}` (Lücken bleiben Lücken), `dot={{ r: 3 }}` und
  `activeDot={{ r: 5 }}`. Die Punkte sind Pflicht, sonst wäre ein einzelner Monat zwischen
  zwei Lücken unsichtbar. Fehlende Werte als `null` übergeben, nie als 0.
- **Legende:** oben (`verticalAlign="top"`, `wrapperStyle fontSize 12`). Klick auf einen
  Legendeneintrag blendet die Linie aus und wieder ein (gedimmt `opacity 0.4`). Das ist optional,
  aber empfohlen.
- **Tooltip:** `contentStyle={{ borderRadius: 8 }}`. Monat als Kopf, alle drei Reihen. Fehlender
  Wert → „kein Wert“. Format `formatEUR`.
- **Hinweis unter dem Diagramm:** `mt-2 text-xs text-muted-foreground`: „Gesamtvermögen =
  Barmittel + Lager-EK, nur in Monaten mit beiden Werten. Wird nicht gespeichert.“
- **Sonderfälle:** Nur ein Monat → Diagramm trotzdem zeigen (Punkte). Keine Lager-EK-Werte, aber
  andere Lagerfelder → Diagramm zeigt nur Barmittel, Hinweis ergänzt „Noch kein Einkaufspreis
  erfasst.“
- **Barrierefreiheit:** Wrapper `role="img"` und `aria-label` mit Kurzfassung (letzter Monat:
  Barmittel, Lager-EK, Gesamtvermögen). Farben unterscheiden sich zusätzlich durch Strichart
  (Gesamtvermögen gestrichelt).

#### InventoryMonthTable (mit Konto-Filter)

- **Container:** `Card`. `CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between space-y-0"`.
  - Links `CardTitle` „Monatsvergleich Lager“.
  - Rechts Filter: `Label` (sr-only) „Konto“ + `Select` `w-full sm:w-64`. Optionen:
    „Alle Amazon-Konten“ (Standard), dann alle Konten mit Lagerdaten in `sort_order`, als
    „{Name}“. Inaktive bekommen den Zusatz `text-muted-foreground` „· inaktiv“, Konten mit anderem
    Provider „· kein Amazon mehr“. Jede Option hat links den Farbpunkt des Kontos
    (`h-2.5 w-2.5 rounded-full`).
- **Tabelle:** shadcn `Table`, Spalten: Monat · Einheiten · Einkaufspreis · Pot. Umsatz ·
  Pot. Gewinn. Zahlenspalten `text-right`. Zeilen **aufsteigend** nach Monat (wie die
  Barmittel-Tabelle). Nur Monate mit Lagerdaten (bei Filter: mit Daten dieses Kontos).
- **Zelle:** zweizeilig `flex flex-col items-end gap-0.5`
  - Zeile 1: Wert `tabular-nums` (Summen-Ansicht `font-semibold`), kein Wert → „—“ gedämpft.
  - Zeile 2: `text-xs tabular-nums` + Δ-Farbe: „+1.240 Stk. · +11,2 %“. Bei Vergleich mit einem
    früheren als dem Vormonat zusätzlich eine dritte Zeile `text-xs text-muted-foreground`
    „zu Aug '26“. Erste Zeile mit Wert oder fehlender Wert → keine Δ-Zeile.
- **Zeilen-Hover:** `hover:bg-muted/50` (Standard der shadcn-Tabelle).
- **Filter ohne Daten** (z. B. Konto wurde gerade geleert): eine Zeile über alle Spalten,
  `text-center text-sm text-muted-foreground py-8`: „Für dieses Konto sind keine Lagerwerte erfasst.“
- **Responsive:** Unter `md` wird die Tabelle in `overflow-x-auto` gepackt, `Table` mit
  `min-w-[640px]`, die Monatsspalte ist sticky (`sticky left-0 bg-card z-10`), damit beim
  horizontalen Wischen der Monat sichtbar bleibt. Die Seite selbst scrollt nie horizontal.
- **Barrierefreiheit:** `TableCaption className="sr-only"`: „Lagerbestand je Monat, {Filtername},
  mit Veränderung zum Vergleichsmonat“. Die Δ-Zeile hat `sr-only`-Text „Veränderung“, damit
  Screenreader „Veränderung plus 1.240 Stück“ vorlesen.

---

### Tab „Eingabe“

```
Desktop (≥ md)
┌ Monat wählen ─────────────────────────── (unverändert, Liste inkl. Lager-Monate) ┐
└──────────────────────────────────────────────────────────────────────────────────┘
┌ Barmittel — Oktober 2026 ─────────────── (unverändert) ──────────────────────────┐
└──────────────────────────────────────────────────────────────────────────────────┘
┌ Lagerbestand — Oktober 2026 ─────────────────────────────────────────────────────┐
│ Amazon-Konten · Gesamtwerte zum Monatsende, nicht pro Stück                      │
│                                                                                  │
│ KONTO            EINHEITEN      EINKAUFSPREIS    POT. UMSATZ      POT. GEWINN    │
│ ● BuchDepot24    [  4.120 Stk.]✓[ 18.400,00 €]  [ 36.900,00 €]   [  8.100,00 €]  │
│ ● PrimeMax       [  5.900 Stk.] [ 21.010,50 €]◌ [ 41.200,00 €]   [ —        €]   │
│ ● SolidStore24   [ 12a    Stk.]! [ —        €]  [ —        €]   [ —        €]    │
│                   Nur ganze Zahlen ≥ 0                                           │
│ ──────────────────────────────────────────────────────────────────────────────── │
│ Summe Okt 2026    10.020 Stk.    39.410,50 €      78.100,00 €      8.100,00 €    │
│                   (ungültige Eingaben nicht mitgezählt)                          │
│                                                                                  │
│ Werte werden automatisch gespeichert, sobald du das Feld verlässt. Ein leeres     │
│ Feld entfernt nur diesen einen Wert.                                             │
└──────────────────────────────────────────────────────────────────────────────────┘
 ✓ = gespeichert   ◌ = speichert   ! = ungültig

Mobil (< md, 375 px)
┌ Lagerbestand — Okt 2026 ──────────┐
│ Amazon-Konten · Gesamtwerte …     │
│ ┌ ● BuchDepot24 ────────────────┐ │
│ │ Einheiten       Einkaufspreis │ │
│ │ [ 4.120 Stk.]✓  [18.400,00 €] │ │
│ │ Pot. Umsatz     Pot. Gewinn   │ │
│ │ [36.900,00 €]   [ 8.100,00 €] │ │
│ └───────────────────────────────┘ │
│ ┌ ● PrimeMax ───────────────────┐ │
│ │ …                             │ │
│ └───────────────────────────────┘ │
│ ┌ Summe Okt 2026 (bg-muted/50) ─┐ │
│ │ Einheiten       Einkaufspreis │ │
│ │ 10.020 Stk.     39.410,50 €   │ │
│ │ Pot. Umsatz     Pot. Gewinn   │ │
│ │ 78.100,00 €     8.100,00 €    │ │
│ └───────────────────────────────┘ │
│ Werte werden automatisch …        │
└───────────────────────────────────┘
```

**Einbindung in `CashFlowEntry`:** Die Karte steht direkt unter „Barmittel — {Monat}“ im selben
`space-y-6`-Stapel und bekommt den gewählten `month`. Die Monatsauswahl bleibt optisch gleich, nur
die Liste enthält jetzt auch Monate mit nur Lagerdaten. Monatswechsel setzt die Lager-Entwürfe,
Fehler und Status zurück. Die bestehende Frühausstiegs-Karte „Keine aktiven Konten“ von
`CashFlowEntry` bleibt unverändert.

#### InventoryEntryCard

- **Container:** `Card`. `CardHeader` → `CardTitle` „Lagerbestand — {formatMonthLabel(month)}“ und
  `CardDescription` „Amazon-Konten · Gesamtwerte zum Monatsende, nicht pro Stück“.
  `CardContent className="space-y-4"`.
- **Desktop-Raster (ab `md`):** eine gemeinsame Grid-Vorlage für Kopf-, Konto- und Summenzeile,
  damit alle Spalten bündig sind:
  `grid items-start gap-x-3 gap-y-1 md:grid-cols-[minmax(9rem,1fr)_repeat(4,minmax(8.5rem,11rem))]`.
  - Kopfzeile (`hidden md:grid`): Labels `text-xs font-medium uppercase tracking-wide
    text-muted-foreground`, Zahlenspalten `text-right` (mit `pr-6` als Platz für das
    Status-Icon). Die Kopfzeile ist `aria-hidden`, weil jedes Feld ein eigenes Label hat.
- **Zustände der Karte:**

| Zustand | Darstellung |
|---|---|
| Kein aktives Amazon-Konto | Karte mit Kopf, Inhalt `py-10 text-center`: Icon `Package h-8 w-8 text-muted-foreground`, Text `text-sm text-muted-foreground` „Noch kein Amazon-Konto. Lege im Tab „Konten“ ein Amazon-Konto an, dann erscheint es hier automatisch.“ |
| Ladefehler | `Alert variant="destructive"` „Lagerbestand konnte nicht geladen werden. Die Barmittel kannst du trotzdem eintragen.“ + `Button variant="outline" size="sm"` „Erneut laden“. **Keine Eingabefelder**, damit nichts über unbekannte Werte geschrieben wird. |
| Laden (nach „Erneut laden“) | Pro Konto eine Zeile `Skeleton h-9` über die volle Breite, Summenzeile `Skeleton h-6 w-1/2` |
| Daten | Kontozeilen + Summe + Hinweistext |

- **Hinweistext unten:** `text-xs text-muted-foreground`: „Werte werden automatisch gespeichert,
  sobald du das Feld verlässt. Ein leeres Feld entfernt nur diesen einen Wert.“

#### InventoryEntryRow (Desktop-Zeile / Mobil-Karte)

- **Ein Markup für beide Ansichten** (kein doppeltes Rendern, sonst doppelte Feld-IDs):
  - Mobil: `rounded-lg border p-4 space-y-3`, darin Kontoname als Kopf und
    `grid grid-cols-2 gap-3` für die vier Felder.
  - Ab `md`: `md:contents` bzw. die Grid-Vorlage oben, `md:border-0 md:p-0`, Zeilenabstand
    `md:py-1.5`, Feld-Labels `md:sr-only`.
- **Kontoname:** Farbpunkt `h-3 w-3 shrink-0 rounded-full` (Inline-Farbe aus `acc.color`, wie
  bei den Barmitteln) + `text-sm font-medium` (mobil) bzw. `text-sm` (Desktop), `truncate` mit
  `title` für lange Namen. Desktop vertikal mittig zur Feldhöhe (`md:h-9 md:flex md:items-center`).
- **Feld** (vier je Konto), Aufbau von außen nach innen:
  - `div.space-y-1` → `Label htmlFor` (mobil sichtbar `text-xs text-muted-foreground`, ab `md`
    `sr-only`, Text „Einheiten – BuchDepot24“ usw.).
  - `div.flex items-center gap-1.5` → `div.relative flex-1` mit `Input` + Suffix, daneben ein
    fester **Status-Slot `h-4 w-4 shrink-0`**. Der Slot ist immer da, damit nichts springt.
  - `Input`: `h-9 pr-10 text-right tabular-nums`, Einheiten `inputMode="numeric"`,
    EUR `inputMode="decimal"`, Gewinn `inputMode="text"` (iOS-Zahlentastatur hat kein Minus).
    Platzhalter „—“. `autoComplete="off"`.
  - Suffix: `pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm
    text-muted-foreground`, „Stk.“ bzw. „€“ (wie das €-Suffix der Barmittel).
  - Fehlermeldung: `p` mit `id` = `${fieldId}-error`, `text-xs text-destructive`, darunter.
- **Feld-Zustände:**

| Zustand | Auslöser | Darstellung |
|---|---|---|
| Leer | kein gespeicherter Wert | Platzhalter „—“ |
| Gefüllt | gespeicherter Wert | normalisiert „1.234,56“ |
| Fokus | Tastatur oder Klick | Standard-Fokusring von shadcn `Input` (nie entfernen), Inhalt bleibt wie er ist |
| Tippen | Änderung | kein Indikator. Summe aktualisiert sich live, wenn der Wert gültig ist |
| Unverändert verlassen | normalisierter Wert = gespeicherter Wert | **kein Request**, kein Icon |
| Speichert | Blur mit gültiger Änderung | Slot: `Loader2 h-4 w-4 animate-spin text-muted-foreground`, Feld bleibt bedienbar (nicht disabled, damit Tab-Navigation nicht hängen bleibt) |
| Gespeichert | Antwort OK | Slot: `Check h-4 w-4 text-green-700 dark:text-green-400`, nach 2 s ausblenden (`transition-opacity duration-200`). Feld zeigt den Serverwert normalisiert |
| Wert entfernt | leeres Feld verlassen, Wert war da | wie „Gespeichert“, Feld zeigt Platzhalter „—“ |
| Ungültig | Client-Prüfung schlägt fehl | **kein Request.** `border-destructive focus-visible:ring-destructive`, `aria-invalid="true"`, `aria-describedby` → Fehlermeldung. Slot: `AlertCircle h-4 w-4 text-destructive`. Der Text bleibt stehen, damit der Nutzer ihn korrigieren kann. Ist ein Wert gespeichert, zeigt die Meldung zusätzlich: „Gespeichert bleibt: 4.120 Stk.“ |
| Serverfehler | Antwort nicht OK / Netz | Feld wie „Ungültig“ (roter Rand, `AlertCircle`), Meldung „Nicht gespeichert. Feld erneut verlassen, um es nochmal zu versuchen.“ + `toast.error("Speichern fehlgeschlagen — {Konto}: {Feldname}")`. Entwurf bleibt erhalten |
| Server lehnt ab (400) | z. B. Wertebereich | Meldung aus der API-Antwort oder „Wert ungültig“, sonst wie Serverfehler |

- **Fehlermeldungen (kurz, deutsch):**
  - Einheiten: „Nur ganze Zahlen ab 0“ · „Höchstens 99.999.999“
  - Einkaufspreis / Umsatz: „Nur Beträge ab 0, max. 2 Nachkommastellen“ · „Höchstens 999.999.999,99 €“
  - Gewinn: „Nur Beträge mit max. 2 Nachkommastellen“ · „Zwischen −999.999.999,99 € und 999.999.999,99 €“
  - Unlesbar: „Bitte eine Zahl eingeben (z. B. 1.234,56)“
- **Tastatur:**
  - `Tab` geht zeilenweise durch die Felder (DOM-Reihenfolge Konto 1: 4 Felder → Konto 2 …).
  - `Enter` speichert wie Blur, der Fokus bleibt im Feld.
  - `Escape` verwirft den Entwurf und stellt den gespeicherten Wert wieder her (Fehler weg).
- **Reihenfolge der Speicherungen:** Jedes Feld schickt nur sich selbst. Speichert ein Feld noch,
  während ein anderes desselben Kontos verlassen wird, laufen beide Requests (der Server ändert
  jeweils nur sein Feld). Die Antwort wird nur auf dieses eine Feld angewendet, damit ein späterer
  Request den Entwurf des Nachbarfelds nicht überschreibt.

#### Summenzeile

- **Desktop:** gleiche Grid-Vorlage, `border-t pt-3 mt-1`. Spalte 1 `text-sm font-medium`
  „Summe {formatMonthShort(month)}“. Zahlenspalten `text-right font-semibold tabular-nums pr-[2.875rem]`
  (bündig mit dem Feldinhalt, also Suffix + Status-Slot ausgeglichen), mit Einheit im Text
  („10.020 Stk.“, „39.410,50 €“).
- **Mobil:** eigener Block `rounded-lg bg-muted/50 p-4`, Titel `text-sm font-medium`, darunter
  `grid grid-cols-2 gap-3` mit Label `text-xs text-muted-foreground` + Wert `font-semibold tabular-nums`.
- **Rechenregel:** live aus gespeicherten Werten + **gültigen** Entwürfen. Spalte ohne einen
  einzigen Wert → „—“. Gibt es irgendwo ein ungültiges Feld, steht unter der Summe
  `text-xs text-muted-foreground` „Ungültige Eingaben sind nicht mitgezählt.“
- **Barrierefreiheit:** `aria-live="polite"` auf dem Summenbereich ist **nicht** gewünscht
  (würde bei jedem Tastendruck vorlesen). Stattdessen sind die Summen normale, lesbare Texte mit
  `sr-only`-Präfix „Summe Einheiten:“ usw.

---

### Tab „Konten“ — CashFlowAccounts (Lösch-Dialog)

Nur der Text in `AlertDialogDescription` ändert sich, für alle Konten gleich (die Cascade gilt
immer):

> „{Provider} · {Name}“ und **alle erfassten Monatsstände (Barmittel und Lagerbestand)** dieses
> Kontos werden unwiderruflich gelöscht.

Keine weiteren Änderungen. Für das Deaktivieren gibt es keinen Hinweis, weil die Historie erhalten
bleibt.

---

### Responsive-Übersicht

| Bereich | Mobil < 640 px | Tablet 640–1024 px | Desktop > 1024 px |
|---|---|---|---|
| Abschnittskopf | Badge „Stand“ unter dem Titel (`flex-wrap`) | eine Zeile | eine Zeile |
| KPI-Karten | 1 Spalte | 2 Spalten | 4 Spalten |
| Diagramm | 260 px hoch, Legende oben umgebrochen | 300 px | 300 px |
| Monatstabelle | horizontal scrollbar in der Karte, Monat sticky, Filter volle Breite über der Tabelle | wie Mobil bis `md`, ab 768 px volle Tabelle | volle Tabelle, Filter rechts im Kopf |
| Eingabe | eine Karte pro Konto, Felder 2×2, Labels sichtbar, Summe als eigener Block | bis 767 px wie Mobil, ab `md` Tabellenraster | Tabellenraster, Labels `sr-only` |

Prüfbreiten: 375 px, 768 px, 1440 px. Bei 375 px gibt es keinen horizontalen Seiten-Scroll.
Felder sind mindestens 36 px hoch (`h-9`), die Touch-Fläche einschließlich Label reicht.

### Barrierefreiheit (WCAG 2.1 AA) — Zusammenfassung

- Jedes Eingabefeld hat ein echtes `Label` mit Konto + Feldname (sichtbar mobil, `sr-only` Desktop).
- Fehler: `aria-invalid` + `aria-describedby`. Rot ist nie der einzige Hinweis (Icon + Text).
- Status-Icons (Spinner, Haken) sind `aria-hidden`. Zusätzlich gibt es **eine** gemeinsame
  `sr-only`-Region `role="status" aria-live="polite"` pro Karte, die „{Konto}: {Feld}
  gespeichert“ bzw. „entfernt“ meldet.
- Fokusring nie entfernen. Tooltip-Trigger („2 von 3 Konten“) per Tastatur fokussierbar.
- Kontrast: Δ-Farben `green-700` / `red-600` auf `bg-card` erfüllen 4,5:1, im Dark Mode
  `green-400` / `red-400`.
- Diagramm mit `role="img"` + `aria-label`. Die Zahlen stehen zusätzlich vollständig in der Tabelle.

### Color & Spacing Tokens Used

- Flächen: `bg-card`, `bg-muted/50` (Summe mobil, Zeilen-Hover), `bg-background`
- Text: `text-foreground`, `text-muted-foreground`, `text-destructive`
- Rahmen: `border`, `border-border`, `border-destructive` (ungültig), `border-t` (Summe)
- Δ: `text-green-700 dark:text-green-400`, `text-red-600 dark:text-red-400`, `text-muted-foreground`
- Warn-Badge: `bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400`
- Diagramm: `#22c55e` (Barmittel, wie Trend), `#f59e0b` (Lager-EK), `#3b82f6` gestrichelt (Gesamtvermögen)
- Abstände: Abschnitte `space-y-6`, KPI-Raster `gap-4`, Karten-Inhalt `space-y-4`, Felder `gap-x-3`,
  Mobil-Kontokarte `p-4 space-y-3`, Label → Feld `space-y-1`
- Typografie: Abschnitt `text-lg font-medium`, Kartentitel `CardTitle` (Standard), KPI-Titel
  `text-sm font-medium text-muted-foreground`, KPI-Wert `text-2xl font-bold`, Spaltenköpfe
  `text-xs font-medium uppercase tracking-wide text-muted-foreground`

### Interaction Notes

- **Skeleton vs. Spinner:** Skeleton beim ersten Laden und bei „Erneut laden“. Spinner nur im
  Status-Slot eines Felds während des Speicherns.
- **Übergänge:** Status-Icon ein/aus `transition-opacity duration-200`. Δ-Werte und Summen
  ändern sich ohne Animation. Diagramm mit der Standard-Recharts-Animation, wie bestehend.
- **Nach dem Speichern** wird der lokale Lagerstand mit der Serverantwort ergänzt. Übersicht,
  KPIs und Diagramm sind beim Wechsel auf „Übersicht“ sofort aktuell, ohne Neuladen.
- **Monatswechsel mit offenem ungültigem Feld:** Der Entwurf wird verworfen (wie bei den
  Barmitteln). Kein Bestätigungsdialog, weil ungültige Werte nie gespeichert waren.
- **Toasts:** nur `toast.error` bei Server- oder Netzfehlern, keine Erfolgs-Toasts im Lager-Teil.
- **Icons (lucide-react, bereits im Projekt):** `Package`, `ArrowUpRight`, `ArrowDownRight`,
  `Minus`, `Loader2`, `Check`, `AlertCircle`, `RotateCw`.

## QA Test Results

**Date:** 2026-10-27
**Tester:** QA Agent
**Build:** PASS (`npx tsc --noEmit` sauber, `NODE_OPTIONS=--max-old-space-size=6144 npm run build` sauber, auch nach den QA-Fixes). `npm run lint` ist im Projekt bekannt kaputt (Next 16), das ist kein Feature-Bug.
**Datenbank:** Migration 152 war beim Test **nicht** eingespielt. Alles, was die echte Tabelle oder einen Login braucht, ist unten als „ausstehend: Live-Test nach Migration" markiert.
**Playwright:** PASS. 57 Browser-Checks auf einer temporären, öffentlichen Vorschau-Seite mit den echten Lager-Komponenten, Mock-Daten und einem Mock-API (Teil-Upsert simuliert). Dazu Breitenmessungen mit nachgebauter Dashboard-Sidebar (w-16 / w-64). Die Vorschau-Seite wurde danach gelöscht.
**Unit-Checks:** 82/82 PASS für die reinen Helfer in `src/lib/cashflow-inventory.ts` (Parser, Formatierer, Summen, Vergleichslogik, Merge, Barmittel-Summe). Dazu 20/20 PASS für das Zod-Schema der Route (1:1-Kopie) und 200.000 Zufallswerte für die Konsistenz von Parser und Zod-Regel „max. 2 Nachkommastellen".

### Acceptance Criteria
| # | Criterion | Status | Evidence |
|---|-----------|--------|----------|
| 1 | Karte „Lagerbestand — {Monat}" unter Barmittel, gleicher Monat | PASS | Code (`CashFlowEntry` rendert `InventoryEntryCard key={month} month={month}`), Playwright |
| 2 | Eine Zeile je aktivem Amazon-Konto nach `sort_order`, 4 Felder | PASS | Unit `inventoryEntryAccounts` (aktiv + Amazon, case-/space-insensitiv, sortiert), Playwright |
| 3 | Auto-Save je Feld beim Verlassen; leeres Feld löscht nur diesen Wert | PASS | Playwright: Request enthält genau 1 Feld; Leeren sendet `null`, andere Felder bleiben |
| 4 | Einheiten ganzzahlig ≥ 0; EUR max. 2 NK, deutsches Format | PASS | Unit: `1.234,56`, `12.50`, `1.234`, `1 234,56 €`, `4.120 Stk.` ok; `1,234`, `12,5` (Stk.), `1e5`, `0x10` abgelehnt |
| 5 | Nur Gewinn darf negativ sein | PASS | Unit + Zod (`-`, `−`, `–` erkannt; EK/Umsatz/Einheiten negativ → abgelehnt) |
| 6 | Ungültig → kein Request, Feldfehler; Zod gleiche Regeln | PASS | Playwright „12a" → kein Request, `aria-invalid`, Meldung + „Gespeichert bleibt: 4.120 Stk."; Zod 20/20 |
| 7 | Summenzeile live | PASS | Playwright: Tippen ändert Summe sofort (10.120 Stk.), Hinweis bei ungültigen Feldern |
| 8 | Hinweis ohne aktives Amazon-Konto | PASS | Playwright (Modus „noamazon") |
| 9 | Eigener Abschnitt „Lagerbestand" mit Überschrift | PASS | Code + Playwright (Separator, `h2#inventory-heading`) |
| 10 | 4 KPI-Karten, neuester Monat, Δ absolut + %, Vergleichsmonat | PASS | Playwright: 10.020 Stk., −1.085 Stk. „zu Aug '26", Badge „Stand: Oktober 2026" |
| 11 | Monatstabelle mit farbiger Δ, pro Konto per Filter | PASS | Playwright: Filter inkl. „· inaktiv", Kontoansicht korrekt; Pfeil-Icon von QA ergänzt (siehe Bugs) |
| 12 | Diagramm Barmittel vs. Lager-EK | PASS | Code + Playwright (aria-label mit Werten); `connectNulls={false}`, fehlend = `null` |
| 13 | Gesamtvermögen-Linie nur Anzeige, nur bei beiden Werten | PASS | Code (`net` nur wenn `c !== null && i !== null`), keine DB-Spalte, kein Schreibpfad |
| 14 | Barmittel-KPIs/-Charts/-Tabelle exakt wie vorher | PASS | `git diff`: `CashFlowOverview.tsx`, `lib/cashflow.ts`, Barmittel-/Konten-Routen unverändert; `months` in `CashFlowClient` unverändert (nur Barmittel-Monate); Unit: `cashTotalsByMonth` == Rechnung des Trend-Charts |
| 15 | Vergleichsmonat = letzter früherer Monat mit Wert, Label wenn kein Vormonat | PASS | Unit: Okt vs. Aug bei Lücke im Sep → `isGap`; Dez→Jan über Jahresgrenze → kein Label |
| 16 | Fehlender Wert ≠ 0 | PASS | Unit: Monat ohne Feldwert → `null`, nicht 0; reine Null-Zeilen erzeugen keinen Monat |
| 17 | Δ % „–" bei Vergleichswert 0 oder fehlend | PASS | Unit + Playwright (Gewinn 0 → „–") |
| 18 | Nur Admin/Manager (API + RLS), Staff 403 | PASS (Code) / ausstehend live | 401 ohne Login per curl verifiziert; 403-Pfad im Code (`checkManager`); RLS-Policies für alle 4 Operationen. **Ausstehend: Live-Test mit Staff-Login nach Migration** |

### Edge Cases
| Edge Case | Status | Evidence |
|-----------|--------|----------|
| Konto deaktiviert → nicht in Eingabe, Historie sichtbar | PASS | Playwright (inaktives Konto zählt in Aug-Summe, Filter „· inaktiv") |
| Konto gelöscht → Cascade + Hinweis im Lösch-Dialog | PASS (Code) / ausstehend live | `ON DELETE CASCADE`, Dialogtext geändert. **Ausstehend: Live-Test nach Migration** |
| Provider geändert → Eingabe ja/nein, Historie bleibt | PASS | Code (Filter „· kein Amazon mehr", POST lehnt Nicht-Amazon mit 400 ab) |
| Nur einige Konten → „2 von 3 Konten" | PASS | Playwright (Badge + Tooltip „Fehlt: …") |
| Barmittel ohne Lager (oder umgekehrt) → Lücke, Gesamtvermögen nur bei beiden | PASS | Code + Playwright-Daten (Jul nur Barmittel, Sep nur Umsatz) |
| Keine Lagerdaten → Leerzustand ohne 0-KPIs | PASS | Playwright (Modus „empty") |
| Gleichzeitiges Speichern | PASS (Mock) / ausstehend live | Playwright: EK (langsam) + Umsatz (schnell) parallel → beide bleiben. Server: Upsert-Payload enthält nur gesendete Spalten; Löschen nur mit `IS NULL`-Bedingungen (atomar). **Ausstehend: Live-Test gegen PostgREST nach Migration** |
| Alle 4 Felder leer → Zeile weg | PASS (Mock) / ausstehend live | Playwright: 4× `null` → `removed:true`, Übersicht ohne Neuladen aktualisiert |
| Sehr große Zahlen | PASS | Unit/Zod: 999.999.999,99 € und 99.999.999 Stk. erlaubt, +0,01 abgelehnt; DB-CHECKs identisch |

### UI/Design Checks
| Check | Status | Notes |
|-------|--------|-------|
| Mobile 375px | PASS (nach Fix) | Felder jetzt einspaltig bis `sm`, Werte vollständig lesbar (155 px bei eingeklappter Sidebar). Lager-Teile ohne horizontalen Überlauf |
| Tablet 768px / 1024px | PASS (nach Fix) | Vorher lief das Desktop-Raster über die Karte hinaus (siehe Bugs) |
| Desktop 1280/1440px | PASS | Tabellenraster, Labels `sr-only`, kein Überlauf |
| No console errors | PASS | 375/768/1440 ohne Fehler |
| Loading states | PASS | Skeletons mit `aria-busy` in Übersicht und Eingabe |
| Error states | PASS | Isoliert: Lager-Alert „Die Barmittel sind davon nicht betroffen" + „Erneut laden" (lädt nur Lager); Eingabe ohne Felder. Serverfehler am Feld + Toast, 400-Meldung aus API |
| Empty states | PASS | Leerzustand mit Hinweis auf Tab „Eingabe" bzw. „Konten" |
| Tastatur | PASS | Enter speichert (kein Doppel-Request beim Blur), Escape stellt Wert wieder her |

### Security Audit
| Check | Status | Notes |
|-------|--------|-------|
| Auth check on all routes | PASS | GET + POST starten mit `checkManager()`; `requireManager()` und bestehende Routen unverändert |
| Unauthenticated → 401 | PASS | curl gegen Production-Build: GET/POST → 401 `Nicht autorisiert`, auch mit gefälschtem Cookie; PUT/DELETE → 405 |
| Staff → 403 | ausstehend live | Code korrekt (`maybeSingle`, Rolle ≠ admin/manager → 403) |
| Zod validation | PASS | UUID, Monat-Regex (Monat 01–12), `int`, Min/Max, `finite`, 2 NK, mind. 1 Feld; unbekannte Felder werden ignoriert; String-Zahlen abgelehnt |
| RLS enabled | PASS | `ENABLE ROW LEVEL SECURITY`, getrennte Policies SELECT/INSERT/UPDATE/DELETE `TO authenticated` mit `is_admin_or_manager()` (SECURITY DEFINER aus 041); anon hat keinen Zugriff |
| Service role | PASS | Nur serverseitig nach Rollenprüfung (wie `balances`); Trigger-Funktion ohne SECURITY DEFINER, `search_path` gesetzt |
| Injection über from/to | PASS | Regex-Validierung vor der Query (`2026-10&or=(id.gt.0)` → 400), danach normalisiert auf `YYYY-MM-01`, Werte von supabase-js parametrisiert |
| Konto-Missbrauch | PASS | POST prüft Existenz (404) und Provider Amazon (400); FK-Fehler → 404, CHECK-Fehler → 400 |
| No hardcoded secrets | PASS | Keine Keys in neuen/geänderten Dateien |
| `.limit()` | PASS | GET `limit(5000)` |

### Bugs Found
| Severity | Description | Location | Steps to Reproduce | Status |
|----------|-------------|----------|--------------------|--------|
| Medium | Das Desktop-Raster der Lager-Eingabe (Breakpoint `md`, Mindestbreite ca. 736 px) lief neben der immer sichtbaren Sidebar über die Karte hinaus: bei 768 px um 105–297 px, bei 1024 px mit ausgeklappter Sidebar um 57 px. Auf 375 px waren die Felder im 2×2-Raster nur ca. 60 px breit, „18.400,00" war abgeschnitten. Die Barmittel-Karte hat bei 768/1024 px keinen Überlauf | `InventoryEntryCard.tsx`, `InventoryEntryRow.tsx` | Tab „Eingabe" bei 768 px Breite öffnen | **Behoben:** Raster-Breakpoint `md` → `xl`; Mobil-Felder `grid-cols-1 sm:grid-cols-2` |
| Low | Monatstabelle: Δ ohne Pfeil-Icon (UI-Regel „Farbe nie allein: Vorzeichen + Pfeil") | `InventoryMonthTable.tsx` | Übersicht → Monatsvergleich | **Behoben:** `DeltaIcon` ergänzt; Kopf mit Filter bricht erst ab `lg` in eine Zeile um (vorher 11 px Überlauf bei 768 px) |
| Low | Race: Feld speichert gerade Wert X, Nutzer tippt den alten gespeicherten Wert zurück und verlässt das Feld → kein Request, danach gewinnt X | `InventoryEntryCard.tsx` `handleCommit` | Wert ändern, Blur, sofort zurücksetzen und Blur bei langsamer Verbindung | **Behoben:** „unverändert" wird nur übersprungen, wenn kein Request für das Feld läuft |
| Low | Sehr lange KPI-Werte (≥ 1 Mrd. €) verbreiterten auf 375 px die KPI-Spalte (14 px Überlauf) | `InventoryKpiCards.tsx` | Summe EK > 1 Mrd. € | **Behoben:** `min-w-0` + `break-words` |
| Low | Migration 152: `CREATE POLICY` ohne `DROP POLICY IF EXISTS`, ein zweiter Lauf bricht an den Policies ab (Tabelle/Trigger sind idempotent) | `152_cashflow_inventory.sql` | Migration zweimal ausführen | Offen. Bewusst nicht geändert, weil der User die Migration gerade einspielt |
| Low (bestehend) | Die Dashboard-Sidebar ist auch auf dem Handy immer sichtbar (w-64 / w-16). Bei 375 px laufen deshalb auch Barmittel-Teile über (53 px bei eingeklappter Sidebar), mit ausgeklappter Sidebar ist jeder Tab kaum bedienbar | `DashboardSidebar.tsx` (nicht Teil dieses Features) | Dashboard bei 375 px öffnen | Offen, nicht durch dieses Feature verursacht |
| Info | Werte mit 14 Zeichen („999.999.999,99") sind im 375-px-Feld minimal abgeschnitten (155/171 px, nur bei eingeklappter Sidebar) | Eingabefeld | — | Akzeptiert, Grenzwert |

**Summe:** Critical 0, High 0, Medium 1 (behoben), Low 5 (4 behoben, 1 offen) + 1 bestehendes Low außerhalb des Features.

### Ausstehend: Live-Test nach Migration 152
1. Als Admin/Manager: Werte eintragen, Seite neu laden → Werte bleiben (NUMERIC-Rückgabe korrekt normalisiert).
2. Zwei Felder desselben Kontos/Monats schnell nacheinander speichern → beide in der DB.
3. Alle vier Felder leeren → Zeile in `cash_inventory` weg, Antwort `removed:true`.
4. Staff-Login: `GET`/`POST /api/cashflow/inventory` → 403 ohne Daten.
5. POST für Nicht-Amazon-Konto → 400; unbekannte Konto-ID → 404; 3 Nachkommastellen / units 1,5 / EK −1 → 400.
6. Konto im Tab „Konten" löschen → Lagerzeilen per Cascade weg.
7. Bis zum Einspielen: GET liefert 500 → nur der Lager-Abschnitt zeigt den Fehler, Barmittel bleiben nutzbar (isoliert, im Mock geprüft).

### Decision
**APPROVED** ✅. Keine Critical- oder High-Bugs. Bereit für das Deployment, sobald die Migration 152 eingespielt ist. Danach die Live-Tests oben durchführen.

## Deployment

**Production URL:** https://dashboard.primehubgbr.com/dashboard/cashflow
**Deployed:** 2026-10-27
**Build:** ✅ Ready (lokal `next build` mit `NODE_OPTIONS=--max-old-space-size=6144` grün; Vercel-Auto-Deploy nach `git push origin main`, Commit `2519444`, live ca. 1 Min. nach dem Push)
**Vercel Deployment:** Git-Integration (Vercel CLI auf dem Rechner nicht eingeloggt, deshalb keine Deployment-ID; Nachweis über die neue Route)
**Datenbank:** Migration 152 (`cash_inventory`) vorab in Produktion eingespielt und geprüft (RLS, 4 Policies, Trigger)

### Prüfung nach dem Deploy
| Check | Ergebnis |
|---|---|
| `GET /api/cashflow/inventory` ohne Login | 401 `{"error":"Nicht autorisiert"}` (vor dem Deploy 404) |
| `POST /api/cashflow/inventory` ohne Login | 401 |
| `/dashboard/cashflow` ohne Login | 307 → Login-Seite `/` (200) |
| `/api/cashflow/accounts` ohne Login | 401 (unverändert) |

### Offen für den User (mit eigenem Login)
Live-Tests 1–6 aus „Ausstehend: Live-Test nach Migration 152“ (Speichern + Reload, parallele Felder, Zeile löschen, Staff → 403, 400/404-Fälle, Cascade beim Konto-Löschen).
