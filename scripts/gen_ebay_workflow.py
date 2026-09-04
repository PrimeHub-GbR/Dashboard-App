"""Erzeugt den n8n-Workflow "eBay-Dateien und Kontrolle (PrimeHub)".

    python scripts/gen_ebay_workflow.py   ->  docs/plentyone-ebay-workflow.json

Der Workflow hat drei Eingaenge und einen gemeinsamen Rechenweg:

    Webhook  ebay-listings  ->\
    Webhook  ebay-merkmale  -> Konfiguration -> Zugang pruefen -> Login
    Zeitplan 05:00          ->/                                    -> Daten holen
    Manuell starten         ->/                                       -> CSV ausliefern
                                                                      -> Bericht senden

Aenderungen bitte HIER machen und neu generieren, nicht im erzeugten JSON.
Zugangsdaten stehen als Platzhalter drin - der Nutzer traegt sie nach dem Import
im Knoten "Konfiguration" bzw. in n8n-Credentials ein. Keine Secrets im Repo.

Import in n8n: Workflows -> Import from File -> docs/plentyone-ebay-workflow.json
Anleitung: docs/n8n-plentyone-ebay-anleitung.md
"""
import io
import json

ZIEL = "docs/plentyone-ebay-workflow.json"

# ---------------------------------------------------------------------------
# Code-Bausteine
# ---------------------------------------------------------------------------

MODUS = """// Betriebsart festlegen und den Webhook-Token mitnehmen.
const kopf = %s;
return [{ json: { modus: '%s', token: kopf } }];
"""

MODUS_WEBHOOK = "($('%s').first().json.headers || {})['x-primehub-token'] || ''"

ZUGANG = r"""// Webhook-Abrufe brauchen den gemeinsamen Token. Der Zeitplan laeuft ohne.
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
"""

