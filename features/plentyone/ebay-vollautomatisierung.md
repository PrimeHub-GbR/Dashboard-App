# eBay-Vollautomatisierung über PlentyONE

**Status:** In Progress
**Tab:** PlentyONE-Migration `/dashboard/plentyone`
**Zugriff:** Admin + Manager
**Quelle:** Spezifikation vom 03.09.2026 (Live-System verifiziert 25.08.–03.09.2026)
**Verwandt:** [overview.md](overview.md) — der Amazon→PlentyONE-Lauf, auf dem diese Kette aufsetzt

---

## 1. Ziel

Ein **wiederkehrender Durchlauf alle zwei Wochen**, der neue Amazon-Bücher ohne Nacharbeit als
vollständige eBay-Listings in PlentyONE anlegt:

> Amazon-Export hochladen → PlentyONE bekommt Artikel + VLB-Eigenschaften + Cover →
> eBay-Listing entsteht komplett (Kategorie, Layout, Versand, MwSt, Merkmale,
> Preis = Buchpreisbindung) → Prüfung besteht → der Nutzer sieht nur einen Statusbericht.

**Bewusste Abweichung von der Ursprungsspezifikation:** Die Amazon-SP-API wird **nicht**
angebunden. Der Nutzer zieht den Bericht selbst aus Seller Central und lädt ihn im Dashboard
hoch — das ist der einzige geplante Handgriff. Alles danach läuft ohne Eingriff.
Der Massenstart der Bestandsbücher (~2.000) läuft über dieselbe Pipeline, nach Sichtung.

**Harte Rahmenbedingung (rechtlich):** eBay-Preis = gebundener Ladenpreis (Buchpreisbindung,
aus VLB importiert, Verkaufspreis-ID 7). Kein Preisvorschlag / Best Offer. Ein Listing ohne
gültigen Buchpreisbindungspreis darf nie live gehen.

**Zweite harte Regel:** PlentyONE/n8n schreibt **niemals** zu Amazon (Preise, Artikeldaten,
Bestand). Amazon läuft autark mit externem Repricer; von Amazon wird nur gelesen.

---

## 2. Bestehendes Setup (IST) — verifiziert

### 2.1 Systeme

| System | Details |
|---|---|
| PlentyONE | Backend `https://p74746.my.plentysystems.com`; REST-Benutzer „Tempnutzer" (Zugangsdaten nur im n8n-Knoten „Konfiguration", nie im Repo) |
| eBay | Konto `primehub_gbr`, per OAuth2 (production) in PlentyONE verbunden; Auth'n'Auth nicht freigeschaltet (kein Blocker) |
| n8n | `https://n8n.primehubgbr.com` (v1.121); MCP-Connector aktiv, für Claude nur lesend (`.claude/rules/n8n-first.md`) |
| Frontend | Dieses Dashboard, Tab `/dashboard/plentyone` |
| Amazon | Merchant-ID A3I46KBTF984WB; 2.023 Bücher (ABIS_BOOK) + 25 Nicht-Bücher; ausschließlich FBA |
| VLB | API über n8n; **max. 2 gleichzeitige Sessions** — Logout muss auch im Fehlerfall laufen |

### 2.2 PlentyONE-Konstanten (live verifiziert)

