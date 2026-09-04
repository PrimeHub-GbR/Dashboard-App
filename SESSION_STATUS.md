# Session-Status (Stand: 04.09.2026, ca. 04:00 Uhr)

## Auftrag & Ziel

Die beigelegte Spezifikation „eBay-Vollautomatisierung über PlentyONE" ins Projekt
aufnehmen, die PRD auf den tatsächlichen Stand bringen und prüfen, welche Features
inzwischen ins Dashboard mitgewandert sind. Danach: **die Kette so weit wie möglich
automatisieren.**

Zielbild des Nutzers: Er zieht den Amazon-Export selbst aus Seller Central (**bewusst
ohne SP-API**), lädt ihn im Dashboard hoch — und danach entstehen ohne weiteren
Eingriff vollständige, prüfbereite eBay-Listings in PlentyONE. Der Live-Start bleibt
absichtlich manuell. Rhythmus: alle zwei Wochen.

---

## Verlauf (Historie)

### 1. Dokumentation (erledigt)
- Spec abgelegt als `features/plentyone/ebay-vollautomatisierung.md` — bereinigt,
  mit ergänztem Tech-Design und der Abweichung „keine SP-API".
- `docs/PRD.md` komplett überarbeitet. Sie stand auf 03.03.2026 und kannte nur
  6 Features mit Status „Planned", während 21 Tabs live sind.
- In `features/INDEX.md` fehlten vier mitgewanderte Tabs komplett: **Lager,
  Lieferantenlisten, Manager (GF), Webseite**. Nachgetragen.