DATEN = r"""// eBay-Dateien und Kontrollbericht aus PlentyONE bauen.
//
// CSV A  ebay_listing_erstellung.csv  -> PlentyONE Import 23 (legt Listings an)
// CSV B  ebay_merkmale.csv            -> PlentyONE Import 22 (Autor/Buchtitel/Sprache)
// Bericht                             -> Dashboard /api/plentyone/ebay/bericht
//
// Beide CSVs werden bei JEDEM Abruf frisch gerechnet: A enthaelt nur Artikel ohne
// Listing, B nur bereits existierende MLIDs. Dadurch ist die Kette idempotent und
// das Zwei-Lauf-Problem (MLID entsteht erst nach der Listing-Anlage) faellt weg.

const cfg = $('Konfiguration').first().json;
const modus = $('Zugang pruefen').first().json.modus;
const login = $('PlentyONE Login').first().json;
const token = login.accessToken || (login.data && login.data.accessToken);
if (!token) throw new Error('Kein Login-Token von PlentyONE erhalten - Passwort im Knoten "Konfiguration" pruefen.');

const api = async (path) => {
  return await this.helpers.httpRequest({
    method: 'GET',
    url: cfg.plentyUrl + path,
    headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' },
    json: true,
  });
};

const pageAll = async (base) => {
  const sep = base.includes('?') ? '&' : '?';
  const all = [];
  for (let p = 1; p <= 400; p++) {
    const res = await api(`${base}${sep}page=${p}&itemsPerPage=250`);
    const entries = res.entries || [];
    all.push(...entries);
    if (res.isLastPage || entries.length === 0) break;
  }
  return all;
};

// 1) Artikel mit Titeln  (with=itemTexts wirft 500 - with=texts ist der richtige Weg)
const items = await pageAll('/rest/items?with=texts');
const titelByItem = {};
for (const it of items) {
  const t = (it.texts || []).find(x => x.lang === 'de') || (it.texts || [])[0];
  titelByItem[it.id] = t ? (t.name1 || '') : '';
}

// 2) Varianten - Hauptvariante je Artikel
const variations = await pageAll('/rest/items/variations');
const varByItem = {};
const itemByVar = {};
for (const v of variations) {
  if (v.isMain === false && varByItem[v.itemId]) continue;
  varByItem[v.itemId] = { variationId: v.id, number: v.number || '' };
  itemByVar[v.id] = v.itemId;
}

// 3) Vorhandene Listings und Market-Listings (MLIDs + Pruefstatus)
const listings = await pageAll('/rest/listings');
const itemsMitListing = new Set(listings.map(l => l.itemId));
const marketListings = await pageAll('/rest/listings/markets');

// 4) Autoren aus den VLB-Eigenschaften
const relations = await pageAll('/rest/v2/properties/relations?with=values');
const autorByVar = {};
for (const rel of relations) {
  if (rel.propertyId === Number(cfg.autorEigenschaftId) && rel.values && rel.values[0]) {
    autorByVar[rel.targetId] = rel.values[0].value || '';
  }
}

// 5) Preis-Guard: Buchpreisbindungspreis (Verkaufspreis-ID 7) je Variante.
//    Laesst sich die Preisliste nicht lesen, wird NICHT stillschweigend gefiltert -
//    stattdessen sagt der Bericht, dass die Pruefung nicht moeglich war.
let preisPruefung = 'ok';
const preisByVar = {};
try {
  const mitPreis = await pageAll('/rest/items/variations?with=variationSalesPrices');
  let gefunden = 0;
  for (const v of mitPreis) {
    const liste = v.variationSalesPrices || v.salesPrices || [];
    if (!Array.isArray(liste)) continue;
    const treffer = liste.find(p => Number(p.salesPriceId) === Number(cfg.bpbPreisId));
    if (treffer) {
      preisByVar[v.id] = Number(treffer.price) || 0;
      gefunden++;
    }
  }
  if (!gefunden) preisPruefung = 'keine_preise_gefunden';
} catch (e) {
  preisPruefung = 'nicht_moeglich';
}
const preisOk = (variationId) => {
  if (preisPruefung !== 'ok') return true;          // nicht pruefbar -> nicht blockieren, aber melden
  return Number(preisByVar[variationId] || 0) > 0;
};

// --- Textregeln des Import 22 (empirisch ermittelt, verbindlich) -------------
// eBay begrenzt JEDEN Merkmalswert auf 65 Zeichen - nicht nur den Buchtitel.
// Ein Sammelband mit 25 Uebersetzern sprengt das Autorenfeld sonst sofort.
const MAX = 65;

const aufMaxKuerzen = (roh) => {
  let t = (roh || '').replace(/,/g, '').replace(/\t/g, ' ').replace(/\s+/g, ' ').trim();
  if (t.length > MAX) {
    const cut = t.slice(0, MAX + 1);
    const i = cut.lastIndexOf(' ');
    t = cut.slice(0, i > 30 ? i : MAX).replace(/[\s|,;:\-–—·]+$/, '').trim();
  }
  return t;
};

// "Nachname, Vorname" -> "Vorname Nachname"; Trenner sind ";", " and " und " & ".
const autorUmformen = (roh) => {
  const teile = String(roh || '')
    .split(/;| and | & /)
    .map(a => { const p = a.split(','); return p.length === 2 ? (p[1].trim() + ' ' + p[0].trim()) : a.trim(); })
    .map(a => a.replace(/,/g, ' ').replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  if (!teile.length) return '';
  // So viele vollstaendige Namen wie in 65 Zeichen passen - lieber zwei richtige
  // Autoren als ein abgeschnittener Name.
  const genommen = [];
  for (const a of teile) {
    if (genommen.concat(a).join('; ').length > MAX) break;
    genommen.push(a);
  }
  return genommen.length ? genommen.join('; ') : aufMaxKuerzen(teile[0]);
};

const titelKuerzen = (roh) => aufMaxKuerzen(roh);

// Buch-Artikel erkennen: Die Migration vergibt Variantennummern nach dem Schema
// <PREFIX>-<nr>-<tt-mm-jjjj>. Der Prefix ist NICHT immer "APR-" - im Amazon-Bestand
// kommen APR, MAR, PH, FE, BL, JA, SC, SM, MB und MAE vor. Ein reiner APR-Filter
// wuerde ueber die Haelfte des Sortiments stumm liegen lassen (gepruefte Zahlen:
// 901 von 2048 Zeilen tragen APR-). Deshalb entscheidet das MUSTER, nicht der Prefix.
// cfg.variantenPrefix bleibt als zusaetzliche Einschraenkung fuer Testlaeufe leer.
const muster = new RegExp(cfg.variantenMuster || '^[A-Z]{2,4}-.+-[0-9]{2}-[0-9]{2}-[0-9]{4}$');
const istBuch = (itemId) => {
  const v = varByItem[itemId];
  if (!v) return false;
  const nr = String(v.number || '');
  if (cfg.variantenPrefix && !nr.startsWith(cfg.variantenPrefix)) return false;
  return muster.test(nr);
};

// --- CSV A: Buch-Artikel OHNE Listing (Import 23) ----------------------------
const aRows = ['ItemID\tMarketID\tUserID\tTypeID\tStockDependenceTypeID\tUnitCombinationID\tDirectoryID\tEnabled\tDuration'];
const ohnePreis = [];
let aCount = 0;
for (const it of items) {
  if (!istBuch(it.id)) continue;
  if (itemsMitListing.has(it.id)) continue;
  const v = varByItem[it.id];
  if (!preisOk(v.variationId)) {
    // Buchpreisbindung: ohne gebundenen Ladenpreis entsteht erst gar kein Listing.
    ohnePreis.push({ item_id: it.id, titel: String(titelByItem[it.id] || '').slice(0, 90),
                     grund: 'kein Buchpreisbindungspreis (Verkaufspreis ' + cfg.bpbPreisId + ')' });
    continue;
  }
  aRows.push([it.id, cfg.marketId, cfg.userId, cfg.typeId, cfg.stockDependenceTypeId,
              cfg.unitCombinationId, cfg.directoryId, cfg.enabled, cfg.duration].join('\t'));
  aCount++;
}

// --- CSV B: Merkmale je Market-Listing (Import 22) ---------------------------
// Eine Zeile pro MLID - jede Zeile ersetzt den KOMPLETTEN Merkmalsatz des Listings.
// Zusatzspalten: das, was bisher die Stapel-Vorlage gesetzt hat. Jede Spalte wird in
// Import 22 auf "Market-Listing-Eigenschaft >> Wert" (bzw. Listing-Eigenschaft)
// gemappt, rechts daneben die passende Eigenschaft. Die Werte sind fuer alle Zeilen
// gleich und stehen im Knoten "Konfiguration" - siehe Screenshot des fertigen
// Listings MLID 1 (Dirty Diana), von dem sie abgelesen sind.
const ZUSATZ = [
  ['kategorie_id',     cfg.kategorieId     || '261186'], // Kategorie-ID 1
  ['versandprofil_id', cfg.versandprofilId || '6'],      // Versandprofil-ID (Frontend "Buecher DE")
  ['zustand_id',       cfg.zustandId       || '1'],      // eBay-Zustands-ID ("Neu")
  ['layout_id',        cfg.layoutId        || '1'],      // Layout-Vorlagen-ID ("Buecher")
  ['lager_id',         cfg.lagerId         || '2'],      // Lager-ID (FBA)
  ['mwst',             cfg.mwst            || '7'],      // Mehrwertsteuersatz
  ['sprache_code',     cfg.spracheCode     || 'de'],     // Sprache
  ['uvp',              cfg.uvpUebertragen  || '0'],      // eBay UVP uebertragen
  ['preisvorschlag',   cfg.preisvorschlag  || '0'],      // eBay-Preisvorschlag
  ['bilder',           cfg.anzahlBilder    || '1'],      // Anzahl der Bilder
  // "An Artikelpreis binden" ist ein JA/NEIN-Feld, NICHT die Verkaufspreis-ID.
  // Mit '7' quittiert PlentyONE jede Zeile mit
  //   "Use Item Price invalid. | ( UpdateListingMarket )"  (Import-Lauf 45, 11 Fehler).
  // cfg.bpbPreisId (7) bleibt dem Preis-Guard vorbehalten - nicht wiederverwenden.
  ['preisbindung',     cfg.preisbindungWert || '1'],
];
const bRows = [['MLID', 'Name', 'Wert'].concat(ZUSATZ.map(z => z[0])).join('\t')];
const uebersprungen = [];
const probleme = [];
let bCount = 0;
let geprueftOk = 0;
let geprueftFehler = 0;
let buchListings = 0;

for (const ml of marketListings) {
  const itemId = itemByVar[ml.variationId];
  if (!itemId || !istBuch(itemId)) continue;
  buchListings++;

  const titelRoh = titelByItem[itemId];
  if (ml.verified === 'succeeded') geprueftOk++;
  else if (ml.verified === 'failed') {
    geprueftFehler++;
    probleme.push({ mlid: ml.id, item_id: itemId, titel: String(titelRoh || '').slice(0, 90),
                    grund: 'Pruefung in PlentyONE fehlgeschlagen' });
  }

  const autor = autorUmformen(autorByVar[ml.variationId]);
  const titel = titelKuerzen(titelRoh);
  if (!autor || !titel) {
    uebersprungen.push({ mlid: ml.id, item_id: itemId, titel: String(titelRoh || '').slice(0, 90),
                         grund: [!autor ? 'kein Autor' : null, !titel ? 'kein Titel' : null].filter(Boolean).join(', ') });
    continue;
  }
  bRows.push([ml.id, 'Autor,Buchtitel,Sprache', autor + ',' + titel + ',' + cfg.sprache]
    .concat(ZUSATZ.map(z => z[1])).join('\t'));
  bCount++;
}

// --- Bericht -----------------------------------------------------------------
const zahlen = {
  artikel: items.length,
  ohne_listing: aCount,
  listings: buchListings,
  geprueft_ok: geprueftOk,
  geprueft_fehler: geprueftFehler,
  merkmale: bCount,
  ohne_bpb_preis: ohnePreis.length,
};

const preisHinweis = preisPruefung === 'ok'
  ? null
  : (preisPruefung === 'nicht_moeglich'
      ? 'Die Verkaufspreise liessen sich nicht lesen - der Preis-Guard konnte nicht pruefen. Vor dem Start von Hand kontrollieren.'
      : 'Kein einziger Buchpreisbindungspreis gefunden - vermutlich stimmt die Verkaufspreis-ID nicht.');

const text = [
  'eBay-Kontrolle ' + new Date().toISOString().slice(0, 16).replace('T', ' ') + ' (UTC)',
  '',
  'Artikel in PlentyONE: ' + zahlen.artikel,
  'Buch-Artikel ohne Listing (Import 23): ' + zahlen.ohne_listing,
  'eBay-Listings gesamt: ' + zahlen.listings + '  (geprueft ok ' + geprueftOk + ', fehlgeschlagen ' + geprueftFehler + ')',
  'Merkmal-Zeilen (Import 22): ' + zahlen.merkmale,
  'Ohne Buchpreisbindungspreis zurueckgehalten: ' + zahlen.ohne_bpb_preis,
  preisHinweis ? '' : null,
  preisHinweis ? 'ACHTUNG: ' + preisHinweis : null,
  uebersprungen.length ? '' : null,
  uebersprungen.length ? 'UEBERSPRUNGEN:' : null,
  ...uebersprungen.slice(0, 100).map(u => '  MLID ' + u.mlid + ' (Artikel ' + u.item_id + '): ' + u.grund),
].filter(x => x !== null).join('\n');

const ok = geprueftFehler === 0 && ohnePreis.length === 0 && preisPruefung === 'ok';

const koerper = JSON.stringify({
  ok,
  zahlen,
  probleme: probleme.slice(0, 500),
  uebersprungen: uebersprungen.concat(ohnePreis).slice(0, 500),
  text,
});

const inhalt = modus === 'listings' ? aRows.join('\n')
             : modus === 'merkmale' ? bRows.join('\n')
             : text;

return [{ json: { modus, inhalt, koerper, zahlen, ok } }];
"""