| Konstante | Wert |
|---|---|
| MarketID eBay Deutschland | **1008** (referrerId 2.08) |
| eBay-Konto (UserID / credentialsId) | **10** = primehub_gbr |
| TypeID Festpreis | **2** |
| StockDependenceTypeID | **1** = beschränkt (mit Reservierung) |
| UnitCombinationID | **1** |
| Verzeichnis (DirectoryID) | **1** = „Bücher" |
| eBay-Kategorie Bücher | **261186** (Bücher & Zeitschriften » Bücher) |
| Verkaufspreis Buchpreisbindung | **ID 7** (extern „fixed book prices") |
| eBay-Layout „Bücher" | **ID 1** |
| Versandprofile | „Bücher DE" (in der Vorlage) · „Standardpaket" ID 6 |
| Lager | **ID 2** „Amazon FBA-Lager BuchDepot24" (Lagertyp noch „Reparatur" → offener Punkt) |
| Kategorie (plenty) | „Books" **ID 77** |
| Eigenschaften „VLB Buchdaten" | 10 Autor · 11 Erscheinungsdatum · 12 Sprache · 13 Seitenzahl · 14 Bindung · 15 Warengruppe · 16 Thema; Verlag über Systemfeld **Hersteller** |
| Variantennummern-Schema | `<PREFIX>-<nr>-<tt-mm-jjjj>` — **korrigiert:** der Prefix ist nicht immer `APR-`, siehe 2.9 |
| Dateimanager-CDN | `https://cdn02.plentyone.com/lwk1xvxv9m6a/frontend/<ordner>/<datei>`, Cover-Ordner „cover", Dateiname = ISBN13 |
| Testdaten | Artikel 186–197 (Varianten 1145–1156); 21 Artikel im System; 6 eBay-Listings (MLID 1–6) fertig geprüft, **nicht gestartet** |

### 2.3 eBay-Kanaleinstellungen

- „Produktdetails aus dem eBay-Katalog hinzufügen" = **Ja** → eBay zieht per ISBN/EAN
  Katalogdaten; Bücher mit Katalogtreffer brauchen keine manuellen Merkmale.
- Bestandsautomatik = **Nein**; Menge je Listing = 1.

### 2.4 Stapelverarbeitungs-Vorlage „Bücher (1)"

Setzt je Listing: Festpreis · Deutschland / `primehub_gbr` · Kategorie 261186 · Versandprofil
„Bücher DE" · Zustand Neu · GTC · Verzeichnis „Bücher" · Layout „Bücher" · Lager FBA (ID 2) ·
MwSt 7 % · Sprache Deutsch · Name/Beschreibung vom Artikel (Name 1) ·
**An Artikelpreis binden = Ja mit Preis-ID 7** · Preisvorschlag Nein · UVP Nein · Freischalten Ja.

### 2.5 Import-Definitionen (Typ „Market-Listing", fertig gemappt)

**Import 23 „eBay-Listings anlegen (Bücher)"** — legt je Zeile Listing + Market-Listing an.
Option „Nur neue Daten importieren", keine Kennung. CSV (Tab-getrennt):

```
ItemID	MarketID	UserID	TypeID	StockDependenceTypeID	UnitCombinationID	DirectoryID	Enabled	Duration
188	1008	10	2	1	1	1	Y	GTC
```

**Import 22 „eBay-Merkmale Bücher"** — Kennung/Abgleich: Spalte `MLID` → Market-Listing-ID.

```
MLID	Name	Wert
4	Autor,Buchtitel,Sprache	Tibor Rode,Lupus: Alles Böse kehrt zurück. Thriller,Deutsch
```

**Format-Regeln (empirisch ermittelt — VERBINDLICH):**
1. **Eine Zeile pro MLID** — jede Zeile ersetzt den KOMPLETTEN Merkmalsatz des Listings.
2. Mehrere Merkmale **kommagetrennt in EINER Zelle** (Name- und Wert-Spalte parallel).
3. **Werte müssen kommafrei sein** — der Parser trennt an JEDEM Komma, Anführungszeichen
   schützen nicht. Autor `Nachname, Vorname` → `Vorname Nachname`, Mehrautoren mit `; `.
4. **Buchtitel ≤ 65 Zeichen** (eBay-Fehler 21919303/21919308) — an Wortgrenze kürzen,
   Trennzeichen-Reste am Ende strippen.
5. Datenquelle wahlweise **CSV-Upload ODER „HTTPS / URL"**, mit **Zeitplan** —
   das ist die Grundlage der Vollautomatik.

### 2.6 PlentyONE REST-API (getestet)

- `POST /rest/login` mit `{username, password}` → `accessToken` (Bearer, 86.400 s).
- `GET /rest/items?with=texts` → Titel in `texts[].name1` (lang `de`).
  ⚠️ `with=itemTexts` wirft 500 „undefined relationship".