### 2. Architekturentscheidung
Gewählt: **PlentyONE holt die Dateien selbst per HTTPS-URL ab** (Datenquelle
„HTTPS/URL" + Zeitplan), statt sie hochzuladen. Grund: Die Import-Definitionen 22/23
sind fertig gemappt und erprobt; ein Umbau auf direkte REST-Anlage hätte
funktionierende Konfiguration weggeworfen. Später hat sich herausgestellt, dass es
**der einzig mögliche Weg** ist (siehe Erkenntnisse).

### 3. Implementierung Dashboard (erledigt, Commit `486b6cc`)
Migration 139, Export-Routen, Bericht-Routen, PATCH-Route, UI-Abschnitt, Token-Lib,
n8n-Workflow-Generator und Bedienanleitung. Details unter „Geänderte Dateien".

### 4. Selbsttest mit 20 echten Amazon-Zeilen → zwei Defekte gefunden und behoben
Getestet gegen `data/quellen/BerichtzuallenAngeboten_08192026.txt` aus dem Repo
`plentyone-migration` (2.048 Zeilen, 926 aktiv), 20 aktive Zeilen quer über alle
SKU-Präfixe.

- **K1 — der `APR-`-Filter hätte 1.147 von 2.048 Büchern stumm liegen gelassen.**
  Die Variantennummer ist die Amazon-`seller-sku`; im Bestand kommen zehn Präfixe vor.
  Erkannt wird jetzt am Muster `^[A-Z]{2,4}-.+-[0-9]{2}-[0-9]{2}-[0-9]{4}$`.
- **K2 — das eBay-Limit von 65 Zeichen gilt für JEDEN Merkmalswert, nicht nur den
  Titel.** Ein Sammelband mit 26 Autoren (~500 Zeichen) hätte das Autorenfeld
  gesprengt. Zusätzlich sind ` and ` und ` & ` als Autorentrenner ergänzt.
- Bestätigt: Nicht-Bücher fallen schon in der Aufbereitung durch das ISBN-10-Gate
  (Beleg: `JA-0002`, Aloe-Lips-Nahrungsergänzung, ASIN `B01CJSK2BC`).

### 5. Live-Test der Routen (11 Prüfungen, alle grün)
Token-Schutz, Vollausgabe, Kopfzeile-nur bei geschlossener Freigabe, 503 statt Müll,
Bericht-Endpunkt, Session-Schutz. Migration 139 dabei auf **Produktion** angewandt
(Supabase-MCP), Testdaten danach wieder entfernt.

### 6. n8n-Schreibrechte (war blockiert, jetzt frei)
Zuerst blockierte der Auto-Mode-Klassifizierer sowohl `curl POST` auf die n8n-API als
auch das MCP-Werkzeug. Der Nutzer gab ausdrücklich die Erlaubnis; danach wurde
`mcp__n8n__n8n_update_partial_workflow` in `.claude/settings.local.json` ergänzt
(lokal, nicht im Git). **CLAUDE.md wurde auf Wunsch NICHT geändert** — die dortige
Read-Only-Regel widerspricht formal der erteilten Erlaubnis.

### 7. Backup vor jedem Schreibzugriff
Alle 50 n8n-Workflows gesichert nach `C:\Users\cetin\n8n-backups\2026-09-04\`.
**Bewusst außerhalb des Repos**, weil die JSONs Passwörter im Klartext enthalten.

### 8. S1 — REST-Diagnose (3 Runden, danach rückstandsfrei entfernt)
Temporärer, rein lesender Zweig am Workflow `FFiDVkcDnmb1QlSn`. Ergebnis siehe
Erkenntnisse. Workflow steht wieder bei exakt 7 Knoten / 5 Verbindungen.

### 9. Nutzer hat die Einrichtung durchgeführt
- Vercel: `PLENTYONE_EXPORT_TOKEN`, `N8N_EBAY_TOKEN`, `N8N_EBAY_LISTINGS_URL`,
  `N8N_EBAY_MERKMALE_URL` gesetzt + Redeploy.
- n8n: Workflow importiert (`HYDRm1e5J5nIvJce`), Zugangsdaten eingetragen, aktiv.
  Bericht kam zweimal sauber im Dashboard an (00:43 und 00:45 UTC).
- PlentyONE: Import 23 und Import 22 auf „HTTPS/URL" + täglichen Zeitplan umgestellt.

### 10. Erster echter Durchlauf — funktioniert
- **Import 23** (Ausführung 42): 5 Zeilen importiert, 0 übersprungen, 0 Fehler, 88 s
  → 5 neue eBay-Listings (MLID 7–11).
- **Import 22** (Ausführung 43): **11** Zeilen importiert, 0 Fehler, 60 s.
- Danach `ebay-listings.csv` = **leer** → **Idempotenz live bewiesen (AK5/E8)**.
- `ebay-merkmale.csv` = 11 Zeilen → **das Zwei-Lauf-Problem (E13) ist gelöst**, die
  Datei wird erst beim Abruf gerechnet, neue MLIDs sind sofort dabei.
- Nutzer hat anschließend die Vorlage „Bücher (1)" auf die 5 neuen Listings angewendet
  („Die Gruppenfunktion wurde auf 5 Market-Listings erfolgreich angewendet").

### 11. Jagd auf den letzten manuellen Schritt
- F12-Mitschnitt der Stapelverarbeitung: Endpunkt ist
  `POST https://p74746.my.plentysystems.com/plenty/api/ui.php`, Formularfeld `request`
  mit JSON. **Der mitgeschnittene Aufruf war aber nur das Neuladen der Liste**
  (`_dataName: "ItemListingSearch"`, `_commandStack: [{type:"read", command:"read"}]`),
  nicht die Gruppenfunktion selbst.
- Im JSON steckt `"meta":{"id":5,"token":"..."}` — ein **wechselnder Sitzungs-Token**
  plus Sitzungs-Cookie. **Bewertung: von diesem Weg wurde abgeraten** (Bastellösung,
  bricht bei PlentyONE-Updates still, dann entstünden Listings ohne Preisbindung).
- **Stattdessen die Import-Zielfelder untersucht — und dort ist alles vorhanden.**

### 12. Durchbruch: die Vorlage ist durch den Import ersetzbar
Im Import-Zielfeld `Market-Listing-Eigenschaft >> Wert` erscheint eine zweite
Auswahl mit u. a.: Versandprofil-ID, eBay-Zustands-ID, Kategorie-ID 1/2,
Layout-Vorlagen-ID, Lager-ID, Mehrwertsteuersatz, MwSt.-Land, Sprache,
eBay UVP übertragen, eBay-Preisvorschlag, Anzahl der Bilder, Zusatzoptionen.
Unter `Listing-Eigenschaft >> Wert` gibt es genau drei: **An Artikelpreis binden**,
Anzahl je Posten, Als Artikelnummer übertragen.

### 13. Sollwerte am fertigen Listing MLID 1 abgelesen (Dirty Diana, Variante 1145)
Siehe „Wichtige Werte".

### 14. CSV erweitert (erledigt, Commit `b86e80c`)
`ebay-merkmale.csv` hat jetzt **14 Spalten** (3 Merkmale + 11 Konfigurationswerte).
Generator, Regressionstest und der **laufende** n8n-Workflow sind angepasst.
Live verifiziert. Der Import ignoriert die neuen Spalten, solange sie nicht
zugeordnet sind — es ist nichts kaputtgegangen.

---

## Wichtigste Erkenntnisse

### PlentyONE REST kann die Listing-Konfiguration NICHT — Sackgasse, nicht wiederholen
Am 04.09.2026 live sondiert. **503** liefern:
`/rest/data/import`, `/rest/data/imports`, `/rest/imports`, `/rest/item/import`,
`/rest/listings/markets/{id}/attributes|properties|verify`,
`/rest/listings/{id}/contents`, `/rest/listings/contents`, `/rest/listings/1/markets`,
`/rest/listings/layouts|directories|templates|profiles`, `/rest/market/ebay/listings`,
`/rest/orders/shipping/profiles`, `/rest`, `/rest/openapi`.

Ein **Market-Listing hat genau 12 Felder**: `id, listingId, referrerId, directoryId,
credentialsId, enabled, duration, verified, quantity, variationId, allVariations,
updatedAt`. Ein **Listing hat 5**: `id, itemId, unitCombinationId, typeId,
stockDependenceTypeId`. Das ist exakt das, was Import 23 ohnehin setzt.
Kategorie, Versandprofil, Layout, Zustand, MwSt sind über REST **unsichtbar**.

**Folge:** Weder Importe noch Prüfung noch Vorlage lassen sich per öffentlicher REST
auslösen. Der Weg über Abhol-URLs + Import-Zielfelder ist der einzige dokumentierte.

### Funktioniert per REST (bestätigt)
- `?with=variationSalesPrices` liefert die Preise → **der Preis-Guard trägt**.
- `/rest/items/sales_prices/7` = intern „Buchpreisbindung", extern „fixed book prices".
- `/rest/listings/markets`, `/rest/listings`, `/rest/items?with=texts`,
  `/rest/items/variations`, `/rest/v2/properties/relations?with=values`,
  `/rest/orders/shipping/presets`, `/rest/vat`, `/rest/stockmanagement/warehouses`,
  `/rest/markets/credentials`, `/rest/listings/types`, `/rest/webstores`.

### `ui.php` — bewusst verworfen
Interne Oberflächen-Schnittstelle, braucht Sitzungs-Cookie und wechselnden
`meta.token`. Empfehlung: **nicht bauen.** Zwei Klicks alle zwei Wochen sind billiger
als das Risiko still kaputtgehender Listings ohne Preisbindung.

### Weitere Fehlversuche, die nicht wiederholt werden müssen
- `copy()` funktioniert in der Browser-Konsole **nicht innerhalb von `setTimeout`**
  („copy is not defined") — Werte in eine globale Variable schreiben, danach separat
  `copy(window.__x.join('\n'))` aufrufen.
- PlentyONE-Dropdowns liegen **nicht** im `.cdk-overlay-container` — Auslesen per
  CDK-Selektor liefert 0 Treffer. Praktikabel war: per CSS-Injektion breit machen und
  abfotografieren.
- Heredocs mit Backslash-Sequenzen (`\t`) werden über das Bash-Werkzeug verfälscht →
  für solche Edits das Edit-Werkzeug nutzen, nicht `python - <<'PY'`.
- `npm run build 2>&1 | tail -40` verwirft die Fehlerausgabe am Anfang; Exit-Code
  prüfen genügt, aber für Diagnose besser vollständig loggen.

---

## Wichtige Werte

### Systeme / IDs
| Was | Wert |
|---|---|
| PlentyONE | `https://p74746.my.plentysystems.com`, REST-Benutzer „Tempnutzer" |
| n8n | `https://n8n.primehubgbr.com` |
| Supabase-Projekt | `tcqdyzmhwyfamzyeyskj` |
| Dashboard | `https://dashboard.primehubgbr.com` |

### n8n-Workflows
| ID | Name |
|---|---|
| `HYDRm1e5J5nIvJce` | **eBay-Dateien und Kontrolle (PrimeHub)** — der neue, aktive, 15 Knoten |
| `FFiDVkcDnmb1QlSn` | eBay-Dateien bauen (PlentyONE Import 22+23) — Vorgänger, 7 Knoten |
| `C5EhWKSCO2l8eHMK` | [Dashboard] plentyone-metadata |
| `BbHYVN0MuSGAjtuN` | [Dashboard] plentyone-cover |

Webhooks des neuen Workflows: `/webhook/ebay-listings`, `/webhook/ebay-merkmale`
(Header `x-primehub-token`), Zeitplan 05:00 schickt den Bericht.
Der Diagnose-Webhook `diag-9f3c1a7e-plenty` wurde **entfernt**.

### Abhol-URLs (Token steht in Vercel unter `PLENTYONE_EXPORT_TOKEN`)
```
https://dashboard.primehubgbr.com/api/plentyone/export/artikel.csv?t=<TOKEN>        02:00
https://dashboard.primehubgbr.com/api/plentyone/export/eigenschaften.csv?t=<TOKEN>  02:30
https://dashboard.primehubgbr.com/api/plentyone/export/ebay-listings.csv?t=<TOKEN>  03:00
https://dashboard.primehubgbr.com/api/plentyone/export/ebay-merkmale.csv?t=<TOKEN>  04:00
```
Import 23 = „eBay-Listings anlegen (Bücher)", Import 22 = „eBay-Merkmale Bücher".
Beide auf Datenquelle „HTTPS / URL", Caching „alle Daten bei jeder Ausführung",
Importoption „Neue Daten importieren, bestehende Datenfelder aktualisieren",
Kennung `MLID → Market-Listing-ID` (nur Import 22).

⚠️ Die beiden per random.org erzeugten Token stehen im Chatverlauf. **Nach Abschluss
rotieren** (Vercel + n8n-Knoten „Konfiguration" + die vier PlentyONE-URLs).

### Sollwerte der Listing-Konfiguration (am 04.09.2026 an MLID 1 abgelesen)
| Einstellung | Wert | Sicherheit |
|---|---|---|
| Kategorie 1 ID | `261186` (Bücher & Zeitschriften » Bücher) | ✅ direkt abgelesen |
| Preis-ID / An Artikelpreis binden | `7` | ✅ stand im UI-Feld „Preis-ID" |
| Versandprofil-ID | `6` — intern „Standardpaket", Frontend **„Bücher DE"** | ✅ |
| Layout-Vorlagen-ID | `1` („Bücher") | ✅ vom Nutzer bestätigt |
| Lager-ID | `2` (Amazon FBA-Lager BuchDepot24) | ✅ |
| Verzeichnis / Dauer / Menge | Bücher (1) / GTC / 1 | ✅ setzt Import 23 |
| Auftragsstatus | `3` (Warten auf Zahlung) | ✅ abgelesen |
| eBay-Zustands-ID | `1` | ✅ **im Import-Lauf 46 bestätigt** — UI zeigt „Neu" |
| Mehrwertsteuersatz | `7` | ✅ **bestätigt** — UI zeigt „Deutschland / 7 %" |
| Sprache | `de` | ✅ **bestätigt** — UI zeigt „Deutsch" |
| **An Artikelpreis binden** | `1` (Ja/Nein!) | ⚠️ korrigiert, **noch nicht getestet** |
| **Versandprofil-ID** | `1` — **eBay-Versandprofil, eigener Zahlenraum!** | ✅ gefunden, Mapping-Test offen |
| UVP übertragen / Preisvorschlag / Anzahl Bilder | `0` / `0` / `1` | ❔ noch nicht zugeordnet |

### Import-Lauf 45 und 46 (04.09.2026, entscheidendes Testergebnis)
- **Lauf 45** mit `preisbindung = 7`: **0 importiert, 11 Fehler**, wörtlich:
  `Use Item Price invalid. | ( UpdateListingMarket )`
  → „An Artikelpreis binden" ist ein **Ja/Nein-Feld**, nicht die Verkaufspreis-ID.
  Korrigiert auf `1` (neuer Konfigurationsschlüssel `preisbindungWert`).
  **`cfg.bpbPreisId` (=7) bleibt dem Preis-Guard vorbehalten, nicht wiederverwenden.**
- **Lauf 46** ohne dieses Mapping: **11 importiert, 0 Fehler.** Kategorie, Layout,
  Zustand, Sprache, Lager und MwSt standen danach korrekt im Listing, die Merkmale
  (Autor/Buchtitel/Sprache) ebenfalls.
- **Schaden:** `versandprofil_id = 6` hat alle 11 Listings auf
  „**Ungültige Auswahl (6)**" gesetzt. Vorher stand dort „Bücher DE".
  → Reparatur: Vorlage „Bücher (1)" erneut auf alle 11 anwenden.
  Die `6` stammt aus `/rest/orders/shipping/presets` (Plenty-Versandprofile: 6 =
  Standardpaket/DHL, 7 = Selbstabholer). **Das eBay-Market-Listing benutzt einen
  voellig anderen Zahlenraum:** Einrichtung >> Maerkte >> eBay >> Konto
  `primehub_gbr` >> Reiter **Versandprofile** listet **ID 1 = „Buecher DE"**
  (Standard-Profil = Y). Am 04.09.2026 auf `1` korrigiert, live in der CSV geprueft.

Weitere REST-Fakten: Versandprofile gibt es nur **zwei** (id 6 „Standardpaket",
id 7 „Selbstabholer"). Lager: id 1 „Sales", id 2 „Amazon FBA-Lager BuchDepot24"
(`logisticsType: amazon`). Webstore `defaultLanguage: "de"`.

### Stand in PlentyONE (04.09.2026)
21 Artikel, **31 Varianten** (19× `NEW-*` = Testartikel ohne ISBN-Bezug, 12× `APR-*`),
**11 Market-Listings** (MLID 1–11), alle `enabled: true`, Menge 1, nicht gestartet.
Letzter Bericht: `ok: true`, `{artikel:21, listings:6, merkmale:6, geprueft_ok:6,
ohne_listing:5, ohne_bpb_preis:0, geprueft_fehler:0}` — das war **vor** dem
Import-23-Lauf; nach dem Lauf sind es 11 Listings.

### Amazon-Export (Quelle für Tests)
`C:\Users\cetin\Downloads\plentyone-migration\plentyone-migration\data\quellen\BerichtzuallenAngeboten_08192026.txt`
2.048 Zeilen, 926 aktiv, 31 Spalten (`status` = Spalte 29), UTF-8 mit BOM.
SKU-Präfixe gesamt: APR 901 · MAR 566 · PH 234 · FE 92 · BL 71 · JA 69 · SC 58 ·
SM 31 · MB 25 · MAE 1.

### Befehle
```bash
python scripts/gen_ebay_workflow.py     # erzeugt docs/plentyone-ebay-workflow.json
node scripts/test_ebay_workflow.js      # 26 Prüfungen, muss "alle Pruefungen bestanden" sagen
npm run build                           # npm run lint ist unter Next 16 kaputt
```

### Datenbank (Migration 139, auf Produktion angewandt)
- `plentyone_runs` + `export_freigabe` (bool, default true), `export_abrufe` (int),
  `export_zuletzt` (timestamptz)
- RPC `plentyone_export_quittieren(lauf uuid)`
- Tabelle `plentyone_ebay_berichte` (id, erstellt_at, ok, zahlen, probleme,
  uebersprungen, text) + Retention-Trigger auf 20 Einträge + RLS (SELECT für
  admin/manager)
- Letzter erfolgreicher Lauf: `8332cc41-d11f-4714-9ab9-df0eeb824c6e` vom 21.08.2026.
  **Älter als 7 Tage → `artikel.csv` und `eigenschaften.csv` liefern derzeit nur die
  Kopfzeile.** Das ist gewolltes Verhalten (Export-Fenster), kein Fehler.

### Commits
- `486b6cc` — Abhol-URLs, Preis-Guard, Statusbericht, Migration 139, K1+K2 behoben
- `b86e80c` — Vorlage-Werte als 11 Zusatzspalten in der Merkmale-CSV

---

## Geänderte/erstellte Dateien

| Datei | Was & warum |
|---|---|
| `features/plentyone/ebay-vollautomatisierung.md` | **neu** — die Spec inkl. Tech-Design, Entscheidungslog, Edge Cases E1–E22, AK1–AK11 und Abschnitt 2.9 mit den Testkorrekturen K1/K2 |
| `docs/PRD.md` | komplett überarbeitet — war zwei Jahre alt und kannte 6 von 21 Features |
| `features/INDEX.md` | vier fehlende Tabs ergänzt (Lager, Lieferantenlisten, Manager, Webseite) + Zeile für die eBay-Spec |
| `supabase/migrations/139_plentyone_ebay.sql` | **neu** — Export-Fenster + Berichtstabelle |
| `src/lib/plentyone-token.ts` | **neu** — Token-Prüfung, akzeptiert `?t=` (PlentyONE kann keine eigenen Header setzen) und `Authorization: Bearer` |
| `src/app/api/plentyone/export/[datei]/route.ts` | **neu** — liefert artikel/eigenschaften aus dem letzten freigegebenen Lauf, die beiden eBay-CSVs frisch aus n8n; Export-Fenster über `PLENTYONE_EXPORT_FENSTER_TAGE` (Standard 7) |
| `src/app/api/plentyone/ebay/bericht/route.ts` | **neu** — POST nimmt den Bericht aus n8n an (Token), GET liefert die letzten 5 für die UI (Session) |
| `src/app/api/plentyone/runs/[id]/route.ts` | **neu** — PATCH für den Freigabe-Schalter |
| `src/components/plentyone/EbayKette.tsx` | **neu** — Abschnitt „5 · Weiter zu eBay": Freigabe-Schalter, Statusbericht, die vier Abhol-URLs zum Kopieren |
| `src/components/plentyone/PlentyOneClient.tsx` | Abschnitt 5 eingehängt, Run-Typ um die drei Export-Felder erweitert |
| `src/lib/plentyone-mapping.ts` | `IMPORT_SCHRITTE` auf „einmalige Einrichtung" umgeschrieben |
| `scripts/gen_ebay_workflow.py` | **neu** — Generator für den n8n-Workflow. **Hier ändern, nie im JSON.** Enthält Muster-Filter (K1), 65-Zeichen-Kappung (K2), Preis-Guard, Bericht und die 11 Zusatzspalten |
| `scripts/test_ebay_workflow.js` | **neu** — 26 Prüfungen gegen den echten Code-Node, mit echten Amazon-Titeln als Fixture |
| `docs/plentyone-ebay-workflow.json` | **neu, generiert** — importfertiger Workflow |
| `docs/n8n-plentyone-ebay-anleitung.md` | **neu** — Einrichtungsanleitung Schritt 1–6 |
| `.env.local.example` | vier neue Variablen dokumentiert |
| `.claude/settings.local.json` | `mcp__n8n__n8n_update_partial_workflow` erlaubt (lokal, gitignored) |

Nicht im Repo: Backup `C:\Users\cetin\n8n-backups\2026-09-04\` (50 Workflows,
enthalten Klartext-Passwörter).

---

## Offene TODOs (priorisiert)

- [ ] **1. Versandprofil reparieren und die richtige ID finden — HIER WEITERMACHEN**

  **Stand:** Die Zuordnungen sind angelegt und funktionieren — bis auf zwei.
  `versandprofil_id = 6` hat alle 11 Listings auf „Ungültige Auswahl (6)" gesetzt.

  1. PlentyONE → eBay » Listings » Stapelverarbeitung → Vorlage **„Bücher (1)"** auf
     alle 11 Listings anwenden. Damit steht das Versandprofil wieder auf „Bücher DE".
  2. In Import 22 die Zuordnung **`versandprofil_id` deaktiviert lassen**,
     die Zuordnung **`preisbindung` wieder aktivieren** (die CSV liefert jetzt `1`
     statt `7` — live geprüft am 04.09.2026).
  3. Import starten → es müssen **11 importiert, 0 Fehler** herauskommen.
  4. Listing MLID 1 prüfen: Versandprofil „Bücher DE", Preis-ID 7, Kategorie 261186.
  5. **Richtige Versandprofil-ID besorgen:** Auf der Listing-Seite F12 → Konsole:
     ```js
     [...document.querySelectorAll('option')]
       .filter(o => /B(ü|ue)cher DE/i.test(o.text))
       .map(o => o.value + ' = ' + o.text)
     ```
     Den Wert dann in `scripts/gen_ebay_workflow.py` bei `versandprofilId` eintragen,
     neu generieren, den Live-Workflow `HYDRm1e5J5nIvJce` per `patchNodeField` am
     Knoten „Daten holen" nachziehen und die Zuordnung wieder aktivieren.

- [ ] **1b. Rest-Zuordnungen ergänzen:** `uvp`, `preisvorschlag`, `bilder`
  (Werte `0`, `0`, `1`) — Format noch unbestätigt, einzeln testen.

- [ ] ~~**Die fünf sicheren Zuordnungen in Import 22 anlegen**~~ *(erledigt, Lauf 46)*

  **Wo:** PlentyONE → Daten » Import → **„eBay-Merkmale Bücher"** → Reiter **Zuordnung**
  → je Zeile über **„ZUORDNUNG HINZUFÜGEN"**.

  | Quellspalte | Zielfeld | Eigenschaft rechts daneben |
  |---|---|---|
  | `kategorie_id` | Market-Listing-Eigenschaft » Wert | Kategorie-ID 1 |
  | `versandprofil_id` | Market-Listing-Eigenschaft » Wert | Versandprofil-ID |
  | `layout_id` | Market-Listing-Eigenschaft » Wert | Layout-Vorlagen-ID |
  | `lager_id` | Market-Listing-Eigenschaft » Wert | Lager-ID |
  | `preisbindung` | **Listing**-Eigenschaft » Wert | An Artikelpreis binden |

  Speichern → **Import starten** → danach Listing **MLID 1** öffnen und prüfen, ob
  Kategorie 261186, Versandprofil „Bücher DE", Layout „Bücher", Lager „Amazon FBA"
  und Preis-ID 7 unverändert dastehen.

  **Zwei Dinge beobachten:**
  a) Meckert PlentyONE, dass „Market-Listing-Eigenschaft » Wert" nur **einmal**
     vorkommen darf? Beim Artikelimport gab es genau diese Beschränkung (siehe
     Kommentar in `supabase/migrations/138_plentyone_eigenschaften.sql`). Dann braucht
     es **eine Zeile je Eigenschaft** in der Datei statt einer Spalte je Eigenschaft —
     die CSV müsste in `scripts/gen_ebay_workflow.py` entsprechend umgebaut werden.
  b) Sieht hinterher etwas falsch aus: kein Drama, die Listings sind nicht gestartet.
     Einmal die Vorlage „Bücher (1)" drüberlaufen lassen stellt alles wieder her.

- [ ] **2. Runde 2 der Zuordnungen** — `zustand_id`, `mwst`, `sprache_code`, `uvp`,
  `preisvorschlag`, `bilder`. Werte sind unbestätigt (siehe „Wichtige Werte"). Einzeln
  zuordnen, importieren, an MLID 1 gegenprüfen. Falls falsch: Wert im n8n-Knoten
  „Konfiguration" von `HYDRm1e5J5nIvJce` korrigieren (Felder `zustandId`, `mwst`,
  `spracheCode`, …) — der Code nimmt sonst die Standardwerte aus `ZUSATZ`.

- [ ] **3. Wenn Runde 1 + 2 sitzen: Vorlage-Schritt aus der Doku streichen.**
  Betrifft `features/plentyone/ebay-vollautomatisierung.md` (Abschnitt 2.8 und 3.6),
  `docs/n8n-plentyone-ebay-anleitung.md` (Schritt 5) und den Hinweistext in
  `src/components/plentyone/EbayKette.tsx`.

- [ ] **4. Artikel- und Eigenschaftsimport auf „HTTPS/URL" umstellen** (02:00 / 02:30).
  Erst sinnvoll, wenn ein frischer Amazon-Export hochgeladen wurde — sonst liefern die
  URLs nur die Kopfzeile (Export-Fenster, 7 Tage).

- [ ] **5. Token rotieren.** Die beiden random.org-Strings stehen im Chatverlauf.
  Neu erzeugen und an vier Stellen eintragen: Vercel (`PLENTYONE_EXPORT_TOKEN`,
  `N8N_EBAY_TOKEN`), n8n-Knoten „Konfiguration" (`webhookToken`, `dashboardToken`),
  die vier PlentyONE-Import-URLs.

- [ ] **6. Vollimport der ~2.000 Bestandsbücher** über die bestehende WF1/WF2-Strecke.
  Voraussetzung für den Rollout; bisher sind nur 21 Artikel im System.

- [ ] **7. Cover-Weg klären.** Derzeit manueller Upload in den Dateimanager. Über REST
  gibt es keinen Dateimanager-Endpunkt. Option: Bild-URL auf eine Dashboard-Route
  zeigen lassen (`bild_multi_url` ist im Artikelimport schon gemappt). Vorher
  VLB-Cover-Genehmigung klären (E20, Kontakt Frau Bopkhoeva).

- [ ] **8. Lager ID 2** von Lagertyp „Reparatur" auf „Vertrieb" umstellen.

- [ ] **9. Mitarbeiter-Anleitung final schreiben** (der Nutzer hat sie angefragt, ich
  hatte eine ausdruckbare Seite angeboten — noch nicht erstellt).

---

## Blocker & offene Fragen

1. **Unbeantwortet: Erlaubt PlentyONE mehrere Zuordnungen auf
   „Market-Listing-Eigenschaft » Wert" in einem Import?** Beim Artikelimport ging das
   nachweislich nicht (deshalb existiert die separate Eigenschaften-CSV). Falls hier
   dieselbe Beschränkung gilt, muss die Merkmale-CSV von „eine Spalte je Eigenschaft"
   auf „eine Zeile je Eigenschaft" umgebaut werden. **Das entscheidet TODO 1.**

2. **Drei Werte unbestätigt:** eBay-Zustands-ID, Format des Mehrwertsteuersatzes
   (`7` oder vatRate-id `1`) und der Sprache (`de` oder `Deutsch`). Nur durch
   Ausprobieren zu klären.

3. **Bewusst nicht automatisiert:** Amazon-Export ziehen (Nutzerentscheidung, keine
   SP-API) und der Live-Start der Listings (AK9, Freigabe-Schalter).

4. **`ui.php` bleibt verworfen**, solange Weg über die Import-Zielfelder trägt.

5. **Formaler Widerspruch:** `CLAUDE.md` und `.claude/rules/n8n-first.md` verbieten
   Claude weiterhin das Schreiben in n8n, der Nutzer hat es aber ausdrücklich erlaubt
   und die Berechtigung gesetzt. Auf Wunsch des Nutzers wurde CLAUDE.md **nicht**
   geändert. Bei künftigen Sessions beachten.

6. **Sicherheitsnetz steht:** Ein Listing ohne Vorlage besteht die Prüfung nicht →
   der Bericht im Dashboard bleibt rot mit MLID und Grund. Ein vergessener Schritt
   fällt also auf, bevor etwas live geht.