# ---------------------------------------------------------------------------
# Knoten
# ---------------------------------------------------------------------------

KONFIG = {
    "assignments": {"assignments": [
        {"id": "a01", "name": "plentyUrl", "value": "https://p74746.my.plentysystems.com", "type": "string"},
        {"id": "a02", "name": "benutzer", "value": "Tempnutzer", "type": "string"},
        {"id": "a03", "name": "passwort", "value": "HIER-TEMPNUTZER-PASSWORT-EINTRAGEN", "type": "string"},
        {"id": "a04", "name": "webhookToken", "value": "HIER-DEN-WERT-VON-N8N_EBAY_TOKEN-EINTRAGEN", "type": "string"},
        {"id": "a05", "name": "dashboardBericht", "value": "https://dashboard.primehubgbr.com/api/plentyone/ebay/bericht", "type": "string"},
        {"id": "a06", "name": "dashboardToken", "value": "HIER-DEN-WERT-VON-PLENTYONE_EXPORT_TOKEN-EINTRAGEN", "type": "string"},
        {"id": "a07", "name": "variantenMuster", "value": "^[A-Z]{2,4}-.+-[0-9]{2}-[0-9]{2}-[0-9]{4}$", "type": "string"},
        {"id": "a07b", "name": "variantenPrefix", "value": "", "type": "string"},
        {"id": "a08", "name": "sprache", "value": "Deutsch", "type": "string"},
        {"id": "a09", "name": "autorEigenschaftId", "value": "10", "type": "string"},
        {"id": "a10", "name": "bpbPreisId", "value": "7", "type": "string"},
        {"id": "a11", "name": "marketId", "value": "1008", "type": "string"},
        {"id": "a12", "name": "userId", "value": "10", "type": "string"},
        {"id": "a13", "name": "typeId", "value": "2", "type": "string"},
        {"id": "a14", "name": "stockDependenceTypeId", "value": "1", "type": "string"},
        {"id": "a15", "name": "unitCombinationId", "value": "1", "type": "string"},
        {"id": "a16", "name": "directoryId", "value": "1", "type": "string"},
        {"id": "a17", "name": "enabled", "value": "Y", "type": "string"},
        {"id": "a18", "name": "duration", "value": "GTC", "type": "string"},
        # --- Werte, die bisher die Stapel-Vorlage "Buecher (1)" gesetzt hat.
        # Am 04.09.2026 vom fertigen Listing MLID 1 (Dirty Diana) abgelesen.
        # Sicher: Kategorie, Versandprofil, Layout, Lager, Preisbindung.
        # Noch zu bestaetigen: zustandId, mwst, spracheCode (siehe Spec, offene Punkte).
        {"id": "b01", "name": "kategorieId", "value": "261186", "type": "string"},
        {"id": "b02", "name": "versandprofilId", "value": "6", "type": "string"},
        {"id": "b03", "name": "zustandId", "value": "1", "type": "string"},
        {"id": "b04", "name": "layoutId", "value": "1", "type": "string"},
        {"id": "b05", "name": "lagerId", "value": "2", "type": "string"},
        {"id": "b06", "name": "mwst", "value": "7", "type": "string"},
        {"id": "b07", "name": "spracheCode", "value": "de", "type": "string"},
        {"id": "b08", "name": "uvpUebertragen", "value": "0", "type": "string"},
        {"id": "b09", "name": "preisvorschlag", "value": "0", "type": "string"},
        {"id": "b10", "name": "anzahlBilder", "value": "1", "type": "string"},
        # "An Artikelpreis binden" = Ja/Nein. Die Verkaufspreis-ID 7 steckt in bpbPreisId.
        {"id": "b11", "name": "preisbindungWert", "value": "1", "type": "string"},
    ]},
    "includeOtherFields": True,
    "options": {},
}