- `GET /rest/items/variations` → `id`, `itemId`, `number`, `isMain`.
- `GET /rest/listings` → `{id, itemId, unitCombinationId, typeId, stockDependenceTypeId}`.
- `GET /rest/listings/markets` → **MLID** = `id`, dazu `listingId, referrerId, variationId,
  enabled, duration, quantity` und **`verified`** (`succeeded` / `failed`) →
  **Prüfstatus ist per REST auslesbar**.
- `GET /rest/v2/properties/relations?with=values` → Autor = `propertyId 10`,
  `targetId` = variationId, Wert in `values[0].value`.
- Pagination überall: `page`, `itemsPerPage` (250), Abbruch bei `isLastPage`.
- Batch-Aktionen der neuen Oberfläche (Vorlage anwenden / Prüfen / Starten) haben interne
  REST-Endpunkte, die **noch nicht identifiziert** sind → Netzwerk-Mitschnitt beim nächsten Lauf.

### 2.7 n8n-Bestand

| Workflow | Rolle |
|---|---|
| `plentyone-metadata` (Dashboard) | Amazon-Export → VLB-Anreicherung → `plentyONE_Import_final.csv` + `plentyONE_Eigenschaften.csv` → Supabase → Callback |
| `plentyone-cover` (Dashboard) | Amazon-Export → Cover → ZIP-Pakete à 250 → Supabase → Callback |
| `eBay-Dateien bauen` (`FFiDVkcDnmb1QlSn`) | liest PlentyONE per REST, baut `ebay_listing_erstellung.csv` (Import 23) + `ebay_merkmale.csv` (Import 22) + `zusammenfassung.txt` |

Testlauf 03.09.2026: 21 Artikel → 5 Zeilen Import 23 (Artikel 189, 191–194) ·
6 Zeilen Import 22 (MLID 1–6) · 0 übersprungen.

### 2.8 Bisheriger Ablauf (End-to-End an Artikel 188 bewiesen)

| # | Schritt | Ort | nach dieser Ausbaustufe |
|---|---|---|---|
| 1 | Amazon-Bericht ziehen | Seller Central | **bleibt manuell (so gewollt)** |
| 2 | Bericht hochladen, Lauf starten | Dashboard | **bleibt manuell (so gewollt)** |
| 3 | Cover in Ordner „cover" hochladen | Dateimanager | entfällt (Bild-URL-Import) |
| 4 | Artikel-CSV, dann Eigenschaften-CSV importieren | Daten » Import | automatisch (URL + Zeitplan) |
| 5 | WF3 ausführen (1. Lauf) | n8n | entfällt (Berechnung beim Abruf) |
| 6 | `ebay_listing_erstellung.csv` → Import 23 | Daten » Import | automatisch (URL + Zeitplan) |
| 7 | Vorlage „Bücher (1)" ausführen | Stapelverarbeitung | manuell bis Stufe 2 |
| 8 | WF3 erneut (MLIDs existieren erst jetzt) | n8n | entfällt (Berechnung beim Abruf) |
| 9 | `ebay_merkmale.csv` → Import 22 | Daten » Import | automatisch (URL + Zeitplan) |
| 10 | „Market-Listings prüfen" → Fehlgeschlagen = 0 | Stapelverarbeitung | Bericht automatisch, Klick bis Stufe 2 |
| 11 | Sichtung | Nutzer | Bericht im Dashboard |
| 12 | „Listings starten" (verteilt auf X Minuten) | Stapelverarbeitung | bleibt manuell (Freigabe, AK9) |

### 2.9 Korrekturen aus dem Selbsttest (03.09.2026)

Getestet gegen den echten Amazon-Export `BerichtzuallenAngeboten_08192026.txt`
(2.048 Zeilen, 926 aktiv) mit 20 aktiven Zeilen quer über alle SKU-Präfixe.

