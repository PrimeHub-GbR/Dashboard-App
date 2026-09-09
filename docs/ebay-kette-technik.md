# eBay-Kette — technische Rekonstruktion

_Für Claude und für Entwickler. Stand 04.09.2026, erstes Listing live auf eBay._
_Die Bedienanleitung für den Mitarbeiter ist eine andere Datei:_
_[ebay-anleitung-mitarbeiter.md](ebay-anleitung-mitarbeiter.md)._

Dieses Dokument hat ein Ziel: **Wer es liest, kann die Kette von null wieder
aufbauen und jede Änderung sicher durchführen** — ohne die Sackgassen noch
einmal zu laufen, die sie gekostet hat.

Es enthält deshalb bewusst mehr, als zum Betrieb nötig ist: jeden Knoten mit
seinen Parametern, jeden Konfigurationswert mit seinem Beleg, jede Zuordnung in
PlentyONE, jeden abgewiesenen Wert mit der Fehlermeldung, die er erzeugt hat.

---

## Inhalt

| § | Thema |
|---|---|
| 1 | [Was die Kette tut](#1-was-die-kette-tut) |
| 2 | [Bestandsaufnahme aller Bauteile](#2-bestandsaufnahme-aller-bauteile) |
| 3 | [Der n8n-Workflow, Knoten für Knoten](#3-der-n8n-workflow-knoten-für-knoten) |
| 4 | [Der Knoten *Konfiguration* — alle 31 Werte](#4-der-knoten-konfiguration--alle-31-werte) |
| 5 | [Der Code-Knoten *Daten holen*](#5-der-code-knoten-daten-holen) |
| 6 | [Die beiden CSV-Formate](#6-die-beiden-csv-formate) |
| 7 | [PlentyONE-Seite: die beiden Importe](#7-plentyone-seite-die-beiden-importe) |
| 8 | [Dashboard-Seite: Routen, Auth, Datenbank](#8-dashboard-seite-routen-auth-datenbank) |
| 9 | [Belegtabelle: jeder probierte Wert](#9-belegtabelle-jeder-probierte-wert) |
| 10 | [Wiederaufbau von null](#10-wiederaufbau-von-null) |
| 11 | [Änderungsrezepte mit Code](#11-änderungsrezepte-mit-code) |
| 12 | [Fallstricke und Werkzeugnotizen](#12-fallstricke-und-werkzeugnotizen) |
| 13 | [Bestand aus Amazon FBA und Versand per MCF](#13-bestand-aus-amazon-fba-und-versand-per-mcf) |
| 13b | [Der GPSR-Guard](#13b-der-gpsr-guard) |
| 14 | [Offene Punkte](#14-offene-punkte) |

---

## 1 Was die Kette tut

Das Amazon-Sortiment (~2.023 Bücher) soll ohne Handarbeit auf eBay erscheinen.
PlentyONE ist die Drehscheibe, Amazon bleibt unangetastet.

```
Seller Central          Dashboard                  n8n                PlentyONE            eBay
──────────────          ─────────                  ───                ─────────            ────
Bestandsbericht ─upload─► /dashboard/plentyone ──► VLB-Anreicherung
                                                   + Cover
                                │
                                ├─ hersteller.csv     ──HTTPS/URL──► Herstellerimport
                                ├─ artikel.csv        ──HTTPS/URL──► Artikelimport
                                ├─ eigenschaften.csv  ──HTTPS/URL──► Eigenschaftsimport
                                │                                          │
                                │                                          ▼
                                │                                    Artikel + Varianten
                                │                                    + VLB-Eigenschaften
                                │                                          │
                                ├─ ebay-listings.csv ◄─┐                   ▼
                                │   ──HTTPS/URL──────────────────────► Import 23
                                │                      │                   │
                                │                 Workflow                 ▼
                                │             HYDRm1e5J5nIvJce      Listing + MLID
                                │                      │                   │
                                ├─ ebay-merkmale.csv ◄─┘                   ▼
                                │   ──HTTPS/URL──────────────────────► Import 22
                                │                                          │
                                │                                          ▼
                                │                                  Merkmale, Kategorie,
                                │                                  Preis, Versand, Titel
                                │                                          │
                                │                                          ▼
                                │                                  Market-Listings prüfen
                                │                                          │
                                ◄──── Bericht 05:00 ────────────────────────┘
                                │
                          Tab „5 · Weiter zu eBay"                   Listing starten ──►  live
                                                                     (Mensch entscheidet)
```

### Die Architekturentscheidung, die alles trägt

**Die CSVs sind keine Dateien, sondern Berechnungen.** PlentyONE holt sie über
eine URL ab; bei jedem Abruf wird der aktuelle PlentyONE-Zustand gelesen und die
Datei neu erzeugt.

Daraus folgt:

| Eigenschaft | Warum |
|---|---|
| **Idempotent** | `ebay-listings.csv` listet nur Artikel **ohne** Listing. Nach dem Import ist sie leer. Zweiter Lauf → keine Dubletten. |
| **Kein Zwei-Lauf-Problem** | `ebay-merkmale.csv` listet **existierende** MLIDs. Da sie beim Abruf gerechnet wird, kennt sie die eben angelegten Listings sofort (Edge Case E13 erledigt). |
| **Selbstheilend** | Fällt ein Import aus, holt der nächste Lauf alles nach. Kein Zustand, der auseinanderlaufen kann. |

### Warum es überhaupt zwei Importe gibt

PlentyONE trennt die Anlage eines Market-Listings von seiner Befüllung. Import 23
erzeugt die MLID, Import 22 füllt sie. **Reihenfolge ist zwingend**: Import 22
braucht MLIDs, die ohne Import 23 nicht existieren.

---

## 2 Bestandsaufnahme aller Bauteile

### Im Repository

| Pfad | Rolle | Anfassen? |
|---|---|---|
| `scripts/gen_ebay_workflow.py` | **Quelle des n8n-Workflows.** Python-Skript, das die Workflow-JSON erzeugt; enthält den kompletten JS-Code der Code-Knoten als Python-Strings | **Ja — hier wird geändert** |
| `docs/plentyone-ebay-workflow.json` | Ausgabe des Generators, 15 Knoten | **Nein — wird überschrieben** |
| `scripts/test_ebay_workflow.js` | Regressionstest; extrahiert `DATEN` aus der JSON und fährt ihn gegen einen simulierten PlentyONE-Zustand | Ja, bei jeder Änderung erweitern |
| `src/app/api/plentyone/export/[datei]/route.ts` | Abhol-Endpunkt für alle vier CSVs | Ja |
| `src/app/api/plentyone/ebay/bericht/route.ts` | POST (von n8n) + GET (fürs Dashboard) | Ja |
| `src/app/api/plentyone/runs/[id]/route.ts` | PATCH für den Freigabe-Schalter | Ja |
| `src/lib/plentyone-token.ts` | zeitkonstanter Token-Vergleich, `?t=` oder Bearer | Ja |
| `src/components/plentyone/EbayKette.tsx` | UI-Abschnitt „5 · Weiter zu eBay" | Ja |
| `supabase/migrations/139_plentyone_ebay.sql` | Freigabe-Spalten, RPC, Berichtstabelle | **bereits angewendet** |
| `features/plentyone/ebay-vollautomatisierung.md` | Spec: AK1–AK11, Edge Cases E1–E22 | Ja |
| `SESSION_STATUS.md` | Chronik und offene Punkte | Ja |
| `docs/n8n-plentyone-ebay-anleitung.md` | Einrichtungsanleitung für den Workflow | Ja |

### Außerhalb des Repositorys — das eigentlich Fragile

Diese Konfiguration liegt in **keinem Git** und ist bei Verlust nur über §7 und
§10 dieses Dokuments wiederherstellbar:

| Ort | Was dort steht |
|---|---|
| n8n-Workflow `HYDRm1e5J5nIvJce` | Knoten *Konfiguration* mit Passwort und Tokens |
| PlentyONE Import 23 „eBay-Listing-Erstellung" | Datenquelle-URL + 9 Zuordnungen |
| PlentyONE Import 22 „eBay-Merkmale Bücher" | Datenquelle-URL + 16 Zuordnungen |
| PlentyONE Artikel-/Eigenschaftsimport | Datenquelle-URLs |
| Vercel Environment Variables | 5 Werte, siehe §8 |
| PlentyONE REST-Benutzer `Tempnutzer` | Passwort |

---

## 3 Der n8n-Workflow, Knoten für Knoten

**Name:** `eBay-Dateien und Kontrolle (PrimeHub)`
**ID:** `HYDRm1e5J5nIvJce`
**Aktiv:** ja · **Knoten:** 15 · **Verbindungen:** 12

### Verdrahtung

```
Webhook Listings ──► Modus listings ─┐
Webhook Merkmale ──► Modus merkmale ─┤
Zeitplan 05:00   ──► Modus bericht  ─┼──► Konfiguration ──► Zugang pruefen
Manuell starten  ──► Modus bericht  ─┘                            │
                                                                  ▼
                                                          PlentyONE Login
                                                                  │
                                                                  ▼
                                                            Daten holen
                                                                  │
                                                                  ▼
                                                          Bericht oder CSV
                                                          ┌───────┴───────┐
                                                     (true)│               │(false)
                                                          ▼               ▼
                                                  Bericht senden    CSV ausliefern
```

### Knotentabelle

| Knoten | Typ | typeVersion | Position |
|---|---|---|---|
| Anleitung | `n8n-nodes-base.stickyNote` | 1 | 0, 0 |
| Webhook Listings | `n8n-nodes-base.webhook` | 2 | 480, 224 |
| Webhook Merkmale | `n8n-nodes-base.webhook` | 2 | 480, 400 |
| Zeitplan 05:00 | `n8n-nodes-base.scheduleTrigger` | 1.2 | 480, 592 |
| Manuell starten | `n8n-nodes-base.manualTrigger` | 1 | 480, 752 |
| Modus listings | `n8n-nodes-base.code` | 2 | 720, 224 |
| Modus merkmale | `n8n-nodes-base.code` | 2 | 720, 400 |
| Modus bericht | `n8n-nodes-base.code` | 2 | 720, 672 |
| Konfiguration | `n8n-nodes-base.set` | 3.4 | 960, 448 |
| Zugang pruefen | `n8n-nodes-base.code` | 2 | 1184, 448 |
| PlentyONE Login | `n8n-nodes-base.httpRequest` | 4.2 | 1408, 448 |
| Daten holen | `n8n-nodes-base.code` | 2 | 1632, 448 |
| Bericht oder CSV | `n8n-nodes-base.if` | 2.2 | 1840, 448 |
| Bericht senden | `n8n-nodes-base.httpRequest` | 4.2 | 2080, 352 |
| CSV ausliefern | `n8n-nodes-base.respondToWebhook` | 1.1 | 2080, 544 |

### Parameter im Wortlaut

**Webhook Listings / Webhook Merkmale**

```json
{ "path": "ebay-listings", "httpMethod": "GET", "responseMode": "responseNode" }
{ "path": "ebay-merkmale", "httpMethod": "GET", "responseMode": "responseNode" }
```

Ergibt `https://n8n.primehubgbr.com/webhook/ebay-listings` bzw. `…/ebay-merkmale`.
`responseMode: responseNode` ist Pflicht — sonst antwortet n8n sofort und der
Knoten *CSV ausliefern* läuft ins Leere.

**Zeitplan 05:00**

```json
{ "rule": { "interval": [ { "field": "cronExpression", "expression": "0 5 * * *" } ] } }
```

**Modus-Knoten** — setzen die Betriebsart und reichen den Token weiter:

```javascript
// Modus listings
const kopf = ($('Webhook Listings').first().json.headers || {})['x-primehub-token'] || '';
return [{ json: { modus: 'listings', token: kopf } }];

// Modus merkmale  — identisch, nur anderer Webhook-Name
// Modus bericht   — const kopf = '';  (Zeitplan hat keinen Token)
```

**Zugang pruefen**

```javascript
const cfg = $('Konfiguration').first().json;
const d = $input.first().json;
if (d.modus !== 'bericht') {
  const erwartet = String(cfg.webhookToken || '');
  if (erwartet.length < 16) {
    throw new Error('Im Knoten "Konfiguration" fehlt der webhookToken (mindestens 16 Zeichen).');
  }
  if (String(d.token || '') !== erwartet) {
    throw new Error('Abruf ohne gueltigen Token abgelehnt.');
  }
}
return [{ json: { modus: d.modus } }];
```

**PlentyONE Login**

```
POST  {{ $('Konfiguration').first().json.plentyUrl }}/rest/login
Body (form):  username = {{ cfg.benutzer }}
              password = {{ cfg.passwort }}
Timeout: 60000
```

Antwort enthält `accessToken` (je nach PlentyONE-Version direkt oder unter `data`).
Der Code-Knoten liest beides ab:
`login.accessToken || (login.data && login.data.accessToken)`.

**Bericht oder CSV** — IF, strict, `{{ $json.modus }} equals "bericht"`.
True-Zweig → *Bericht senden*, False-Zweig → *CSV ausliefern*.

**Bericht senden**

```
POST  {{ cfg.dashboardBericht }}
Header  Content-Type: application/json
Header  Authorization: Bearer {{ cfg.dashboardToken }}
Body    raw / application/json  =  {{ $json.koerper }}
Timeout 60000
```

**CSV ausliefern**

```
respondWith: text
responseBody: {{ $json.inhalt }}
responseHeader: Content-Type: text/csv; charset=utf-8
```

---

## 4 Der Knoten *Konfiguration* — alle 31 Werte

Ein `Set`-Knoten (typeVersion 3.4). Jede Zeile hat eine feste `id` — die
Reihenfolge in der Oberfläche folgt ihr, deshalb sitzt `mwstLand` (id `b12`) am
Ende der Liste, obwohl seine Spalte in der CSV zwischen `lager_id` und `mwst`
steht.

### Gruppe A — Zugang und Grundlagen

| id | Name | Wert | Bedeutung |
|---|---|---|---|
| a01 | `plentyUrl` | `https://p74746.my.plentysystems.com` | REST-Basis |
| a02 | `benutzer` | `Tempnutzer` | REST-Benutzer |
| a03 | `passwort` | *(Geheimnis)* | Passwort dieses Benutzers |
| a04 | `webhookToken` | *(Geheimnis)* | muss `N8N_EBAY_TOKEN` in Vercel entsprechen |
| a05 | `dashboardBericht` | `https://dashboard.primehubgbr.com/api/plentyone/ebay/bericht` | Ziel des Berichts |
| a06 | `dashboardToken` | *(Geheimnis)* | muss `PLENTYONE_EXPORT_TOKEN` entsprechen |
| a07 | `variantenMuster` | `^[A-Z]{2,4}-.+-[0-9]{2}-[0-9]{2}-[0-9]{4}$` | Buch-Erkennung |
| a07b | `variantenPrefix` | *(leer)* | zusätzliche Einschränkung für Testläufe |
| a08 | `sprache` | `Deutsch` | Wert des Merkmals „Sprache" |
| a09 | `autorEigenschaftId` | `10` | PlentyONE-Eigenschaft, in der der Autor steht |
| a10 | `bpbPreisId` | `7` | Verkaufspreis-ID des gebundenen Ladenpreises |

### Gruppe A — Spaltenwerte für Import 23

| id | Name | Wert | Spalte |
|---|---|---|---|
| a11 | `marketId` | `1008` | `MarketID` — eBay Deutschland |
| a12 | `userId` | `10` | `UserID` |
| a13 | `typeId` | `2` | `TypeID` |
| a14 | `stockDependenceTypeId` | `2` | `StockDependenceTypeID` — zwei Skalen, siehe §13 |
| a15 | `unitCombinationId` | `1` | `UnitCombinationID` |
| a16 | `directoryId` | `1` | `DirectoryID` — Verzeichnis „Bücher" |
| a17 | `enabled` | `Y` | `Enabled` |
| a18 | `duration` | `GTC` | `Duration` — Endlos |

### Gruppe B — Spaltenwerte für Import 22

| id | Name | Wert | Spalte | Beleg |
|---|---|---|---|---|
| b01 | `kategorieId` | `261186` | `kategorie_id` | Listing zeigt „Bücher & Zeitschriften" |
| b02 | `versandprofilId` | `1` | `versandprofil_id` | Lauf 48 ✓ — `6` war falsch |
| b03 | `zustandId` | `1000` | `zustand_id` | Lauf 51 ✓ — `1` war ungültig |
| b04 | `layoutId` | `1` | `layout_id` | Listing zeigt Layout „Bücher" |
| b05 | `lagerId` | `2` | `lager_id` | Amazon FBA-Lager, siehe §13 |
| b06 | `mwst` | `7` | `mwst` | Lauf 50 ✓ |
| b12 | `mwstLand` | `1` | `mwst_land` | Lauf 52 ✓ |
| b07 | `spracheCode` | `de` | `sprache_code` | Lauf 50 ✓ |
| b08 | `uvpUebertragen` | `N` | `uvp` | Lauf 52 ✓ |
| b09 | `preisvorschlag` | `N` | `preisvorschlag` | Lauf 52 ✓ |
| b10 | `anzahlBilder` | `1` | `bilder` | Lauf 52 ✓ |
| b11 | `preisbindungWert` | `Y` | `preisbindung` | Lauf 49 ✓ — `7` und `1` abgewiesen |

> **Wichtig für Änderungen:** Wer einen Wert nur hier in n8n ändert, verliert ihn
> beim nächsten `python scripts/gen_ebay_workflow.py` — der Generator schreibt
> seine eigenen Vorgaben zurück. **Immer beide Stellen ändern.**

---

## 5 Der Code-Knoten *Daten holen*

Rund 300 Zeilen, ca. 15 KB. Im Generator liegt er als Python-String `DATEN`.
Reihenfolge der Abschnitte:

### 5.1 Vorbereitung

```javascript
const cfg   = $('Konfiguration').first().json;
const modus = $('Zugang pruefen').first().json.modus;
const login = $('PlentyONE Login').first().json;
const token = login.accessToken || (login.data && login.data.accessToken);
if (!token) throw new Error('Kein Login-Token von PlentyONE erhalten …');
```

Zwei Helfer: `api(path)` setzt `Authorization: Bearer` und `Accept: application/json`;
`pageAll(base)` blättert mit `page` + `itemsPerPage=250` bis `isLastPage`, maximal
400 Seiten (= 100.000 Datensätze).

### 5.2 Die Lesezugriffe

| Reihenfolge | Aufruf | Ergebnis im Speicher |
|---|---|---|
| 1 | `/rest/items?with=texts` | `titelByItem[itemId] = name1` (bevorzugt `lang === 'de'`) |
| 2 | `/rest/items/variations` | `varByItem[itemId] = {variationId, number}`, `itemByVar[variationId] = itemId` |
| 2b | `/rest/items/variations?with=images` | `bildByVar[variationId] = images.length` — Bilder hängen an der Variante, **nicht** am Artikel |
| 3 | `/rest/listings` | `itemsMitListing` als `Set` |
| 4 | `/rest/listings/markets` | `marketListings` — enthält `id` (= MLID), `variationId`, `verified` |
| 5 | `/rest/v2/properties/relations?with=values` | `autorByVar[targetId]` für `propertyId === 10` |
| 6 | `/rest/items/variations?with=variationSalesPrices` | `preisByVar[variationId]` für `salesPriceId === 7` |

> **`with=itemTexts` wirft 500.** Der richtige Parameter heißt `with=texts`.
> Das hat Zeit gekostet und steht deshalb hier.
>
> **`with=images` gibt es an `/rest/items` nicht.** Kein Fehler, keine Ausnahme —
> das Feld fehlt einfach. Bilder liegen an der Variante:
> `/rest/items/variations?with=images`. Das hat den Bild-Guard zwei Tage lang
> blind laufen lassen.

### 5.3 Der Preis-Guard

```javascript
let preisPruefung = 'ok';
try {
  … // salesPrices lesen
  if (!gefunden) preisPruefung = 'keine_preise_gefunden';
} catch (e) {
  preisPruefung = 'nicht_moeglich';
}
const preisOk = (variationId) => {
  if (preisPruefung !== 'ok') return true;   // nicht pruefbar -> nicht blockieren, aber melden
  return Number(preisByVar[variationId] || 0) > 0;
};
```

Der `return true` im Fehlerfall ist Absicht: **nicht stillschweigend filtern.**
Statt dessen setzt der Bericht `preisHinweis` und wird rot, damit ein Mensch
hinschaut. Ein stiller Filter wäre der gefährlichere Fehler — er sähe aus wie
Erfolg.

### 5.4 Textregeln

```javascript
const MAX = 65;   // eBay begrenzt JEDEN Merkmalswert, nicht nur den Titel

const aufMaxKuerzen = (roh) => {
  let t = (roh || '').replace(/,/g, '').replace(/\t/g, ' ').replace(/\s+/g, ' ').trim();
  if (t.length > MAX) {
    const cut = t.slice(0, MAX + 1);
    const i = cut.lastIndexOf(' ');
    t = cut.slice(0, i > 30 ? i : MAX).replace(/[\s|,;:\-–—·]+$/, '').trim();
  }
  return t;
};
```

Kommas werden entfernt, weil sie in `Name`/`Wert` der Trenner sind.

```javascript
const autorUmformen = (roh) => {
  const teile = String(roh || '')
    .split(/;| and | & /)
    .map(a => { const p = a.split(','); return p.length === 2 ? (p[1].trim() + ' ' + p[0].trim()) : a.trim(); })
    .map(a => a.replace(/,/g, ' ').replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  if (!teile.length) return '';
  const genommen = [];
  for (const a of teile) {
    if (genommen.concat(a).join('; ').length > MAX) break;
    genommen.push(a);
  }
  return genommen.length ? genommen.join('; ') : aufMaxKuerzen(teile[0]);
};
```

Dreht „Nachname, Vorname" und **kappt an der Namensgrenze** — lieber zwei
vollständige Autoren als ein zerschnittener. Anlass: *„Myrrhe, Mord und
Marzipan"* mit 26 Autoren und Übersetzern, rund 500 Zeichen.

```javascript
const EBAY_TITEL_MAX = 80;
const ebayTitel = (roh) => {
  let t = String(roh || '').replace(/\t/g, ' ').replace(/\s+/g, ' ').trim();
  if (t.length > EBAY_TITEL_MAX) {
    const anhang = t.search(/\s[|–—]\s|\s-\s/);
    if (anhang > 20) t = t.slice(0, anhang);
  }
  if (t.length > EBAY_TITEL_MAX) {
    const cut = t.slice(0, EBAY_TITEL_MAX + 1);
    const satz = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '),
                          cut.lastIndexOf('? '), cut.lastIndexOf('; '));
    const wort = cut.lastIndexOf(' ');
    t = satz >= 55 ? cut.slice(0, satz + 1) : cut.slice(0, wort > 40 ? wort : EBAY_TITEL_MAX);
    t = t.replace(/\s+(und|oder|mit|für|von|der|die|das|dem|den|des|ein|eine|einen|im|am|in|zu|auf|aus|bei|als|wie)$/i, '');
  }
  return t.replace(/[\s|,;:\-–—·]+$/, '').trim();
};
```

Hier bleiben Kommas stehen — eigene Tab-Spalte, kein Sammelwert.

### 5.5 Buch-Erkennung

```javascript
const muster = new RegExp(cfg.variantenMuster || '^[A-Z]{2,4}-.+-[0-9]{2}-[0-9]{2}-[0-9]{4}$');
const istBuch = (itemId) => {
  const v = varByItem[itemId];
  if (!v) return false;
  const nr = String(v.number || '');
  if (cfg.variantenPrefix && !nr.startsWith(cfg.variantenPrefix)) return false;
  return muster.test(nr);
};
```

> **Der teuerste vermiedene Fehler.** Ein früher Entwurf filterte auf `APR-`.
> Gezählte Prefix-Verteilung im Amazon-Bestand (2.048 Zeilen):
>
> | Prefix | Zeilen | | Prefix | Zeilen |
> |---|---|---|---|---|
> | APR | 901 | | JA | 69 |
> | MAR | 566 | | SC | 58 |
> | PH | 234 | | SM | 31 |
> | FE | 92 | | MB | 25 |
> | BL | 71 | | MAE | 1 |
>
> 1.147 von 2.048 Büchern wären **stumm** liegen geblieben. Aufgefallen ist es
> nur, weil der Test mit 20 echten Zeilen quer durch den Bestand lief.

### 5.6 CSV A bauen

```javascript
const aRows = ['ItemID\tMarketID\tUserID\tTypeID\tStockDependenceTypeID\t'
             + 'UnitCombinationID\tDirectoryID\tEnabled\tDuration'];
for (const it of items) {
  if (!istBuch(it.id)) continue;
  if (itemsMitListing.has(it.id)) continue;
  const v = varByItem[it.id];
  if (!preisOk(v.variationId)) { ohnePreis.push({…}); continue; }
  aRows.push([it.id, cfg.marketId, …].join('\t'));
}
```

### 5.7 CSV B bauen

`ZUSATZ` ist die Liste `[Spaltenname, Wert]` der zwölf Einstellungen; Kopfzeile
und Datenzeilen leiten sich daraus ab, eine neue Spalte erscheint automatisch
überall:

```javascript
const bRows = [['MLID', 'Name', 'Wert'].concat(ZUSATZ.map(z => z[0]))
  .concat(['titel_ebay']).join('\t')];

for (const ml of marketListings) {
  const itemId = itemByVar[ml.variationId];
  if (!itemId || !istBuch(itemId)) continue;
  buchListings++;

  if      (ml.verified === 'succeeded') geprueftOk++;
  else if (ml.verified === 'failed')  { geprueftFehler++; probleme.push({…}); }
  else                                { nichtGeprueft++;  probleme.push({… 'noch nicht geprueft …'}); }

  const autor = autorUmformen(autorByVar[ml.variationId]);
  const titel = titelKuerzen(titelRoh);
  if (!autor || !titel) { uebersprungen.push({…}); continue; }

  bRows.push([ml.id, 'Autor,Buchtitel,Sprache', autor + ',' + titel + ',' + cfg.sprache]
    .concat(ZUSATZ.map(z => z[1]))
    .concat([ebayTitel(titelRoh)]).join('\t'));
}
```

### 5.8 Bericht

```javascript
const ok = geprueftFehler === 0 && nichtGeprueft === 0
        && ohnePreis.length === 0 && preisPruefung === 'ok';
```

> **Warum `nichtGeprueft` eigens zählt:** Ein Bericht meldete `ok: true`, obwohl
> nur 6 von 11 Listings geprüft waren — die fünf neuen hatten `verified`
> weder auf `succeeded` noch auf `failed`. „Nicht geprüft" wurde wie „in Ordnung"
> behandelt. Eine vergessene Prüfung muss auffallen, sonst ist der grüne Bericht
> wertlos.

Rückgabe:

```javascript
return [{ json: { modus, inhalt, koerper, zahlen, ok } }];
```

- `inhalt` — die CSV als Text (oder der Berichtstext)
- `koerper` — JSON-String für den POST ans Dashboard
- `zahlen` — `{artikel, ohne_listing, listings, geprueft_ok, geprueft_fehler, nicht_geprueft, merkmale, ohne_bpb_preis}`

---

## 6 Die beiden CSV-Formate

**Gemeinsam:** Tabulator-getrennt, UTF-8, Kopfzeile mit Spaltennamen,
Zeilenumbruch `\n`, keine Anführungszeichen, keine Maskierung. Werte werden
tab- und (in `Wert`) kommafrei gehalten, statt sie zu quoten.

### `ebay_listing_erstellung.csv` — Import 23

```
ItemID	MarketID	UserID	TypeID	StockDependenceTypeID	UnitCombinationID	DirectoryID	Enabled	Duration
188	1008	10	2	1	1	1	Y	GTC
```

### `ebay_merkmale.csv` — Import 22

16 Spalten. Kopfzeile:

```
MLID	Name	Wert	kategorie_id	versandprofil_id	zustand_id	layout_id	lager_id	mwst_land	mwst	sprache_code	uvp	preisvorschlag	bilder	preisbindung	titel_ebay
```

Beispielzeile (Tabs hier als `→` dargestellt):

```
1 → Autor,Buchtitel,Sprache
  → Jen Besser; Shana Feste,Dirty Diana: Das Erwachen (Dirty Diana-Trilogie Band 1),Deutsch
  → 261186 → 1 → 1000 → 1 → 2 → 1 → 7 → de → N → N → 1 → Y
  → Dirty Diana: Das Erwachen (Dirty Diana-Trilogie, Band 1)
```

Beachte den Unterschied zwischen Spalte 3 (Buchtitel als **Merkmal**, ohne
Kommas, ≤ 65 Zeichen) und Spalte 16 (**eBay-Titel**, mit Kommas, ≤ 80 Zeichen).

---

## 7 PlentyONE-Seite: die beiden Importe

Menü: **Daten » Import**. Jeder Import hat die Reiter *Einstellungen*,
*Zuordnung*, *Zeitplan*, *Protokoll*.

### Import 23 — „eBay-Listing-Erstellung"

| Einstellung | Wert |
|---|---|
| Importtyp | Market-Listing (Listing-Anlage) |
| Datenquelle | HTTPS / URL |
| URL | `https://dashboard.primehubgbr.com/api/plentyone/export/ebay-listings.csv?t=<PLENTYONE_EXPORT_TOKEN>` |
| Trennzeichen | Tabulator |
| Zeichensatz | UTF-8 |
| Kopfzeile | ja |

**Zuordnungen** — Quellspalte → Zielfeld, alle in der Gruppe `Market-Listing`:

| Quellspalte | Zielfeld |
|---|---|
| `ItemID` | Artikel-ID |
| `MarketID` | Markt-ID |
| `UserID` | Benutzer-ID |
| `TypeID` | Typ-ID |
| `StockDependenceTypeID` | Bestandsabhängigkeit |
| `UnitCombinationID` | Mengeneinheit |
| `DirectoryID` | Verzeichnis-ID |
| `Enabled` | Freigeschaltet |
| `Duration` | Dauer |

### Import 22 — „eBay-Merkmale Bücher"

| Einstellung | Wert |
|---|---|
| Importtyp | Market-Listing |
| Datenquelle | HTTPS / URL |
| URL | `https://dashboard.primehubgbr.com/api/plentyone/export/ebay-merkmale.csv?t=<PLENTYONE_EXPORT_TOKEN>` |
| Trennzeichen | Tabulator |
| Zeichensatz | UTF-8 |
| Kopfzeile | ja |

**Zuordnungen — 16 Zeilen.** Die Spalte „Eigenschaft" ist das zweite Auswahlfeld,
das rechts erscheint, sobald `Market-Listing-Eigenschaft » Wert` gewählt ist:

| # | Quellspalte | Zielfeld | Eigenschaft |
|---|---|---|---|
| 1 | `MLID` | Market-Listing » ID | — |
| 2 | `Name` | Market-Listing-Merkmal » Name | — |
| 3 | `Wert` | Market-Listing-Merkmal » Wert | — |
| 4 | `kategorie_id` | Market-Listing-Eigenschaft » Wert | Kategorie-ID 1 |
| 5 | `versandprofil_id` | Market-Listing-Eigenschaft » Wert | Versandprofil-ID |
| 6 | `zustand_id` | Market-Listing-Eigenschaft » Wert | eBay-Zustands-ID |
| 7 | `layout_id` | Market-Listing-Eigenschaft » Wert | Layout-Vorlagen-ID |
| 8 | `lager_id` | Market-Listing-Eigenschaft » Wert | Lager-ID |
| 9 | `mwst_land` | Market-Listing-Eigenschaft » Wert | MwSt.-Land |
| 10 | `mwst` | Market-Listing-Eigenschaft » Wert | Mehrwertsteuersatz |
| 11 | `sprache_code` | Market-Listing-Eigenschaft » Wert | Sprache |
| 12 | `uvp` | Market-Listing-Eigenschaft » Wert | eBay UVP übertragen |
| 13 | `preisvorschlag` | Market-Listing-Eigenschaft » Wert | eBay-Preisvorschlag |
| 14 | `bilder` | Market-Listing-Eigenschaft » Wert | Anzahl der Bilder |
| 15 | `preisbindung` | Listing-Eigenschaft » Wert | An Artikelpreis binden |
| 16 | `titel_ebay` | Market-Listing-Text » Titel | — |

> **Zeile 15 ist die Ausnahme.** „An Artikelpreis binden" hängt am *Listing*,
> nicht am *Market-Listing* — deshalb die andere Zielfeldgruppe.

> **PlentyONE erlaubt hier mehrere Zuordnungen auf dasselbe Zielfeld.** Elf
> Zeilen zeigen auf `Market-Listing-Eigenschaft » Wert`. Die Einschränkung, die
> beim Artikelimport gilt (dokumentiert in Migration 138), greift bei diesem
> Importtyp nicht.

### Artikel- und Eigenschaftsimport

Gleiche Machart, andere URLs:

```
…/api/plentyone/export/hersteller.csv?t=<TOKEN>
…/api/plentyone/export/artikel.csv?t=<TOKEN>
…/api/plentyone/export/eigenschaften.csv?t=<TOKEN>
```

Vorgesehene Zeitpläne: 01:45, 02:00 und 02:30 (Eigenschaften gemeinsam mit Import 23,
siehe §7a). Der Herstellerimport steht bewusst
**vorn** — sonst findet der Artikelimport seinen Verlag nicht und lässt
*Artikel » Hersteller-ID* leer. Der Export liefert nur innerhalb des
Freigabefensters echte Daten, sonst die Kopfzeile — ein Zeitplan ist damit
gefahrlos.

---

## 8 Dashboard-Seite: Routen, Auth, Datenbank

### `GET /api/plentyone/export/[datei]`

`runtime = nodejs`, `dynamic = force-dynamic`, `maxDuration = 60`.

| Datei | Quelle |
|---|---|
| `artikel.csv` | Supabase Storage `workflow-results`, Feld `csv_path` des letzten Laufs |
| `eigenschaften.csv` | dito, Feld `eigenschaften_path` |
| `hersteller.csv` | dito, Feld `hersteller_path` |

### `POST /api/plentyone/runs` — zwei Türen, ein Ablauf

Der Endpunkt nimmt den Amazon-Bericht auf zwei Wegen an:

| Weg | Auth | `user_id` des Laufs |
|---|---|---|
| Upload im Dashboard | Login-Cookie, Rolle admin/manager | der angemeldete Benutzer |
| n8n `plentyone-amazon-abruf` | `Authorization: Bearer <PLENTYONE_EXPORT_TOKEN>` | `PLENTYONE_SYSTEM_USER_ID` |

Dahinter läuft **beides identisch**: Retention auf 3 Läufe, Lauf anlegen, Datei in
`workflow-uploads`, beide n8n-Stränge anstoßen, Callback. Deshalb gibt es keinen
zweiten Lauf-Anleger und keine zweite Storage-Logik — nur eine zusätzliche Abfrage
ganz vorn. Erkennbar ist die Herkunft am `input_name`: der Abruf schickt
`amazon-alle-angebote-<Datum>.tsv`.

**Grenze:** Vercel nimmt rund 4,5 MB Body. Der Bericht für ~2.000 Bücher liegt bei
1–2 MB. Würde das Sortiment stark wachsen, wäre der Ausweg, dass n8n die Datei selbst
in den Storage legt und nur den Pfad meldet.
| `ebay-listings.csv` | Proxy auf `N8N_EBAY_LISTINGS_URL` |
| `ebay-merkmale.csv` | Proxy auf `N8N_EBAY_MERKMALE_URL` |

Ablauf für die eBay-Dateien: `fetch` mit Header `x-primehub-token` (aus
`N8N_EBAY_TOKEN`), `AbortSignal.timeout(55_000)`, `cache: 'no-store'`. Bei
`!res.ok` antwortet die Route **502** — bewusst ein Fehlerstatus, damit
PlentyONE den Import abbricht, statt eine Fehlerseite als Datensatz einzulesen.

Ablauf für Artikel/Eigenschaften:

```
letzter Lauf mit csv_status = 'success' und Feld nicht null
  → Datei aus dem Storage laden
  → offen = export_freigabe === true && Alter < FENSTER_TAGE * 86_400_000
  → offen  ? ganze Datei + RPC plentyone_export_quittieren(lauf)
           : nur die erste Zeile
```

Antwortkopf immer: `text/csv; charset=utf-8`, `Content-Disposition: inline`,
`Cache-Control: no-store`.

### `POST /api/plentyone/ebay/bericht`

Auth über `plentyoneTokenPruefen`. Zod-Schema:

```typescript
{
  ok?: boolean,
  zahlen: Record<string, number>,          // Vorgabe {}
  probleme: Array<{mlid?, item_id?, titel?, grund?}>,      // max 500
  uebersprungen: Array<{…}>,                                // max 500
  text?: string                                             // max 20 000
}
```

Fällt `ok` weg, rechnet die Route selbst:
`probleme.length === 0 && zahlen.geprueft_fehler === 0 && zahlen.ohne_bpb_preis === 0`.
Antwort **201** mit `{ok: true, bericht: {id, erstellt_at}}`.

### `GET /api/plentyone/ebay/bericht`

Session-Auth, Rolle `admin` oder `manager`, sonst 403. Liefert die letzten
fünf Berichte, `erstellt_at` absteigend.

### Token

`src/lib/plentyone-token.ts` akzeptiert **beides**:

- `Authorization: Bearer <token>` — so meldet sich n8n
- `?t=<token>` — so holt PlentyONE ab, **weil PlentyONE bei HTTPS-Quellen keine
  eigenen Header setzen kann**

Vergleich mit `timingSafeEqual`; Token unter 16 Zeichen gelten als nicht gesetzt.

### Umgebungsvariablen

| Variable | Ort | Zweck |
|---|---|---|
| `PLENTYONE_EXPORT_TOKEN` | Vercel + `.env.local` | Abhol- und Bericht-Token |
| `N8N_EBAY_TOKEN` | Vercel + n8n *Konfiguration* | Dashboard → n8n |
| `N8N_EBAY_LISTINGS_URL` | Vercel | `https://n8n.primehubgbr.com/webhook/ebay-listings` |
| `N8N_EBAY_MERKMALE_URL` | Vercel | `https://n8n.primehubgbr.com/webhook/ebay-merkmale` |
| `PLENTYONE_EXPORT_FENSTER_TAGE` | Vercel, optional | Vorgabe 7 |

### Datenbank (Migration 139, angewendet)

`plentyone_runs` bekommt:

```sql
export_freigabe BOOLEAN     NOT NULL DEFAULT TRUE
export_abrufe   INTEGER     NOT NULL DEFAULT 0
export_zuletzt  TIMESTAMPTZ
```

RPC `plentyone_export_quittieren(lauf UUID)` — `SECURITY DEFINER`, zählt atomar
hoch, damit parallele Zeitpläne nicht gegeneinander zählen.

Tabelle `plentyone_ebay_berichte`:

```sql
id UUID PK, erstellt_at TIMESTAMPTZ, ok BOOLEAN,
zahlen JSONB, probleme JSONB, uebersprungen JSONB, text TEXT
```

Index auf `erstellt_at DESC`. Ein `AFTER INSERT … FOR EACH STATEMENT`-Trigger
löscht alles ab Position 21. RLS an; SELECT nur für `admin`/`manager`, Schreiben
ausschließlich über den Service-Role-Key.

---

## 9 Belegtabelle: jeder probierte Wert

Chronologisch. „Lauf" = Importlauf in PlentyONE.

| Lauf | Was geändert | Ergebnis |
|---|---|---|
| 45 | `preisbindung = 7` (die Verkaufspreis-ID) | **11 Fehler**: `Use Item Price invalid. \| ( UpdateListingMarket )` |
| 46 | `preisbindung`-Zuordnung deaktiviert | 11 importiert, 0 Fehler |
| 47 | `preisbindung = 1` | **derselbe Fehler**, 11× |
| 48 | `preisbindung` aus, `versandprofil_id = 1` | 11 importiert, Erfolg |
| 49 | `preisbindung = Y` | **sauber**; Listing zeigt danach Preis-ID 7 ✓ |
| 50 | `zustand_id = 1`, `mwst = 7`, `sprache_code = de` | keine Fehler; MwSt **und** Sprache korrekt, **Zustand ungültig** |
| 51 | `zustand_id = 1000` | ✓ Listing zeigt „Neu" |
| 52 | `uvp = N`, `preisvorschlag = N`, `bilder = 1`, `mwst_land = 1`, `titel_ebay` | ✓ Listing speicherbar, Prüfung grün, **live auf eBay** |

### Frühere Sackgassen

| Versuch | Ergebnis |
|---|---|
| `versandprofil_id = 6` (PlentyONE-Versandprofil „Standardpaket") | „Ungültige Auswahl (6)", **kein Importfehler**, überschrieb das korrekte Profil auf allen 11 Listings |
| Prefix-Filter `APR-` | hätte 1.147 von 2.048 Büchern stumm übersprungen |
| Titel ungekürzt | „Titel enthält zu viele Zeichen", −105 Zeichen, Speichern unmöglich |
| Nur `mwst` ohne `mwst_land` | beide Steuerfelder bleiben leer |
| Bericht ohne `nichtGeprueft` | grün bei 6 von 11 geprüften Listings |

### Was die REST-API **nicht** kann (live geprüft 04.09.2026)

| Endpunkt | Antwort |
|---|---|
| `/rest/data/import`, `/rest/data/imports`, `/rest/imports`, `/rest/item/import` | 503 |
| `/rest/listings/markets/{id}/attributes` / `/properties` / `/verify` | 503 |
| `/rest/listings/{id}/contents` | 503 |
| `/rest/listings/layouts` / `/directories` / `/templates` / `/profiles` | 503 |
| `/rest`, `/rest/openapi` | 503 |
| `/rest/orders/shipping/profiles` | 503 |

Ein Market-Listing hat über die API genau 12 Felder, ein Listing 5 — exakt das,
was Import 23 ohnehin setzt. **Die Importe lassen sich nicht per API starten.**

Der interne UI-Endpunkt `POST /plenty/api/ui.php` (Formularfeld `request`,
Session-Cookie plus rotierendes `meta.token`) wäre technisch gangbar und wurde
**bewusst verworfen**: undokumentiert, bricht bei jedem PlentyONE-Update.
Auslöser bleiben deshalb PlentyONE-Zeitpläne oder ein Klick.

---

## 10 Wiederaufbau von null

Reihenfolge zwingend.

**1 · Datenbank** — Migration 139 anwenden (ist bereits geschehen; bei einem
frischen Projekt: `supabase/migrations/139_plentyone_ebay.sql`).

**2 · Umgebungsvariablen** — die fünf aus §8 in Vercel setzen. Tokens frisch
erzeugen, mindestens 32 Zeichen.

**3 · Workflow bauen**

```bash
python scripts/gen_ebay_workflow.py     # -> docs/plentyone-ebay-workflow.json
node scripts/test_ebay_workflow.js      # muss "alle Pruefungen bestanden" melden
```

**4 · Workflow importieren** — in n8n *Workflows » Import from File*, die JSON
wählen. Danach im Knoten *Konfiguration* die drei Platzhalter ersetzen:
`passwort`, `webhookToken`, `dashboardToken`. Workflow aktivieren.

**5 · Webhooks prüfen**

```bash
curl -H "x-primehub-token: <N8N_EBAY_TOKEN>" \
     https://n8n.primehubgbr.com/webhook/ebay-merkmale | head -2
```

Muss die Kopfzeile mit 16 Spalten liefern.

**6 · Dashboard-Route prüfen**

```bash
curl "https://dashboard.primehubgbr.com/api/plentyone/export/ebay-merkmale.csv?t=<TOKEN>" | head -2
```

**7 · PlentyONE-Importe anlegen** — vier Stück nach §7. Beim Anlegen einer
Zuordnung erst die Datei einmal abrufen lassen, damit PlentyONE die
Spaltennamen kennt.

**7b · Voraussetzungen an jede Variante** — ohne diese drei Punkte kommt kein
Listing zustande. Der Artikelimport liefert sie **nicht** mit; bis das behoben ist,
nach jedem Artikelimport per Varianten-Gruppenfunktion nachziehen:

| Voraussetzung | Wo | Fehlt sie, kommt |
|---|---|---|
| Verkaufskanal **2.00 Ebay** | Variante » Verkaufskanäle | „Es wurden keine Varianten für den Export freigeschaltet.(eBay)“ bei Import 23 |
| Verkaufskanal **2.08 eBay Germany** | dito | dito |
| **Variante aktiv** | Variante » Allgemein » Verfügbarkeit und Sichtbarkeit | derselbe Text — aber erst bei *Market-Listings prüfen*, nicht beim Import |
| **ein Verkaufspreis, den das eBay-Konto sehen darf** | Einstellungen » Verkaufspreise | wieder derselbe Text, wieder bei Import 23 — siehe den Preis-Abschnitt unten |

### Die Verkaufspreise dieses PlentyONE

| ID | Name | Preistyp | Position | eBay-Konten | Inhalt |
|---|---|---|---|---|---|
| 1 | Preis | Standard | 0 | **nein** | Amazon-Preis aus dem Bestandsbericht |
| 2 | UVP | **UVP (RRP)** | 0 | – | steht auf 0. Ein UVP-Preis ist der Streichpreis und **nie** ein Verkaufspreis |
| 4 | B2B-Preis | Standard | – | nein | ungenutzt |
| **7** | **Buchpreisbindung** | Standard | **2** | ja | gebundener Ladenpreis aus dem VLB |
| **8** | **eBay-Preis** | Standard | **3** | ja | freier Preis für Bücher **ohne** Preisbindung |

**Wie PlentyONE den Listing-Preis wählt.** Aus den Verkaufspreisen *der Variante*
bleiben die übrig, die für das eBay-Konto freigegeben sind; davon gewinnt der mit
der **niedrigsten Position**. Deshalb 7 vor 8: ein gebundener Ladenpreis schlägt
immer den freien Preis. Der Festpreis im Market-Listing wird dabei von PlentyONE
gefüllt, nicht von Import 22 — im Mapping von Import 22 steht kein einziger Betrag.
Die Spalte `uvp` ist der Ja/Nein-Schalter „eBay UVP anzeigen“, kein Preis.

> **Position ist global.** Am 04.09.2026 18:47 bekam Verkaufspreis 1 versuchsweise
> die eBay-Konten. Weil er Position 0 hat, gewann er sofort gegen die
> Buchpreisbindung — Artikel 211 wurde mit dem Amazon-Preis gelistet. Bei einem
> preisgebundenen Buch wäre das ein Verstoß gewesen. **Verkaufspreis 1 darf keine
> eBay-Konten haben.** Der Auffang-Preis ist ID 8, weil seine Position hinter 7 liegt.

**Ein Verkaufspreis muss pro Variante einen Wert bekommen.** Ihn in den
Einstellungen anzulegen macht ihn nur auswählbar. Verkaufspreis 7 bekommt seinen
Wert aus dem **Artikelimport**, Spalte `vlb_bpb_preis`. Für ID 8 muss dort die
Amazon-Preisspalte `preis` ein **zweites Mal** gemappt werden, mit dem Zusatz
*Verkaufspreis: eBay-Preis*. Dann trägt jedes Buch beides — und bei gebundenen
Büchern bleibt der Amazon-Preis wirkungslos, weil Position 3 hinter 2 liegt.
Die Kette selbst schreibt **keine** Preise, sie liest sie nur.

> **Was die Fehlermeldung wirklich heißt.** „Es wurden keine Varianten für den
> Export freigeschaltet.(eBay)“ stand am 04.09.2026 für drei verschiedene Dinge:
> fehlender Verkaufskanal (Lauf 59, 37 Zeilen), inaktive Variante (bei der Prüfung,
> MLID 45) und — die Läufe 66–69 mit 4 Zeilen — etwas am Preis.
>
> Was am Preis, ist **nicht abschließend geklärt**. Die naheliegende Erklärung „die
> Variante braucht einen Preis*wert*“ ist widerlegt: Artikel 211 (Variante 1176) hat
> weder Verkaufspreis 7 noch 8, wurde in Lauf 71 aber angelegt — und die Variante
> war seit 16:50 unverändert, also schon während der gescheiterten Läufe im selben
> Zustand. Geändert hatte sich nur eins: um ~18:10 wurde Verkaufspreis 8 als
> **Definition** angelegt, mit eBay-Konten und „Für neue Artikel immer anzeigen“.
> Der Verdacht ist deshalb, dass diese Option der Variante formal eine Preiszeile
> verschafft. Belegt ist das nicht — wer es sauber wissen will, nimmt die Option
> testweise heraus und startet Import 23 für ein Buch ohne Preis.

> Die Artikel-CSV setzt `aktiv = 0` und nur `marktplatz_id = 4.01` (Amazon). Die
> beiden eBay-Kanäle und das Aktiv-Flag fehlen deshalb bei jedem frisch
> importierten Buch. Tückisch ist, dass **dieselbe Meldung** an zwei verschiedenen
> Stellen auftaucht: fehlt der Kanal, scheitert Import 23; fehlt nur das
> Aktiv-Flag, läuft der Import sauber durch und erst die Prüfung meckert.

**8 · Erster Durchlauf** — Import 23, dann Import 22, dann Market-Listings
prüfen, dann Bericht im Dashboard lesen.

**9 · Sichtprüfung** — ein Listing öffnen, alle drei Reiter durchgehen:

| Reiter | Erwartung |
|---|---|
| Base | Verzeichnis Bücher · Dauer Endlos · Festpreis gesetzt · Preis-ID 7 · Versandprofil „Bücher DE" · MwSt-Land Deutschland · Satz 7 % |
| Beschreibung und Layout | Titel ≤ 80 Zeichen · Layout „Bücher" · Anzahl Bilder 1 · Sprache Deutsch |
| Marktplatz | Kategorie „Bücher & Zeitschriften" · Zustand „Neu" · Merkmale Autor / Buchtitel / Sprache |

---

## 11 Änderungsrezepte mit Code

### Regel A — Die JSON ist Ausgabe, nie Quelle

Geändert wird `scripts/gen_ebay_workflow.py`. Danach immer:

```bash
python scripts/gen_ebay_workflow.py && node scripts/test_ebay_workflow.js
```

### Regel B — „Keine Fehler" ist kein Beweis

Zweimal (`versandprofil_id = 6`, `zustand_id = 1`) meldete der Import null Fehler
und schrieb trotzdem einen ungültigen Wert. **Nach jeder neuen Zuordnung ein
Listing öffnen und hinsehen.**

### Regel C — Live-Workflow nachziehen

Der Generator schreibt nur die JSON. Der laufende Workflow ändert sich davon
nicht. Nachziehen per MCP:

```
n8n_update_partial_workflow(
  id = "HYDRm1e5J5nIvJce",
  operations = [{ type: "patchNodeField", nodeName: "Daten holen",
                  fieldPath: "parameters.jsCode",
                  patches: [{ find: "…", replace: "…" }] }])
```

> **Der Live-Code kann von der JSON abweichen** — meist in Kommentaren, weil
> frühere Patches nur einzelne Zeilen ersetzt haben. **Vor jedem Patch den
> Live-Stand holen** (`n8n_get_workflow` mit `mode: "filtered"`,
> `nodeNames: ["Daten holen"]`) und die `find`-Zeichenkette daran ausrichten.
> Ein einzelner nicht gefundener Patch lässt die ganze Operation scheitern —
> immerhin atomar, es wird nichts halb geschrieben.

### Rezept 1 — Festen Wert ändern

Beispiel: Lager von 2 auf 1.

1. `scripts/gen_ebay_workflow.py`, Block `KONFIG`:
   `{"id": "b05", "name": "lagerId", "value": "1", "type": "string"}`
2. `python … && node …`
3. n8n → Knoten *Konfiguration* → `lagerId` auf `1` → **Save**
4. `curl …/ebay-merkmale.csv?t=TOKEN | head -2` — Wert prüfen
5. Import 22 starten
6. Listing öffnen, Base-Reiter ansehen

> Schritt 3 ist kein Doppel: Der Generator setzt nur den *Vorgabewert* in der
> JSON; der laufende Workflow liest aus seinem eigenen Set-Knoten. Wer nur n8n
> ändert, verliert es beim nächsten Generatorlauf. Wer nur den Generator ändert,
> merkt live nichts.

### Rezept 2 — Neues eBay-Merkmal (kein PlentyONE-Eingriff)

Beispiel: „Verlag". Die Spalten `Name`/`Wert` sind bereits zugeordnet — ein
Merkmal mehr ist nur ein Listeneintrag mehr.

```javascript
// 1) KONFIG
{"id": "a19", "name": "verlagEigenschaftId", "value": "12", "type": "string"},

// 2) DATEN, bei den anderen relations-Schleifen
const verlagByVar = {};
for (const rel of relations) {
  if (rel.propertyId === Number(cfg.verlagEigenschaftId) && rel.values && rel.values[0]) {
    verlagByVar[rel.targetId] = rel.values[0].value || '';
  }
}

// 3) in der marketListings-Schleife
const verlag = aufMaxKuerzen(verlagByVar[ml.variationId]);

// 4) Name UND Wert an derselben Position erweitern
bRows.push([ml.id,
            'Autor,Buchtitel,Sprache,Verlag',
            autor + ',' + titel + ',' + cfg.sprache + ',' + verlag]
  .concat(ZUSATZ.map(z => z[1]))
  .concat([ebayTitel(titelRoh)]).join('\t'));
```

Pflicht: `aufMaxKuerzen` (entfernt Kommas, kappt bei 65). Fehlt der Wert bei
manchen Büchern, entscheiden: durchlassen oder wie beim Autor nach
`uebersprungen` schieben, damit es im Bericht steht.

Dann bauen, testen, Live-Workflow patchen, Import 22, Listing ansehen. **In
PlentyONE ist nichts zu tun.**

### Rezept 3 — Neue Listing-Einstellung (neue Spalte + Zuordnung)

```javascript
// ZUSATZ ergänzen
['zolltarif', cfg.zolltarif || '49019900'],
// KONFIG ergänzen
{"id": "b13", "name": "zolltarif", "value": "49019900", "type": "string"},
```

Spaltenanzahl im Test anheben. Bauen, testen, live patchen. **Dann in PlentyONE**
Import 22 → Zuordnung → *ZUORDNUNG HINZUFÜGEN* → Quellspalte `zolltarif`,
Zielfeld `Market-Listing-Eigenschaft » Wert`, rechts die Eigenschaft.

> **In Wellen von höchstens drei Spalten arbeiten.** Danach Import und
> Sichtprüfung. Sonst ist bei einem Fehler unklar, welcher Wert schuld war.
> Genau so wurden die zwölf Einstellungen gefunden.

### Rezept 4 — Textregeln

| Stellschraube | Ort |
|---|---|
| Länge je Merkmalswert | `const MAX = 65` |
| Länge des eBay-Titels | `const EBAY_TITEL_MAX = 80` |
| Autorentrenner | `split(/;\| and \| & /)` |
| Marketing-Anhang | `t.search(/\s[\|–—]\s\|\s-\s/)` |
| Satzende-Schwelle | `satz >= 55` |
| Füllwörter am Ende | Wortliste in `ebayTitel` |

### Rezept 5 — eBay ändert Anforderungen

| Fall | Erkennung | Weg |
|---|---|---|
| neues Pflichtmerkmal | Prüfung schlägt fehl, Bericht rot mit MLIDs | Meldung im Listing lesen → Rezept 2 |
| Wert nicht mehr gültig | „ungültige Auswahl" im Listing | neuen Code suchen → Rezept 1 |
| neue Kategorie | Entscheidung | `kategorieId` ändern, Merkmale prüfen, **an einem Listing testen** |

### Rezept 6 — Anderer Bestand

Neuer Prefix (`XY-`) → **keine Änderung**, das Muster nimmt 2–4 Großbuchstaben.
Anderes Schema → `variantenMuster` anpassen (n8n **und** Generator).
Testlauf mit wenigen Büchern → `variantenPrefix` setzen, danach wieder leeren.

---

## 12 Fallstricke und Werkzeugnotizen

Damit die nächste Sitzung sie nicht noch einmal findet:

| Falle | Was passiert | Ausweg |
|---|---|---|
| Heredoc mit `\t` über das Bash-Werkzeug | Tabs werden zerlegt | `Write`-Werkzeug benutzen |
| Python-Heredoc mit deutschen Anführungszeichen (`„ "`) | Parserfehler | `Write` oder Unicode-Escapes |
| Sehr langes Heredoc | `ENAMETOOLONG: uv_spawn` | `Write`-Werkzeug |
| `/tmp/...` in Python unter Windows | `FileNotFoundError` | Scratchpad-Pfad verwenden |
| Nicht-Raw-Python-String mit `\t` | wird zum echten Tab, `find` schlägt fehl | `r"""…"""` |
| `copy()` in `setTimeout` (Browser-Konsole) | `copy is not defined` | direkt aufrufen |
| PlentyONE-Dropdowns | keine `<option>`-Elemente, nicht in `.cdk-overlay-container` | Werte vom Bildschirm ablesen |
| `n8n_update_partial_workflow` | ein fehlender `find` lässt alles scheitern | vorher Live-Stand holen |
| Konsolenausgabe unter Windows | `cp1252` zerstört Umlaute in `print` | in Datei schreiben, dann `cat` |
| **Offener n8n-Tab beim MCP-Patch** | "Test Workflow" führt die im Browser geladene Fassung aus, nicht die gespeicherte — der Lauf rechnet mit altem Code, und ein Klick auf Save überschreibt den Patch | **Nach jedem MCP-Patch: n8n-Tab neu laden**, vor dem Testen im Code-Knoten stichprobenartig nachsehen |

**Projektregel:** Claude liest n8n-Workflows normalerweise nur. Für dieses
Projekt hat der Nutzer ausdrücklich Schreibrechte erteilt
(`mcp__n8n__n8n_update_partial_workflow` steht in `.claude/settings.local.json`).
Ohne diese Erlaubnis gilt: Anleitung schreiben, nicht selbst schreiben.

---

> **Den Code-Knoten „Daten holen" aktualisieren.** Nicht aus
> `docs/plentyone-ebay-workflow.json` herauskopieren — dort steht er als
> JSON-String mit `
`-Escapes, und beim Versuch landete am 06.09.2026 die
> ganze Datei im Feld `jsCode`. Stattdessen **`docs/ebay-daten-holen.js`**
> öffnen, alles markieren, in n8n ins JavaScript-Feld einfügen. Beide Dateien
> erzeugt `python scripts/gen_ebay_workflow.py` aus derselben Quelle.

## 12a Der Bericht-Webhook

Der Knopf „Aktualisieren" im Dashboard ruft `POST /api/plentyone/ebay/bericht/starten`
auf; die Route stösst `N8N_EBAY_BERICHT_URL` mit dem Header `x-primehub-token` an
und wartet nicht. n8n antwortet sofort, rechnet weiter und meldet das Ergebnis über
`Bericht senden` an `/api/plentyone/ebay/bericht`. Das Dashboard pollt derweil bis
zu zwei Minuten auf einen Bericht mit neuerem Zeitstempel.

Im Workflow hängt daran: `Webhook Bericht` (POST, Pfad `ebay-bericht`) →
`Antwort Bericht` → `Modus bericht Abruf` → `Konfiguration`.

> **Warum ein eigener Respond-Knoten.** „Sofort antworten" (onReceived) genügt nicht:
> Sobald irgendwo im Workflow ein *Respond to Webhook*-Knoten steht — hier
> `CSV ausliefern` — verlangt n8n, dass **jeder** Webhook einen benutzt, sonst
> bricht der Lauf mit *„Unused Respond to Webhook node found in the workflow"* ab
> (belegt 06.09.2026, Lauf 373738).

Die Token-Prüfung hängt seither an `vonWebhook`, nicht mehr an der Betriebsart:
`Modus listings`, `Modus merkmale` und `Modus bericht Abruf` setzen `true`,
`Modus bericht` (Zeitplan und Handstart) setzt `false`. Wer einen dieser Knoten
anfasst, muss das Feld mitführen — fehlt es, ist der jeweilige Webhook ungeschützt.

### Bild-Guard

eBay lehnt jedes Angebot ohne Bild ab: *„kein Artikelbild vorhanden" (Code 0)* —
belegt am 06.09.2026 an MLID 110, Artikel 255, dem einzigen Buch des Testlaufs
mit `vlb_status = KEIN_TREFFER`. Ohne VLB-Treffer gibt es kein Cover, und ohne
Cover kein Listing.

Entscheidung des Nutzers: **solche Titel werden gar nicht erst angeboten.** Die
Kette hält sie aus CSV A heraus und nennt sie im Bericht unter *Übersprungen*
(Zähler `ohne_bild`). Kein Platzhalterbild, kein Amazon-Bild.

#### Bilder hängen an der Variante, nicht am Artikel

Der Guard las anfangs `/rest/items?with=texts,images` — und **`images` ist an
`/rest/items` keine gültige Relation.** Der Aufruf lieferte einfach kein
Bildfeld, der Guard fiel auf „nicht prüfbar" und hat vom 07.09.2026 an *kein
einziges Buch geprüft*. Im Bericht stand durchgehend:

```
ACHTUNG: Die Artikelbilder liessen sich nicht lesen - der Bild-Guard konnte nicht pruefen.
```

Weil ein nicht prüfbarer Guard nach der Hausregel nichts filtert, fiel der
Ausfall nicht als fehlende Ware auf, sondern nur als Warnzeile — die man
überliest. Richtig ist:

```
GET /rest/items/variations?with=images   →  bildByVar[variationId] = images.length
```

PlentyONE verlinkt Bilder an der Variante. Das ist auch die sachlich richtige
Ebene: gelistet wird die Variante, und nur was an ihr hängt, sieht eBay. Geprüft
wird deshalb die Hauptvariante des Artikels (`varByItem[itemId].variationId`).

#### Wenn nicht geprüft werden kann

| `bildPruefung` | Auslöser | Verhalten |
|---|---|---|
| `nicht_moeglich` | REST-Aufruf scheitert | nichts gefiltert, Bericht **rot** |
| `kein_feld` | keine Variante meldet ein Bildfeld | nichts gefiltert, Bericht **rot** — Relationsname prüfen |
| `ok` | Bildlisten lesbar | es wird gefiltert |

Dasselbe Muster wie beim Preis- und GPSR-Guard: lieber ein roter Bericht als ein
stilles Wegfallen des Sortiments. Der Zustand `kein_feld` ist neu und trennt die
beiden Ursachen — bei der alten Fassung sahen „Route kaputt" und „Relation heißt
anders" im Bericht identisch aus, was die Fehlersuche zwei Tage gekostet hat.

## 12b Die Market-Listing-Prüfung im Stapel

**Die Prüfung ist Pflicht, nicht Kür.** Ein Market-Listing ohne bestandene Prüfung
lässt sich nicht starten — „Listings starten" läuft dann durch, ohne dass ein
Angebot entsteht (belegt am 06.09.2026 durch einen Fehlklick auf 46 Listings).

**Die Oberfläche schafft nur acht.** Markiert man mehr, meldet PlentyONE sofort
„Die Gruppenfunktion wurde auf 46 Market-Listings erfolgreich angewendet" — und
tut nichts. Erkennbar ist der Unterschied an der Spalte **Einstellgebühr**: sie
wird von eBays `VerifyAddItem` zurückgeliefert. Steht dort 0,42 €, wurde wirklich
geprüft; ist sie leer, hat eBay nie geantwortet.

### Der Aufruf

Die Gruppenfunktion ist kein REST-Endpunkt (`/rest/listings/markets/{id}/verify`
liefert 503), sondern die interne GWT-Brücke `POST /plenty/api/ui.php`,
Body `application/x-www-form-urlencoded` mit einem Feld `request`:

```json
{"requests":[{
  "_dataName": "ItemListingGroupAction",
  "_moduleName": "item/listing/group_action",
  "_searchParams": {}, "_validateParams": {}, "_dataArray": {},
  "_writeParams": { "marketListingId": "64,65,66,67" },
  "_commandStack": [{ "type": "write", "command": "write" }],
  "_dataList": { "ItemListingGroupActionRunValidation": {
    "_dataName": "ItemListingGroupActionRunValidation",
    "_moduleName": "item/listing/group_action",
    "_writeParams": {}, "_searchParams": {}, "_dataArray": {}, "_dataList": {} } }
}], "meta": { "id": 5, "token": "<Sitzungs-Nonce>" }}
```

`marketListingId` ist eine Komma-Liste beliebiger Länge — der Server nimmt 46 an
und antwortet `affectedRows: 46`, arbeitet aber nur kleine Mengen wirklich ab.
**Ein Authorization-Header ist nicht nötig**, der Sitzungs-Cookie
`SID_PLENTY_ADMIN_<Mandant>` genügt. Er ist HttpOnly, also aus JavaScript nicht
lesbar — `credentials: 'include'` schickt ihn trotzdem mit.

### Was funktioniert

Vier IDs je Aufruf, 30 Sekunden Pause, aus der Browser-Konsole des angemeldeten
PlentyONE-Tabs. 46 Listings in zwölf Stapeln, rund sieben Minuten, alle geprüft.
**Durchsatz etwa 400 Listings pro Stunde** — für 2.000 Bücher gut fünf Stunden.

Das Skript steht in `docs/ebay-pruefung-stapel.js`. Vor dem Lauf `von`/`bis` auf
den MLID-Bereich setzen (kleinste und größte MLID aus der Tabelle) und in der
Konsole einmal `allow pasting` bestätigen. Der Tab muss offen bleiben.

### Offen für die Automatisierung

Das `meta.token` wechselt je Anfrage; ob der Server es überhaupt prüft, ist
ungetestet. Und ob ein über `POST /rest/login` geholtes Token für `ui.php`
gilt, ebenfalls. Solange das offen ist, läuft die Prüfung aus dem Browser —
nicht aus n8n.

## 13 Bestand aus Amazon FBA und Versand per MCF

Der gesamte physische Bestand liegt bei Amazon FBA. Damit eBay-Mengen stimmen und
eBay-Aufträge von Amazon geliefert werden, laufen zwei Ketten:

```
Amazon-Verkauf → FBA-Bestandsimport (stündlich) → Lager 2 stockNet
   → eBay-Bestandsautomatik (20 min) → Angebot „Nicht mehr vorrätig", zurück bei Bestand

eBay-Verkauf → Auftragsimport (stündlich) → Auftrag in Lager 2, reservedStock +1
   → Status [5] → Flow → Amazon MCF → neutrale Lieferung → Paketnummer (täglich)
```

Schlimmster Fall zwischen Amazon-Verkauf und Ausblenden auf eBay: **rund 80 Minuten**
(60 Bestandsimport + 20 eBay-Abgleich). Bei Menge 1 ist in diesem Fenster ein
Überverkauf möglich; er ist bewusst in Kauf genommen. Kein Bestandspuffer — Puffer 1
würde bei Einzelstücken jedes Angebot ausblenden.

### Die zwei Skalen der Bestandsabhängigkeit

Der wichtigste Stolperstein. **Import und REST zählen unterschiedlich:**

| Bedeutung | Import (CSV) | REST (`/rest/listings`) |
|---|---|---|
| unbeschränkt (mit Abgleich) | 0 | 1 |
| beschränkt (mit Reservierung) | 1 | 2 |
| **beschränkt (ohne Reservierung)** | **2** | **3** |
| unbeschränkt (ohne Abgleich) | 3 | 4 |

Beleg (06.09.2026): Import 23 schrieb `1`, `GET /rest/listings` zeigt bei allen 49
Listings `stockDependenceTypeId: 2`.

Die eBay-Bestandsautomatik und die „Nicht mehr vorrätig"-Option arbeiten **nur** mit
„beschränkt (ohne Reservierung)" — im Import also **2**. Ein `3` im Import wäre
„unbeschränkt ohne Abgleich": keine Automatik, Überverkauf garantiert.

CSV B trägt den Wert seit 06.09.2026 als Spalte `bestandsabhaengigkeit` mit, damit
Import 22 bestehende Listings nachzieht. Zielfeld dort: **Listing » Bestandsabhängigkeits-ID**.

### PlentyONE-Konfiguration

Reihenfolge einhalten — die Read-only-Schalter kommen **vor** der API-Anbindung.

| # | Menü | Einstellung |
|---|---|---|
| 1 | Einrichtung » Waren » Lager » „Amazon FBA-Lager BuchDepot24" | Logistiktyp **Amazon**, Lagertyp **Vertrieb**. „Der Bestand im Reparaturlager ist nicht in den Webshop oder auf andere Portale übertragbar" |
| 2 | dito, neues Lager | „Amazon unverkäuflich", Lagertyp **Reparatur** |
| 3 | Märkte » Amazon » Einstellungen » Tab **Artikeleinstellungen** | Artikelexport **Nein** · Preisänderungen **Keine Übertragung** · Bestandsänderungen **Keine Übertragung** |
| 4 | dito, Tab **Konto** | Verkäufer-ID, Händler-Token, **„Zugriff erlauben"** (SP-API) |
| 5 | dito, Tab **Auftragseinstellungen** » „Versand durch Amazon (FBA)" | Aktiv ☑ · Herkunft **Für alle Aufträge verwendbar** · Lager **2** · Lager für unverkäuflichen Bestand = Lager aus 2 · Warenausgang **Als gebucht markieren** · Bestandsimport **stündlich** |
| 6 | dito, „Rechnung erzeugen" | **VCS plentymarkets** — erst nach Abstimmung mit der PayJoe-Kette. Nummernkreis ohne Leerzeichen |
| 7 | Märkte » eBay » Einstellungen » **Basiseinstellungen** | Bestandsautomatik aktivieren **Ja** |
| 8 | dito, **Kontoeinstellungen** (primehub_gbr) | „Nicht mehr vorrätig-Option nutzen" **Ja** · Bestandspuffer **0** · SCO-Puffer **0** |
| 9 | Einrichtung » **Listings » Warenbestand** | „Angebote automatisch beenden/ausblenden" an · Lager = **nur Lager 2** |
| 10 | Flow Studio | Trigger *Auftragsstatus geändert [5] Freigabe Versand* · Filter *Lager-ID = 2*, *Versand ausschließlich durch FBA = Ja*, *Herkunft ≠ Amazon* · Aktion **Multichannel > Amazon > Versandfreigabe an FBA erteilen** |
| 11 | Märkte » eBay » Konto » Versandprofile | „Bücher DE": Bearbeitungszeit ≥ 2–3 Werktage — Paketnummern kommen nur täglich |

An den Varianten ist **nichts** zu tun: der Artikelimport setzt Hauptlager 2,
WB-Beschränkung, die FBA-Flags und die Amazon-SKU bereits (`src/lib/plentyone-mapping.ts`).

### Was der Bericht dazu sagt

Lesezugriff 8 im Knoten *Daten holen*:
`GET /rest/stockmanagement/warehouses/{cfg.lagerId}/stock` → Felder `variationId`,
`stockNet`, `stockPhysical`, `reservedStock`, `updatedAt`.

| Zahl | Bedeutung |
|---|---|
| `bestand_kaufbar` | Buch-Listings mit `stockNet > 0` |
| `bestand_null` | Listings mit Bestand 0 — **Normalfall**, macht nie rot |
| `bestand_alter_min` | Minuten seit dem letzten FBA-Import (jüngstes `updatedAt`) |

Zwei Schalter in *Konfiguration*: `bestandUeberwachung` (`N` informativ, `Y` macht
veralteten oder unlesbaren Bestand rot) und `bestandMaxAlterMin` (Vorgabe 120).

Dasselbe Muster wie beim Preis- und Bild-Guard: **nicht prüfbar heißt melden, nicht
filtern.** Ein unlesbares Lager hält kein Buch zurück und zählt kein Buch als
ausverkauft — es macht den Bericht rot.

### Grenzen

| Punkt | Stand |
|---|---|
| Überverkaufsfenster ~80 min | akzeptiert; im Pilot messen. MCF ohne Bestand scheitert → eBay-Auftrag stornieren |
| Paketnummern nur 1× täglich | eBay erfährt den Versand verzögert; Bearbeitungszeit im Versandprofil ausgleichen |
| FBA-**Aufträge** kommen täglich per Bericht | senkt das Überverkaufsfenster **nicht** — das schnellste Signal bleibt der stündliche Bestandsimport |
| „Beim FBA-Bestandsimport werden nur Einzelartikel berücksichtigt" | Bücher sind Einzelartikel, unkritisch |
| Update bestehender Listings über Import 22 | ob das Listing-Feld über die MLID aktualisiert wird, ist **unbestätigt** — sonst 49 Listings löschen und über Import 23 neu anlegen |

## 13b Der GPSR-Guard

Seit dem 13.12.2024 gilt die EU-Produktsicherheitsverordnung (GPSR, VO 2023/988).
**Art. 19** verlangt in *jedem* Fernabsatz-Angebot Name, Postanschrift und
E-Mail-Adresse des Herstellers. Bücher haben keine Bereichsausnahme — deshalb
führt das VLB die Felder überhaupt. Verstöße sind abmahnfähig; ein dokumentierter
eBay-Fall vom Januar 2026 kostete 1.216,60 €.

### Wo die Daten liegen

Nicht am Artikel, sondern am **Hersteller**: *Einrichtung » Artikel » Hersteller*.
Der Artikelimport kann sie deshalb nicht direkt setzen — die sechs `gpsr_*`-Spalten
der CSV stehen bewusst auf `zielfeld: null` und speisen den separaten
**Hersteller-Import** (Schritt 2 der Einrichtungsliste). Erst danach lässt sich
Spalte 33 `vlb_verlag` auf *Artikel » Hersteller-ID* mappen.

### Was der Guard prüft

Lesezugriff im Knoten *Daten holen*:

| Aufruf | Zweck |
|---|---|
| `GET /rest/items/manufacturers` | Hersteller mit `name`, `street`, `postcode`, `town`, `email`, `countryId` |
| `GET /rest/orders/shipping/countries` | `isoCode2` je `countryId`, um Nicht-EU-Sitze zu erkennen |

Ein Buch wird **zurückgehalten**, wenn der Artikel keinen Hersteller hat oder
dem Hersteller eines der fünf Pflichtfelder fehlt. Der Grund steht im Klartext
in `uebersprungen` und damit im Dashboard:

```
Hersteller "Verlag ohne Kontakt" unvollstaendig, es fehlt: Strasse, PLZ, Ort, E-Mail
kein Hersteller am Artikel - Art. 19 GPSR verlangt Name, Anschrift und E-Mail
```

### Vier Zustände, in denen NICHT gefiltert wird

Dasselbe Muster wie beim Preis- und Bild-Guard: **nicht prüfbar heißt melden,
nicht filtern.** Ein Guard, der bei einer Fehlfunktion stillschweigend alle 2.000
Bücher zurückhält, wäre schlimmer als gar keiner.

| `gpsrPruefung` | Auslöser | Verhalten |
|---|---|---|
| `nicht_moeglich` | REST-Aufruf scheitert | nichts gefiltert, Bericht **rot** |
| `keine_hersteller` | kein Hersteller angelegt | nichts gefiltert, Bericht **rot** — der Hersteller-Import fehlt |
| `kein_feld` | kein Artikel meldet `manufacturerId` | nichts gefiltert, Bericht **rot** — Feldname prüfen |
| `keine_zuordnung` | Hersteller da, aber kein Artikel zeigt darauf | nichts gefiltert, Bericht **rot** — Mapping-Zeile `vlb_verlag` fehlt |
| `ok` | alles lesbar | es wird gefiltert |

`gpsrPruefung === 'ok'` geht in die `ok`-Bewertung des Berichts ein. Solange der
Hersteller-Import nicht gelaufen ist, ist der Bericht also rot — das ist gewollt
und die einzige sichtbare Bremse vor einem abmahnbaren Livegang.

### Hersteller außerhalb der EU

Sitzt der Hersteller nicht in der EU, verlangt Art. 19 **zusätzlich** eine
verantwortliche Person *in* der EU (Art. 16 GPSR / Art. 4 VO 2019/1020). Wer das
ist, hängt am Bezugsweg: Wer bei einem deutschen Großhändler kauft, ist selbst
Händler und nennt den vorhandenen Einführer — wer direkt importiert, wird selbst
zum Einführer und müsste seinen Namen sogar physisch am Produkt anbringen.

Das kann der Guard nicht entscheiden. Er **zählt** solche Bücher deshalb nur
(`gpsr_ausserhalb_eu`) und schreibt einen Hinweis in den Bericht, statt sie zu
filtern. Relevant ist das bei Schweizer Verlagen — Diogenes, Zürich war 2 von 50
Testtiteln — und bei den wenigen englischsprachigen Titeln, die das VLB ohnehin
nicht führt.

Scheitert `/rest/orders/shipping/countries`, entfällt allein diese Zusatzprüfung;
der Rest des Guards läuft weiter.

### Laufende Listings — die zweite Hälfte des Guards

Der Filter beim Bau von CSV A greift nur für Bücher, die **noch kein** Listing
haben. Die Schleife überspringt alles andere:

```js
if (itemsMitMarketListing.has(it.id)) continue;   // ← bestehende Listings raus
...
if (!gpsrOk(it)) { ... }                          // ← so weit kommt es nie
```

Damit wäre der Guard blind für genau die Angebote, die *schon online* sind —
und nur die können abgemahnt werden. Am 07.09.2026 zeigte der erste Lauf
`ohne_gpsr: 0` bei `ohne_listing: 0`: der Guard hatte über null Bücher gearbeitet.

Deshalb prüft der Bericht **zusätzlich** jedes bestehende Market-Listing gegen
die Herstellerdaten. Zurückhalten geht dort nicht mehr, also landet der Fund
unter `probleme` (mit MLID) statt unter `uebersprungen`, und der Bericht wird rot:

```
LIVE ohne Herstellerangabe (Art. 19 GPSR) - Hersteller zuordnen oder Listing beenden
LIVE mit unvollstaendigem Hersteller: Verlag ohne Kontakt - es fehlt: Strasse, PLZ, Ort
```

Auch hier gilt die Grundregel: Ist `gpsrPruefung` nicht `ok`, wird **kein**
laufendes Listing angeschwärzt. Sonst stünden bei einem REST-Ausfall schlagartig
alle 2.000 Angebote als abmahnbar da.

Den vierten Zustand hat der Praxisfall vom 07.09.2026 erzwungen: Der Bericht
meldete 50 laufende Listings einzeln als abmahnbar, dabei war schlicht die
Zuordnung nicht gepflegt — im Artikelimport stand die Zeile `vlb_verlag` noch
auf *Import = AUS*. Ein Einrichtungsfehler gehört in **eine** Meldung, nicht in
fünfzig; beim Vollimport wären es zweitausend gewesen. Die beiden Diagnosezahlen
`gpsr_hersteller` und `gpsr_zugeordnet` trennen die drei Fälle auf einen Blick:

| `gpsr_hersteller` | `gpsr_zugeordnet` | Diagnose |
|---|---|---|
| 0 | 0 | Hersteller-Import fehlt |
| > 0 | 0 | Mapping-Zeile `vlb_verlag` → *Artikel » Hersteller-ID* fehlt |
| > 0 | > 0 | gepflegt — Einzelmeldungen sind echte Befunde |

Der Bericht nennt zusätzlich die ersten drei Hersteller mit ID und Namen, damit
sich prüfen lässt, ob REST dieselben sieht wie die Oberfläche.

### Zahlen im Bericht

| Schlüssel | Bedeutung |
|---|---|
| `gpsr_hersteller` / `gpsr_zugeordnet` | Diagnose: Hersteller vorhanden / Artikel zugeordnet |
| `ohne_gpsr` | **zurückgehalten** — kommt gar nicht erst in CSV A |
| `listings_ohne_gpsr` | **läuft bereits** ohne vollständige Herstellerangabe — beenden oder nachpflegen |
| `gpsr_ausserhalb_eu` | Hersteller außerhalb der EU (neue und laufende) — EU-Verantwortlichen klären |

---

## 13c Rechnungen für eBay

Eingerichtet am 08./09.09.2026. **Der Testkauf steht noch aus** — bis dahin ist die
Kette gebaut, aber nicht bewiesen.

### Warum eBay der einfachere Fall ist

Bei Amazon rät PlentyONE den Steuersatz, wenn der Artikel im System fehlt: von 50
Auftragspositionen trugen 34 den Normalsatz (19 % DE / 20 % AT) statt 7 % / 10 %,
weil erst 50 der rund 2.000 Bücher importiert sind. Nachweisbar mit
`node scripts/plentyone-auftrag.mjs`.

Bei eBay kann das nicht passieren. **Ein eBay-Listing existiert nur zu einem Artikel,
der in PlentyONE liegt** — die Auftragsposition findet ihre Variante also immer, und
der Satz kommt aus deren `vatId`. Alle 49 Varianten stehen auf `vatId 1`.

> `vatId` ist keine Prozentzahl, sondern die **Position** in der Steuertabelle des
> Mandanten (`GET /rest/vat`): DE 0 = 19 %, 1 = 7 %; AT 0 = 20 %, 1 = 10 %.
> Dieselbe Falle wie bei den Verkaufspreisen.

### Der Flow

*Automation » Flow Studio* → `eBay: Rechnung erzeugen und an Käufer senden`

| | |
|---|---|
| Auslöser | Ereignisauswahl **Zahlungsstatus**, Status **Vollständig** |
| Ausführungsmodus | Ein Flow pro Objekt |
| „Flow verfügbar in" | **leer** — das Feld fügt den Flow nur als manuell auslösbare Gruppenfunktion in der Auftrags-UI hinzu; genau so entstand die fehlerhafte Rechnung 50000 |
| Filter | **Herkunft · Ist in (IN) · 2.08 \| eBay Germany** |
| Aktion 1 | Dokument erstellen → **Rechnung**, Reaktion auf Fehler: *Fehler-Event auslösen* |
| Aktion 2 | E-Mail senden → Vorlage `[61] eBay: Ihre Rechnung`, Empfänger **Kunde** |
| Aktion 3 | Tag **21 „Rechnung erzeugt"** |

**Der Herkunftsfilter ist die wichtigste Zeile.** Ohne ihn greift der Flow auch auf
Amazon-Aufträge — die erreichen ebenfalls den Zahlungsstatus „Vollständig" — während
dort noch die alte Ereignisaktion läuft. Ergebnis wären doppelte Rechnungen mit
geratenem Steuersatz.

Das zweite, leere `Vorlage`-Feld in der E-Mail-Aktion ist **kein Anhangfeld**, sondern
eine Wiederholung für weitere Vorlagen an weitere Empfänger. Die Rechnung hängt in der
EmailBuilder-Vorlage `[61]` selbst.

### Vorlage und Nummernkreis — wo das definiert wird

Der Flow-Schritt „Dokument erstellen" kennt **keine Vorlagenauswahl**. Welche Vorlage
greift, entscheidet sich in der Vorlage selbst:

*Einrichtung » Dokumente » DocumentBuilder* → Vorlage → **Auftragseinstellungen**:
Sprache, Mandant/Standort, **Herkunft**, Zahlungsart, **Lieferland**, Netto/Brutto,
Kundenklasse.

**Jede Auswahl dort ist eine Einschränkung, kein Freischalten.** Im Zweifel leer lassen.
Stünde unter Herkunft nur Amazon, bekäme ein eBay-Auftrag keine Rechnung.

Der **Nummernkreis hängt am Dokumenttyp**, nicht am Marktplatz — mit „Rechnung" kommt er
automatisch. eBay läuft deshalb im selben Kreis weiter (Stand 09.09.2026: bis 50024).
Die Kreise selbst: *Einrichtung » Dokumente » Nummernkreise*.

### Lieferland: nicht einschränken, auch nicht auf Deutschland

`GET /rest/orders/shipping/countries` zeigt **nur DE mit `active=1`**, alle anderen 0 —
auch Österreich. Das ist folgenlos: Die Rechnungen 50000, 50020 und 50024 gingen nach
Österreich (`countryVatId 2`), obwohl das Land inaktiv ist. Das Kennzeichen steuert
Auswahllisten und den eigenen Shop, nicht Marktplatzaufträge.

Würde man dort Deutschland auswählen, bekäme ein eBay-Verkauf nach Österreich **keine**
Rechnung mehr. Feld leer lassen.

### Kein Rechnungsupload zu eBay

Bewusst verworfen. Die eBay-Funktion „Rechnung senden" / „Zahlungsinformationen senden"
ist eine **Zahlungsaufforderung**, keine steuerliche Rechnung zum Download. Für Amazon
existiert ein dedizierter Upload („Amazon IDU"), für eBay ist kein Gegenstück
dokumentiert. Ein Eigenbau über die eBay-API wäre neue Prozesslogik und brächte
gegenüber der E-Mail nichts — der Käufer hat das PDF im Postfach, und genau das
verspricht das Listing-Layout.

### Amazon läuft ohne Flow — und ist von der 1.10.-Frist nicht betroffen

Die Amazon-Rechnungen entstehen **nativ in der Marktanbindung**, über die Einstellung
*Einrichtung » Märkte » Amazon » Einstellungen* → „Rechnung erzeugen" = **VCS
plentymarkets**. Weder Flow noch Aktionsmanager sind daran beteiligt. Der Abschalttermin
des Aktionsmanagers (1.10.2026) trifft die Amazon-Fakturierung deshalb nicht, und es gibt
nichts zu migrieren.

Das erklärt die Beobachtung vom 08.09.2026 besser als die zunächst vermutete Kopplung an
den Zahlungsstatus: **11 der 12 automatisch erzeugten Rechnungen gehörten zu Aufträgen mit
VCS-Steuerdaten.** Die native Anbindung fakturiert, wenn Amazon die Steuerdaten geliefert
hat — und genau deshalb war keine dieser Rechnungen falsch.

Für eBay gibt es kein Gegenstück; dort ist der Flow aus diesem Abschnitt der Weg.

> Der Aktionsmanager wird trotzdem am 1.10.2026 abgeschaltet. Falls dort noch **andere**
> Automatisierungen liegen, müssen die vorher nach Flow. Für die Rechnungsstellung ist
> nichts zu tun.

### Prüfen

```
node scripts/plentyone-auftrag.mjs      Steuersatz und Artikelzuordnung
node scripts/plentyone-zahlungen.mjs    Zahlung erfasst (paidAmount)
node scripts/plentyone-rechnungen.mjs   Rechnungen, manuelle ausgeblendet
```

Basiswerte vor dem Testkauf (09.09.2026 00:18): **2.674 Aufträge, alle `104.01`
(Amazon), null eBay, höchste Rechnungsnummer 50024.** Daran lässt sich hinterher
belegen, was der Testkauf verursacht hat — und dass Amazon unberührt blieb.

Faustregel beim Draufschauen: Trägt der Positionsname ein SKU-Präfix in eckigen Klammern
(`[APR-4567-04-08-2026] Titel`), kennt PlentyONE den Artikel **nicht**. Bei zugeordneten
Positionen steht dort der eigene Artikelname.

---

## 13d Die fünf Flows: von der Zahlung bis zum Paket

Eingerichtet am 09.09.2026. **Alle noch ungetestet** — der Testkauf steht aus.

Die Kette hängt an einem Befund, den kein Handbuch hergibt: **eBay-Aufträge kommen mit
Status [3] „Warten auf Zahlung" an**, nicht mit [5]. Das steht im Market-Listing unter
*Auftragsstatus* und ist der Grund, warum es Flow 1 überhaupt gibt — ohne ihn erreichte
kein Auftrag je die Versandfreigabe.

```
eBay-Kauf → Auftragsabruf (stündlich, holt Auftrag + Managed-Payments-Zahlung)
  → Flow 1: Zahlung vollständig        → Status [5]
  → Flow 2: Status [5]                 → Versandfreigabe an Amazon FBA
  → Amazon liefert neutral verpackt
  → Paketnummer (täglich) → Warenausgang gebucht → eBay sieht „versendet"
  → Flow 3: Warenausgang gebucht       → Rechnung + E-Mail + Tag 21
```

| # | Name | Auslöser | Aktionen |
|---|---|---|---|
| 1 | eBay: Versandfreigabe nach Zahlung | Zahlungsstatus **Vollständig** | Auftragsstatus → **[5]** |
| 2 | eBay: Versand über Amazon MCF | Auftragsstatus geändert → **[5]** | Multichannel » Amazon » **Versandfreigabe an FBA erteilen** |
| 3 | eBay: Rechnung an Käufer | **Warenausgang gebucht** | Rechnung · E-Mail `[61]` · Tag 21 |
| 4 | eBay: Fehler bei Auftragsaktion | **Allgemeiner Fehler bei Auftragsaktion** | Auftragsnotiz · Tag `Prüfen` |
| 5 | eBay: liegengebliebene Aufträge | **zeitgesteuert**, täglich | Suche + Notiz + Tag (Storno erst nach Trockenlauf) |

**Jeder Flow filtert auf Herkunft `2.08 eBay Germany`.** Ohne diese Zeile greifen sie auch
auf die 2.674 Amazon-Aufträge — bei Flow 2 wäre das ein zweites echtes Paket, bei Flow 5
ein Storno gültiger Verkäufe.

Filter von Flow 2 vollständig: *Lager-ID & Lagertyp* = Lager 2 + **Warenausgang** ·
*Versand ausschließlich durch FBA* = Ja · *Herkunft* = 2.08.

### Warum die Rechnung am Warenausgang hängt, nicht an der Zahlung

Ursprünglich sollten Rechnung und Statuswechsel in einem Flow laufen. Die Trennung ist
besser: Wird ein Auftrag storniert, **bevor** Amazon liefert, existiert gar keine Rechnung
— also braucht es keine Gutschrift und keine Korrektur in der Buchhaltung. Der Fall
wickelt sich ohne steuerliche Spuren ab.

Preis der Trennung: Die Rechnung hängt jetzt daran, dass Status [7] eintritt. Bleibt der
Warenausgang aus, gibt es keine Rechnung — dann ist aber auch die Ware nicht unterwegs,
und eBay zeigt „nicht versendet". Der Fehler fällt also ohnehin auf.

### Flow 5 und die Mängelquote

`Kaufabbruch auf eBay starten` existiert als Aktion, ebenso `eBay-Rückerstattung
veranlassen` und `eBay-Nachricht senden`. Trotzdem storniert Flow 5 vorerst **nicht**:

> „Wenn Sie einen Kauf abbrechen, erhalten Sie einen Mangelvermerk — unabhängig davon, ob
> Sie den Artikel nicht mehr vorrätig haben." Zulässig sind **2 %** (Mindeststandard) und
> **0,5 %** (Verkäufer mit Top-Bewertung).

Bei 200 Verkäufen ist ein einziger Storno bereits 0,5 %. Ein Tippfehler im Suchfilter
würde reihenweise gültige Verkäufe wegwerfen, und ein Kaufabbruch ist nicht rückholbar.
Deshalb erst eine Woche Trockenlauf mit Notiz und Tag; erst wenn die Suche nachweislich
die richtigen (bei ruhendem Betrieb: **keine**) Aufträge trifft, kommen Nachricht,
Kaufabbruch und Status [8] dazu.

`eBay-Rückerstattung veranlassen` bleibt bewusst draußen — bei Managed Payments erstattet
der Kaufabbruch vermutlich selbst. Beim ersten echten Fall prüfen, sonst zahlt man zweimal.

### Das Suche-Element (Flow 5)

Ein zeitgesteuerter Auslöser kennt keine Objekte und bietet deshalb keine Filter. Die
Objekte beschafft das Steuerelement **Suche**:

| Feld | Wert | Warum |
|---|---|---|
| Typ | Auftragssuche | |
| Sortieren nach | **Auftragsdatum, aufsteigend** | älteste zuerst — sonst trifft das Limit die falschen |
| Ergebnislimit | 25 | Sicherheitsnetz |
| Verwendung | **Nur mit Suchergebnissen dieser Aktion fortfahren** | sonst kämen Objekte von außen dazu |
| Bei keinem Ergebnis | **Flow-Ausführung abbrechen** | nichts gefunden heißt nichts zu tun |
| Filter | Herkunft 2.08 · Status [5] · **Auftragseingangsdatum (Tage) < -2** | |

Zur Datumsskala: negative Zahl = Vergangenheit, gezählt in **Kalendertagen**. „Ist kleiner"
ist exklusiv, `< -2` trifft also ab dem dritten Kalendertag. Bewusst konservativ — ein
Auftrag von gestern 23:00 Uhr wäre heute schon „-1", real aber erst zehn Stunden alt.
Mit `< -2` hatte Amazon garantiert zwei volle Paketnummern-Zyklen.

### Was PlentyONE beim MCF nicht kann

Getestet und belegt, damit es niemand erneut sucht:

- **Keine Versandgeschwindigkeit.** Die Flow-Aktion hat außer der Fehlerbehandlung keine
  Felder. Es gilt Amazons Standard (2–3 Werktage).
- **Kein Carrier.** JTL schreibt dasselbe: „Sie haben keinen Einfluss darauf, mit welchem
  Versanddienstleister der Auftrag verschickt wird." Die Steuerung sitzt bei Amazon, nicht
  in der Warenwirtschaft — `BLOCK_AMZL` gibt es nur in Seller Central, und es schließt
  lediglich Amazon Logistics aus, ohne DHL zu garantieren. Kostet Aufpreis und erhöht die
  Quote verspäteter Sendungen; **nicht aktiviert**.
- **Neutrale Verpackung** ist bei MCF Standard, kostenlos, automatisch. Der Käufer sieht
  Amazon also ohnehin nicht auf dem Karton.
- Die Felder *Amazon Versandeinstellungen » Transportservice/Versandservice* im
  Versandprofil sind eine **Carrier-Liste für den Gegenweg** (Selbstversand eines
  Amazon-Auftrags), nicht für MCF.

### Versandprofil „eBay Bücher DE" (ID 8)

| Feld | Wert | Warum |
|---|---|---|
| Auftragsherkunft | nur eBay | Amazon behält sein eigenes Profil |
| Bei neuen Artikeln aktivieren | **an** | sonst beim Vollimport 2.000-mal Handarbeit |
| Paketstation / Postfiliale | **aus** | Amazon wählt den Carrier; nur DHL bedient eine DHL-Packstation. Trifft es Hermes oder DPD, geht die Sendung als unzustellbar zurück |
| Expressversand | **aus** | MCF Standard hält kein Express-Versprechen |
| Lieferfrist (Tage) | **2** | Paketnummern kommen nur täglich — ohne Puffer wird die Sendungsnummer strukturell zu spät hochgeladen |
| Pauschales Porto | 0,00 | bei eBay versandkostenfrei; Marktplatzaufträge bringen den Betrag ohnehin mit |

### Rückmeldung an eBay

*Einrichtung » Märkte » eBay » Einstellungen » Tab Basiseinstellungen* →
**„Versand- und Zahlungsmarkierung setzen"**. Meldet Versand und Paketnummer an eBay,
sobald der Warenausgang gebucht ist. Ohne diesen Schalter sieht der Käufer nie ein
„versendet", egal wie sauber der Rest läuft.

Reserve, falls das nicht greift: die Flow-Aktion `Versandbestätigung an eBay senden`.

---

## 14 Offene Punkte

Stand 06.09.2026, nach dem Testlauf mit 50 Büchern (49 Listings, alle geprüft).

### Erledigt und bewusst so belassen

| Punkt | Entscheidung |
|---|---|
| **Verkaufskanäle 2.00 + 2.08** | über `markt_aktiv` → *Märkte » Aktiv* im Artikelimport, zweimal zugeordnet. Am 06.09.2026 an neu angelegten Artikeln von Hand nachgeprüft — die Kanäle stehen. Die Gruppenfunktion entfällt |
| **`aktiv` kommt als 0** aus *plentyone-metadata* | Zielfeld *Varianten » Aktiv* wird stattdessen aus `verfuegbarkeit` (konstant 1) gespeist. Zulässig, weil nur der Bericht der aktiven Angebote hochgeladen wird. Die Ursache im Workflow bleibt **absichtlich** unbehoben |
| **Stapelvorlage „Bücher (1)"** | überflüssig, Import 22 setzt alle 13 Felder selbst. Nach dem Vollimport löschen |
| **Bücher ohne Cover** | werden nicht gelistet (§12c). eBay verlangt ein Bild, ein Buch ohne VLB-Treffer hat keines |
| **Tokens rotieren** | entfällt — `PLENTYONE_EXPORT_TOKEN` und `N8N_EBAY_TOKEN` werden ohnehin erneuert |

### Noch zu tun

| Punkt | Stand |
|---|---|
| **Zeitpläne scharf schalten** | Die vier Importe stehen auf Handstart. Für den echten Zyklus: Artikelimport 02:00, Eigenschaftsimport 02:30, Import 23 um 03:00, Import 22 um 04:00. **Erinnerung an den Nutzer eingeplant** |
| **Vollimport ~2.000 Bücher** | bisher 49 Listings gebaut und geprüft |
| **Lager-ID 2** | zeigt laut API auf „Amazon FBA-Lager BuchDepot24"; prüfen, ob das für eBay-Versand richtig ist oder Lager 1 („Sales") gehört |
| **Testkauf über eBay** | Fuenf Flows (§13c, §13d) sind gebaut, aber unbewiesen. Ein eigener Kauf am aktiven Testlisting muss zeigen: Auftrag mit Herkunft 2.08 · Artikel verknuepft · **7 %** · Zahlung erfasst · Status [5] · MCF-Auftrag in Seller Central · Folgetag Paketnummer, Status [7], eBay „versendet" · Rechnung + PDF im Postfach — und Amazon unveraendert |
| **Flow 5 scharf schalten** | Erst nach einer Woche Trockenlauf: eBay-Nachricht, Kaufabbruch, Status [8] ergaenzen. Vorher pruefen, dass die Suche bei ruhendem Betrieb **keine** Auftraege trifft |
| **Aktionsmanager vor dem 1.10.2026 räumen** | Nur falls dort noch Automatisierungen liegen. Die **Rechnungsstellung ist nicht betroffen** — Amazon fakturiert nativ über die Marktanbindung, eBay über den Flow aus §13c |

### Verbesserung für später — Prüfung aus n8n statt aus dem Browser

Heute läuft die Market-Listing-Prüfung über `docs/ebay-pruefung-stapel.js` in der
Browser-Konsole des angemeldeten PlentyONE-Tabs: vier IDs je Aufruf, 30 Sekunden
Pause, rund 400 Listings pro Stunde. Bei 2.000 Büchern sind das gut fünf Stunden,
in denen der Tab offen bleiben muss. Bewusste Entscheidung — es funktioniert, und
der Aufwand für die Automatisierung lohnt sich noch nicht.

Wer es später doch angeht, braucht drei Antworten:

1. **Gilt ein Token aus `POST /rest/login` auch für `/plenty/api/ui.php`?** Der
   Browser schickt den Sitzungs-Cookie `SID_PLENTY_ADMIN_<Mandant>`; ob die
   REST-Anmeldung ein gleichwertiges Token liefert, ist ungetestet.
2. **Prüft der Server `meta.token` überhaupt?** Der Wert wechselt je Anfrage.
   Ein fest eingetragener älterer Wert lief durch — das spricht dafür, dass er
   ignoriert wird, ist aber kein Beweis.
3. **Wo genau liegt die Mengengrenze?** Der Server nimmt 46 IDs an und meldet
   `affectedRows: 46`, arbeitet aber nur kleine Mengen wirklich ab. Vier gehen
   sicher, acht laut Oberfläche auch. Dazwischen ist ungetestet.

Sind die drei geklärt, wäre es ein Schleifen-Knoten im bestehenden Workflow —
angestossen vom selben Bericht-Webhook, der schon existiert. Der Aufruf selbst
steht vollständig in §12b.