NOTIZ = """## eBay-Dateien und Kontrolle

**Drei Eingaenge, ein Rechenweg**

1. `GET /webhook/ebay-listings` -> liefert `ebay_listing_erstellung.csv` (PlentyONE **Import 23**)
2. `GET /webhook/ebay-merkmale` -> liefert `ebay_merkmale.csv` (PlentyONE **Import 22**)
3. Zeitplan 05:00 -> schickt den Statusbericht ans Dashboard

Beide Webhooks verlangen den Header `x-primehub-token`. Das Dashboard setzt ihn,
PlentyONE ruft nie direkt hier an, sondern immer ueber `/api/plentyone/export/...`.

**Einmalig eintragen** (Knoten *Konfiguration*): Passwort des REST-Benutzers *Tempnutzer*,
`webhookToken` (= `N8N_EBAY_TOKEN`) und `dashboardToken` (= `PLENTYONE_EXPORT_TOKEN`).

Eingebaute Regeln: Autor "Vorname Nachname", kommafreie Werte, Buchtitel <= 65 Zeichen,
eine Zeile pro MLID, kein Listing ohne Buchpreisbindungspreis (Verkaufspreis-ID 7).
"""


def node(name, ntype, tv, pos, params, **extra):
    n = {
        "parameters": params,
        "id": name.lower().replace(" ", "-").replace(".", "")[:36],
        "name": name,
        "type": ntype,
        "typeVersion": tv,
        "position": pos,
    }
    n.update(extra)
    return n