**K1 — Der „APR-"-Filter hätte über die Hälfte des Sortiments liegen lassen.**
Die Variantennummer ist die Amazon-`seller-sku`. Im Bestand kommen zehn Präfixe vor:

| Prefix | Zeilen gesamt | davon aktiv |
|---|---|---|
| APR | 901 | 408 |
| MAR | 566 | 180 |
| PH | 234 | 143 |
| FE | 92 | 57 |
| BL | 71 | 56 |
| JA | 69 | 37 |
| SC | 58 | 28 |
| SM | 31 | 10 |
| MB | 25 | 7 |
| MAE | 1 | 0 |

Nur 44 % tragen `APR-`. Ein Prefix-Filter hätte 1.147 Bücher stumm übersprungen —
das verletzt AK11 und AK6. **Neue Regel:** Buch-Artikel ist, wessen Variantennummer
dem Migrationsmuster `^[A-Z]{2,4}-.+-[0-9]{2}-[0-9]{2}-[0-9]{4}$` entspricht.
Alle 2.048 Zeilen erfüllen es, manuell angelegte Artikel nicht.
`variantenPrefix` bleibt als optionale Zusatzeinschränkung für Testläufe (Standard: leer).

**K2 — Das 65-Zeichen-Limit gilt für jeden Merkmalswert, nicht nur den Titel.**
Sammelbände sprengen das Autorenfeld: „Myrrhe, Mord und Marzipan" hat 26 Autoren
(~500 Zeichen), ein Lindgren-Sammelband 19. Der Autor wird jetzt genauso gekappt —
und zwar an der Autorengrenze, damit lieber zwei vollständige Namen dastehen als ein
abgeschnittener. Zusätzlich sind ` and ` und ` & ` als Autorentrenner ergänzt
(vorher nur `;`), sonst wurde aus „Besser, Jen; Feste, Shana and Längsfeld, Sabine"
das unleserliche „Jen Besser; Feste Shana and Längsfeld Sabine" statt
„Jen Besser; Shana Feste; Sabine Längsfeld".

**Bestätigt:** Nicht-Bücher fallen bereits in der Aufbereitung heraus — die
Aloe-Lips-Nahrungsergänzung (`JA-0002`, ASIN `B01CJSK2BC`) wurde ohne gültige ISBN-10
verworfen (E11).

---

## 3. Tech Design — Umsetzung im Dashboard

### 3.1 Prinzip

**PlentyONE holt sich alles selbst ab.** Das Dashboard stellt jede Datei unter einer festen,
tokengeschützten URL bereit; die vier PlentyONE-Importe stehen auf „HTTPS/URL" mit Zeitplan
und ziehen gestaffelt. n8n rechnet, das Dashboard verwaltet Freigabe und Bericht.

```
Upload (.txt) im Dashboard  ->  POST /api/plentyone/runs
                                  |-> n8n plentyone-metadata -> Artikel-CSV + Eigenschaften-CSV
                                  '-> n8n plentyone-cover    -> Cover-ZIPs + Einzelbilder

feste Abhol-URLs am Dashboard (Token in der URL):
  /api/plentyone/export/artikel.csv          letzter freigegebener Lauf
  /api/plentyone/export/eigenschaften.csv    letzter freigegebener Lauf
  /api/plentyone/export/ebay-listings.csv    frisch aus n8n (Import 23)
  /api/plentyone/export/ebay-merkmale.csv    frisch aus n8n (Import 22)

PlentyONE-Zeitplaene (gestaffelt, taeglich):
  02:00 Artikel · 02:30 Eigenschaften · 03:00 Import 23 · 03:30 Vorlage* · 04:00 Import 22
n8n "eBay-Kontrolle" 05:00 -> verified + Preis-Guard -> POST /api/plentyone/ebay/bericht
Dashboard zeigt den Bericht · Start bleibt hinter der Freigabe.
                                                   * bis Stufe 2 zwei Klicks
```

### 3.2 Warum Abhol-URLs statt Push

- Die Import-Definitionen 22/23 und der Artikelimport sind **fertig gemappt und erprobt** —
  ein Umbau auf direkte REST-Anlage würde funktionierende Konfiguration wegwerfen.
- Ein Abruf **rechnet frisch**: Import 23 sieht nur Artikel ohne Listing, Import 22 nur
  existierende MLIDs. Damit löst sich das Zwei-Lauf-Problem (E13) von selbst.
- Alles ist beliebig oft wiederholbar (Idempotenz, AK5), auch wenn ein Zeitplan doppelt läuft.

### 3.3 Export-Fenster (verhindert nächtliches Überschreiben)

Artikel- und Eigenschaften-CSV werden nur ausgeliefert, solange der Lauf **freigegeben** ist:
`export_freigabe = true` und `created_at` jünger als 7 Tage. Danach liefert die URL nur die
Kopfzeile — der Import läuft ins Leere statt gepflegte PlentyONE-Daten zu überschreiben.
Der Schalter ist im Dashboard je Lauf sichtbar und umlegbar.
Die beiden eBay-CSVs haben kein Fenster: sie sind konstruktionsbedingt idempotent.

### 3.4 API

| Route | Auth | Zweck |
|---|---|---|
| `GET /api/plentyone/export/[datei]` | Token (`PLENTYONE_EXPORT_TOKEN`, Query `t` oder Bearer) | liefert `artikel.csv`, `eigenschaften.csv`, `ebay-listings.csv`, `ebay-merkmale.csv` als `text/csv` |
| `POST /api/plentyone/ebay/bericht` | Token | n8n meldet Prüfergebnis + Preis-Guard |
| `GET /api/plentyone/ebay/bericht` | Session (admin/manager) | letzter Bericht für die Anzeige |
| `PATCH /api/plentyone/runs/[id]` | Session (admin/manager) | Export-Freigabe an/aus |

Die beiden eBay-CSV-Abrufe **proxen** die n8n-Webhooks (`ebay-listings`, `ebay-merkmale`) mit
Header-Auth. So bleibt der n8n-Token serverseitig und E21 (offener Webhook) ist erledigt.

### 3.5 Datenmodell (Migration 139)

`plentyone_runs` bekommt:

| Spalte | Typ | Inhalt |
|---|---|---|
| `export_freigabe` | boolean | Standard `true`; abschalten stoppt die Abholung |
| `export_abrufe` | integer | Zähler, wie oft PlentyONE geholt hat |
| `export_zuletzt` | timestamptz | letzter Abruf — zeigt, ob der Zeitplan wirklich läuft |

Neue Tabelle `plentyone_ebay_berichte`:

| Spalte | Typ | Inhalt |
|---|---|---|
| `id` / `erstellt_at` | uuid / timestamptz | Bericht |
| `zahlen` | jsonb | `{artikel, ohne_listing, listings, geprueft_ok, geprueft_fehler, merkmale, ohne_bpb_preis}` |
| `probleme` | jsonb | `[{mlid, item_id, titel, grund}]` — fehlgeschlagene Prüfung |
| `uebersprungen` | jsonb | `[{mlid, item_id, grund}]` — fehlender Autor/Titel/Preis |
| `ok` | boolean | Prüfung vollständig grün |

Aufbewahrung: die letzten 20 Berichte, RLS wie bei `plentyone_runs` (lesen admin/manager,
schreiben nur Service-Role).

### 3.6 Umsetzungsstufen

- **Stufe 1 (diese Ausbaustufe):** Abhol-URLs + Export-Fenster + Bericht + gestaffelte
  Zeitpläne. Danach bleiben Amazon-Export, Upload und zwei Klicks auf die Vorlage.
- **Stufe 2 (ein beobachteter Lauf nötig):** Batch-REST-Calls der Oberfläche mitschneiden
  (Vorlage anwenden / Prüfen / Starten) und in n8n nachbauen → Schritt 7 und 10 ohne Klicks.
- **Stufe 3 (bewusst gestrichen):** Amazon-SP-API. Der Export bleibt Handarbeit alle 2 Wochen.