def verbinde(*ziele):
    return [{"node": z, "type": "main", "index": 0} for z in ziele]


nodes = [
    node("Anleitung", "n8n-nodes-base.stickyNote", 1, [-1120, -160],
         {"content": NOTIZ, "height": 520, "width": 420}),

    node("Webhook Listings", "n8n-nodes-base.webhook", 2, [-640, 60],
         {"path": "ebay-listings", "httpMethod": "GET", "responseMode": "responseNode"},
         webhookId="ebay-listings"),
    node("Webhook Merkmale", "n8n-nodes-base.webhook", 2, [-640, 240],
         {"path": "ebay-merkmale", "httpMethod": "GET", "responseMode": "responseNode"},
         webhookId="ebay-merkmale"),
    node("Zeitplan 05:00", "n8n-nodes-base.scheduleTrigger", 1.2, [-640, 420],
         {"rule": {"interval": [{"field": "cronExpression", "expression": "0 5 * * *"}]}}),
    node("Manuell starten", "n8n-nodes-base.manualTrigger", 1, [-640, 580], {}),

    node("Modus listings", "n8n-nodes-base.code", 2, [-400, 60],
         {"jsCode": MODUS % (MODUS_WEBHOOK % "Webhook Listings", "listings")}),
    node("Modus merkmale", "n8n-nodes-base.code", 2, [-400, 240],
         {"jsCode": MODUS % (MODUS_WEBHOOK % "Webhook Merkmale", "merkmale")}),
    node("Modus bericht", "n8n-nodes-base.code", 2, [-400, 500],
         {"jsCode": MODUS % ("''", "bericht")}),

    node("Konfiguration", "n8n-nodes-base.set", 3.4, [-160, 280], KONFIG),
    node("Zugang pruefen", "n8n-nodes-base.code", 2, [60, 280], {"jsCode": ZUGANG}),

    node("PlentyONE Login", "n8n-nodes-base.httpRequest", 4.2, [280, 280], {
        "method": "POST",
        "url": "={{ $('Konfiguration').first().json.plentyUrl }}/rest/login",
        "sendBody": True,
        "bodyParameters": {"parameters": [
            {"name": "username", "value": "={{ $('Konfiguration').first().json.benutzer }}"},
            {"name": "password", "value": "={{ $('Konfiguration').first().json.passwort }}"},
        ]},
        "options": {"timeout": 60000},
    }, retryOnFail=True, maxTries=2, waitBetweenTries=3000),

    node("Daten holen", "n8n-nodes-base.code", 2, [500, 280], {"jsCode": DATEN}),

    node("Bericht oder CSV", "n8n-nodes-base.if", 2.2, [720, 280], {
        "conditions": {
            "options": {"caseSensitive": True, "leftValue": "", "typeValidation": "strict", "version": 2},
            "conditions": [{
                "id": "modus-bericht",
                "leftValue": "={{ $json.modus }}",
                "rightValue": "bericht",
                "operator": {"type": "string", "operation": "equals"},
            }],
            "combinator": "and",
        },
        "options": {},
    }),

    node("Bericht senden", "n8n-nodes-base.httpRequest", 4.2, [960, 180], {
        "method": "POST",
        "url": "={{ $('Konfiguration').first().json.dashboardBericht }}",
        "sendHeaders": True,
        "headerParameters": {"parameters": [
            {"name": "Content-Type", "value": "application/json"},
            {"name": "Authorization", "value": "=Bearer {{ $('Konfiguration').first().json.dashboardToken }}"},
        ]},
        "sendBody": True, "contentType": "raw", "rawContentType": "application/json",
        "body": "={{ $json.koerper }}",
        "options": {"timeout": 60000},
    }, retryOnFail=True, maxTries=3, waitBetweenTries=3000),

    node("CSV ausliefern", "n8n-nodes-base.respondToWebhook", 1.1, [960, 380], {
        "respondWith": "text",
        "responseBody": "={{ $json.inhalt }}",
        "options": {"responseHeaders": {"entries": [
            {"name": "Content-Type", "value": "text/csv; charset=utf-8"},
        ]}},
    }),
]

connections = {
    "Webhook Listings": {"main": [verbinde("Modus listings")]},
    "Webhook Merkmale": {"main": [verbinde("Modus merkmale")]},
    "Zeitplan 05:00": {"main": [verbinde("Modus bericht")]},
    "Manuell starten": {"main": [verbinde("Modus bericht")]},
    "Modus listings": {"main": [verbinde("Konfiguration")]},
    "Modus merkmale": {"main": [verbinde("Konfiguration")]},
    "Modus bericht": {"main": [verbinde("Konfiguration")]},
    "Konfiguration": {"main": [verbinde("Zugang pruefen")]},
    "Zugang pruefen": {"main": [verbinde("PlentyONE Login")]},
    "PlentyONE Login": {"main": [verbinde("Daten holen")]},
    "Daten holen": {"main": [verbinde("Bericht oder CSV")]},
    "Bericht oder CSV": {"main": [verbinde("Bericht senden"), verbinde("CSV ausliefern")]},
}

workflow = {
    "name": "eBay-Dateien und Kontrolle (PrimeHub)",
    "nodes": nodes,
    "connections": connections,
    "settings": {"executionOrder": "v1", "callerPolicy": "workflowsFromSameOwner"},
    "active": False,
}

io.open(ZIEL, "w", encoding="utf-8", newline="\n").write(
    json.dumps(workflow, indent=2, ensure_ascii=False) + "\n"
)
print("geschrieben:", ZIEL, "-", len(nodes), "Knoten")