---

## 4. Entscheidungslog (verbindlich)

| Entscheidung | Inhalt |
|---|---|
| Preis | eBay-Preis = Buchpreisbindungspreis (ID 7), „An Artikelpreis binden = Ja" → VLB-Preisänderung zieht automatisch durch; Preisvorschlag Nein, UVP Nein |
| Amazon | autark (externer Repricer); PlentyONE/n8n liest nur; **keine SP-API** — Export per Hand alle 2 Wochen |
| Fulfillment | ausschließlich FBA; später Amazon MCF für eBay-Aufträge; FBA-Bestand nur lesen |
| Go-Live | nur nach expliziter Freigabe; Massenstart „verteilt auf X Minuten" |
| Rollout-Modus | alles vorbereiten, Nutzer sichtet, dann Massen-Push |
| Artikel-Identifikation | Buch-Artikel = Variantennummer nach Migrationsmuster (nicht nur „APR-", siehe 2.9), Hauptvariante zählt |
| Import-Architektur | Import 23 (Listings) + Vorlage „Bücher (1)" + Import 22 (Merkmale); Abholung per URL statt Upload |
| Merkmal-Quelle | eBay-Katalog (ISBN-Treffer) zuerst; Import 22 deckt Nicht-Treffer ab |
| Nicht-Bücher | fallen schon in der Aufbereitung raus: ohne gültige ISBN-10 in `product-id` keine Zeile — die 25 Nicht-Bücher und 11 B-ASINs erreichen PlentyONE nie (E11 erledigt) |
| Cover | Bild-URL-Import über den Dateimanager-Ordner „cover"; Umstellung auf Dashboard-URLs ist vorbereitet, aber erst nach Klärung der VLB-Rechte (E20) sinnvoll |
| Sicherheit | Zugangsdaten pflegt der Nutzer in n8n bzw. in den Vercel-Env-Variablen; nie im Repo |

## 5. Edge Cases

| # | Fall | Sollverhalten |
|---|---|---|
| E1 | Buch ohne eBay-Katalog-Treffer | Merkmale Autor/Buchtitel/Sprache aus Import 22, sonst eBay-Fehler 21919303 |
| E2 | Buch mit Katalog-Treffer | eBay befüllt selbst und sortiert ggf. feiner ein (Warnung 21917164) — gewollt |
| E3 | Autor oder Titel fehlt | Zeile NICHT erzeugen, im Bericht unter „übersprungen" ausweisen |
| E4 | **Merkmalswert** > 65 Zeichen | gilt für Titel UND Autor: an Wortgrenze kürzen (Schnittfenster ≥ Pos. 30), Trennzeichen-Reste strippen; beim Autor an der Autorengrenze schneiden (K2) |
| E5 | Kommas/Tabs in Autor/Titel | entfernen — der Import trennt an JEDEM Komma, Quotes schützen nicht |
| E6 | „Nachname, Vorname" / Mehrautoren | → „Vorname Nachname", Trenner `;`, ` and `, ` & `, Ausgabe mit „; "; sonst Rohwert kommafrei |
| E7 | Mehrere Merkmalzeilen pro MLID | VERBOTEN — jede Zeile ersetzt den kompletten Satz |
| E8 | Artikel hat bereits ein Listing | taucht nicht in der Import-23-CSV auf → keine Duplikate |
| E9 | Artikel ohne Migrations-Variantennummer | ignorieren — geprüft wird das Muster, nicht der Prefix (K1) |
| E10 | **Artikel ohne Buchpreisbindungspreis (ID 7)** | darf NIE live gehen; der Preis-Guard lässt diese Artikel gar nicht erst in die Import-23-CSV und benennt sie im Bericht |
| E11 | **Nicht-Buch-Artikel** | erreichen PlentyONE nicht (ISBN-10-Gate der Aufbereitung, im Test bestätigt); zusätzlich schützt das Variantennummern-Muster |
| E12 | Listing ohne angewendete Vorlage | Reihenfolge strikt: Import 23 → Vorlage → Import 22 → Prüfen; Zeitpläne entsprechend gestaffelt |
| E13 | MLID entsteht erst nach Listing-Anlage | Merkmale-CSV wird beim Abruf frisch berechnet |
| E14 | VLB-Token nicht abgemeldet | Logout in jedem Ausgang; max. 2 Sessions |
| E15 | FBA-Bestand 0 | Bestandsabhängigkeit „beschränkt (mit Reservierung)", Menge 1 |
| E16 | VLB-Preisänderung bei laufendem Listing | zieht automatisch durch (Bindung an Artikelpreis) |
| E17 | Massenstart ~2.000 Listings | „verteilt auf X Minuten", nicht alles auf einmal |
| E18 | Überlappende Zeitpläne | Abstände von 30 Minuten; Läufe sind idempotent |
| E19 | Amazon-Bericht ohne Produktdaten | erwartet — VLB ist die Datenquelle |
| E20 | Cover-Rechte für eBay | VLB-Sondergenehmigung steht aus — vor dem Massen-Live-Gang klären |
| E21 | Offener n8n-Webhook | Header-Auth; das Dashboard proxt, der Token bleibt serverseitig |
| E22 | Zeitplan zieht eine alte CSV erneut | Export-Fenster: nach 7 Tagen bzw. nach Abschalten der Freigabe nur noch die Kopfzeile |

## 6. Akzeptanzkriterien

- **AK1 — Durchlauf:** Nach dem Upload entstehen ohne weiteren Eingriff Artikel, Eigenschaften,
  Cover und geprüfte eBay-Listings. Verbleibende Handgriffe: Amazon-Export, Upload,
  Vorlage-Klick (bis Stufe 2), Freigabe zum Start.
- **AK2 — Vollständigkeit:** Jedes Listing hat Kategorie, Layout „Bücher", Versandprofil
  „Bücher DE", Zustand Neu, GTC, MwSt 7 %, Verzeichnis „Bücher", Preis aus ID 7 mit
  Artikelpreis-Bindung, Preisvorschlag aus, und bei Nicht-Katalog-Treffern die Merkmale.
- **AK3 — Prüfung grün:** `verified = succeeded` für alle neuen Listings; Fehlschläge stehen
  mit MLID, Artikel und Grund im Bericht.
- **AK4 — Buchpreisbindung:** kein Listing ohne positiven Preis aus ID 7.
- **AK5 — Idempotenz:** wiederholte Läufe erzeugen keine Duplikate.
- **AK6 — Kein stiller Datenverlust:** jedes übersprungene Buch wird gezählt und benannt.
- **AK7 — Bericht:** nach jedem Zyklus eine Zusammenfassung im Dashboard.
- **AK8 — Amazon unangetastet:** keine schreibenden Amazon-Aufrufe.
- **AK9 — Start-Schalter:** Live-Start nur manuell, Massenstart verteilt.
- **AK10 — Secrets:** keine Zugangsdaten in Repo/Logs; VLB-Logout garantiert.
- **AK11 — Rollout:** alle ~2.000 Bestandsbücher über dieselbe Pipeline.

## 7. Offene Punkte

1. **Vollimport ausstehend** — erst 21 von ~2.023 Artikeln in PlentyONE.
2. **Batch-Endpoints unbekannt** — „Vorlage ausführen", „Prüfen", „Starten" beim nächsten
   UI-Lauf per Netzwerk-Mitschnitt erfassen (Stufe 2).
3. **Lager ID 2** von Lagertyp „Reparatur" auf „Vertrieb" umstellen.
4. **Bestandsautomatik / MCF** — aktuell Menge 1, Automatik aus; Folgeprojekt.
5. **VLB-Cover-Genehmigung (E20)** vor dem Massenstart klären.
6. **Auth'n'Auth** bei eBay nicht freigeschaltet — bisher kein Blocker.
7. Danach: Kaufland nach demselben Muster.
