"""Erzeugt den n8n-Workflow "eBay-Dateien und Kontrolle (PrimeHub)".

    python scripts/gen_ebay_workflow.py   ->  docs/plentyone-ebay-workflow.json

Der Workflow hat drei Eingaenge und einen gemeinsamen Rechenweg:

    Webhook  ebay-listings  ->\
    Webhook  ebay-merkmale  -> Konfiguration -> Zugang pruefen -> Login
    Webhook  ebay-bericht   ->/   (Dashboard-Knopf "Aktualisieren")
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
ZIEL_JS = "docs/ebay-daten-holen.js"

# ---------------------------------------------------------------------------
# Code-Bausteine
# ---------------------------------------------------------------------------

MODUS = """// Betriebsart festlegen und den Webhook-Token mitnehmen.
// vonWebhook entscheidet in "Zugang pruefen", ob ein Token verlangt wird -
// Zeitplan und Handstart laufen ohne, jeder Abruf von aussen nicht.
const kopf = %s;
return [{ json: { modus: '%s', token: kopf, vonWebhook: %s } }];
"""

MODUS_WEBHOOK = "($('%s').first().json.headers || {})['x-primehub-token'] || ''"

ZUGANG = r"""// Webhook-Abrufe brauchen den gemeinsamen Token. Der Zeitplan laeuft ohne.
const cfg = $('Konfiguration').first().json;
const d = $input.first().json;
if (d.vonWebhook) {
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

// 1) Artikel mit Titeln.
//    with=itemTexts wirft 500 - with=texts ist der richtige Weg. Bilder kommen
//    hier NICHT mit, die haengen an der Variante (siehe Abschnitt 2b).
const items = await pageAll('/rest/items?with=texts');
const titelByItem = {};
for (const it of items) {
  const t = (it.texts || []).find(x => x.lang === 'de') || (it.texts || [])[0];
  titelByItem[it.id] = t ? (t.name1 || '') : '';
}

// 1b) Hersteller mit GPSR-Kontaktdaten.
//     Art. 19 GPSR verlangt in JEDEM Angebot Name, Anschrift und E-Mail des
//     Herstellers. Fehlt das, ist es abmahnfaehig (dokumentierter eBay-Fall
//     Januar 2026: 1.216,60 EUR). Solche Buecher gar nicht erst listen.
//     In PlentyONE haengen die Daten am Hersteller, nicht am Artikel:
//     Einrichtung > Artikel > Hersteller.
let gpsrPruefung = 'ok';
let hersteller = [];
try {
  hersteller = await pageAll('/rest/items/manufacturers');
} catch (e) {
  gpsrPruefung = 'nicht_moeglich';
}
// Laendercodes, um Hersteller ausserhalb der EU zu erkennen (CH, US, UK).
// Scheitert der Abruf, entfaellt nur diese Zusatzpruefung.
const isoByLand = {};
try {
  for (const c of await pageAll('/rest/orders/shipping/countries')) {
    isoByLand[String(c.id)] = String(c.isoCode2 || '').toUpperCase();
  }
} catch (e) { /* ohne Laenderliste wird nur nicht auf EU geprueft */ }
const EU_LAENDER = ['AT','BE','BG','HR','CY','CZ','DK','EE','FI','FR','DE','GR',
                    'HU','IE','IT','LV','LT','LU','MT','NL','PL','PT','RO','SK',
                    'SI','ES','SE'];
// Umgekehrte Richtung, ISO -> ID. Genau die braucht der Hersteller-Import,
// und sie steht in keiner oeffentlichen Doku - nur im eigenen System.
const idByIso = {};
for (const id of Object.keys(isoByLand)) {
  if (isoByLand[id] && !idByIso[isoByLand[id]]) idByIso[isoByLand[id]] = id;
}
// Die Laender, in denen Buchverlage sitzen. Fehlt eines, ist es in PlentyONE
// nicht als Versandland angelegt - dann faellt es hier auf, statt spaeter im
// Import.
const landIdText = ['DE','AT','CH','GB','US','NL','FR','IT','ES','PL','CZ','DK','SE']
  .map(iso => idByIso[iso] ? iso + '=' + idByIso[iso] : null)
  .filter(x => x !== null).join(', ');
const gpsrById = {};
for (const h of hersteller) {
  const name = String(h.name || '').trim();
  const strasse = String(h.street || '').trim();
  const plz = String(h.postcode || '').trim();
  const ort = String(h.town || '').trim();
  const mail = String(h.email || '').trim();
  const iso = isoByLand[String(h.countryId || '')] || '';
  const fehlt = [name ? null : 'Name', strasse ? null : 'Strasse', plz ? null : 'PLZ',
                 ort ? null : 'Ort', mail ? null : 'E-Mail'].filter(x => x !== null);
  gpsrById[String(h.id)] = {
    name: name || ('Hersteller ' + h.id),
    vollstaendig: fehlt.length === 0,
    fehlt: fehlt.join(', '),
    iso: iso,
    // Sitzt der Hersteller ausserhalb der EU, verlangt Art. 19 zusaetzlich
    // eine verantwortliche Person IN der EU. Das wird gemeldet, nicht
    // gefiltert - wer das ist, klaert der Bezugsweg (Grosshaendler).
    ausserhalbEu: iso !== '' && EU_LAENDER.indexOf(iso) === -1,
  };
}
// Kein einziger Hersteller angelegt? Dann fehlt der Hersteller-Import -
// melden, statt stillschweigend jedes Buch zurueckzuhalten.
if (gpsrPruefung === 'ok' && hersteller.length === 0) gpsrPruefung = 'keine_hersteller';
// Meldet kein einziger Artikel ein Hersteller-Feld, heisst es anders als
// erwartet. Dann NICHT filtern - sonst haelt der Guard schlagartig jedes
// Buch zurueck, obwohl die Hersteller sauber gepflegt sind.
if (gpsrPruefung === 'ok'
    && !items.some(it => it.manufacturerId !== undefined && it.manufacturerId !== null)) {
  gpsrPruefung = 'kein_feld';
}
// Zuordnung Artikel -> Hersteller. Wird zweimal gebraucht: beim Bau von CSV A
// (zurueckhalten) und beim Durchgang durch die bestehenden Listings (melden).
const gpsrByItem = {};
for (const it of items) {
  gpsrByItem[it.id] = gpsrById[String(it.manufacturerId || '')] || null;
}
// Hersteller sind da, aber kein einziger Artikel zeigt darauf? Dann fehlt im
// Artikelimport die Zeile vlb_verlag -> "Artikel >> Hersteller-ID". Das ist ein
// Einrichtungsfehler, kein Befund an tausend Einzelbuechern: EINE Meldung, und
// nichts filtern. Belegt am 07.09.2026, als der Guard 50 laufende Listings
// einzeln anschwaerzte, obwohl schlicht die Zuordnung fehlte.
const gpsrZugeordnet = items.filter(it => gpsrByItem[it.id] !== null).length;
if (gpsrPruefung === 'ok' && gpsrZugeordnet === 0) gpsrPruefung = 'keine_zuordnung';
const gpsrVonItem = (itemId) => gpsrByItem[itemId] || null;
const gpsrVon = (it) => gpsrVonItem(it.id);
const gpsrOk = (it) => {
  if (gpsrPruefung !== 'ok') return true;   // nicht pruefbar -> nicht filtern
  const g = gpsrVon(it);
  return g !== null && g.vollstaendig;
};

// 2) Varianten - Hauptvariante je Artikel
const variations = await pageAll('/rest/items/variations');
const varByItem = {};
const itemByVar = {};
for (const v of variations) {
  if (v.isMain === false && varByItem[v.itemId]) continue;
  varByItem[v.itemId] = { variationId: v.id, number: v.number || '' };
  itemByVar[v.id] = v.itemId;
}

// 2b) Bild-Guard. eBay lehnt jedes Angebot ohne Bild ab ('kein Artikelbild
//     vorhanden', 06.09.2026 an MLID 110); Buecher ohne VLB-Treffer haben kein
//     Cover.
//     Bilder liegen NICHT am Artikel: '/rest/items?with=images' ist keine
//     gueltige Relation, der Aufruf liefert schlicht kein Bildfeld. Genau daran
//     hing der Guard seit dem 07.09.2026 auf 'nicht pruefbar' fest und hat kein
//     einziges Buch geprueft. PlentyONE verlinkt Bilder an der Variante - und
//     das ist ohnehin die richtige Ebene, denn gelistet wird die Variante.
let bildPruefung = 'ok';
const bildByVar = {};
try {
  const mitBild = await pageAll('/rest/items/variations?with=images');
  for (const v of mitBild) {
    const liste = v.images || v.variationImages || [];
    bildByVar[v.id] = Array.isArray(liste) ? liste.length : 0;
  }
  // Meldet kein einziger Datensatz ein Bildfeld, heisst die Relation wieder
  // anders. Dann NICHT filtern - sonst haelt der Guard schlagartig jedes Buch
  // zurueck, obwohl alle Cover sauber haengen.
  if (!mitBild.some(v => Array.isArray(v.images) || Array.isArray(v.variationImages))) {
    bildPruefung = 'kein_feld';
  }
} catch (e) {
  bildPruefung = 'nicht_moeglich';
}
const bildOk = (itemId) => {
  if (bildPruefung !== 'ok') return true;   // nicht pruefbar -> nicht filtern
  const v = varByItem[itemId];
  return !!v && Number(bildByVar[v.variationId] || 0) > 0;
};

// 3) Vorhandene Listings und Market-Listings (MLIDs + Pruefstatus)
const listings = await pageAll('/rest/listings');
const itemsMitListing = new Set(listings.map(l => l.itemId));
const marketListings = await pageAll('/rest/listings/markets');

// 3b) Bestand im FBA-Lager (cfg.lagerId) - fuer den Bericht, nie zum Filtern.
//     Amazon fuellt dieses Lager stuendlich (Einrichtung >> Maerkte >> Amazon >>
//     Auftragseinstellungen >> Bestandsimport). Die eBay-Bestandsautomatik uebernimmt
//     den Nettobestand alle 20 Minuten ins Angebot. Hier wird nur gezaehlt und das
//     Alter des letzten Imports gemessen: Bestand 0 ist Normalfall (ausverkauft),
//     ein veralteter Bestand dagegen das Warnsignal, dass die Kette Amazon -> eBay
//     steht und Ueberverkaeufe drohen.
const fbaLagerId = Number(cfg.lagerId || 2);
let bestandPruefung = 'ok';
const bestandByVar = {};
let bestandStand = 0;
try {
  const zeilen = await pageAll('/rest/stockmanagement/warehouses/' + fbaLagerId + '/stock');
  for (const z of zeilen) {
    bestandByVar[z.variationId] = {
      netto: Number(z.stockNet || 0),
      physisch: Number(z.stockPhysical || 0),
      reserviert: Number(z.reservedStock || 0),
    };
    const t = Date.parse(z.updatedAt || '');
    if (t && t > bestandStand) bestandStand = t;
  }
  if (!zeilen.length) bestandPruefung = 'keine_zeilen';
} catch (e) {
  bestandPruefung = 'nicht_moeglich';
}
const bestandAlterMin = bestandStand ? Math.round((Date.now() - bestandStand) / 60000) : 0;
const bestandMaxAlterMin = Number(cfg.bestandMaxAlterMin || 120);
const bestandUeberwacht = String(cfg.bestandUeberwachung || 'N') === 'Y';

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
const preisByVar = {};   // gebundener Ladenpreis (Verkaufspreis 7)
const ersatzByVar = {};  // Verkaufspreis 8 'eBay-Preis' fuer freie Titel
const allePreiseByVar = {};  // nur fuer den Bericht: was liegt ueberhaupt an?
try {
  const mitPreis = await pageAll('/rest/items/variations?with=variationSalesPrices');
  let gefunden = 0;
  for (const v of mitPreis) {
    const liste = v.variationSalesPrices || v.salesPrices || [];
    if (!Array.isArray(liste)) continue;
    // Damit der Bericht sagen kann, welche Verkaufspreis-ID der UVP ist -
    // sonst muesste man sie in PlentyONE suchen.
    allePreiseByVar[v.id] = liste.map(p => Number(p.salesPriceId) + ': ' + Number(p.price).toFixed(2));
    const treffer = liste.find(p => Number(p.salesPriceId) === Number(cfg.bpbPreisId));
    if (treffer) {
      preisByVar[v.id] = Number(treffer.price) || 0;
      gefunden++;
    }
    // Nicht jedes Buch ist preisgebunden: Importtitel und Baende, deren Bindung
    // aufgehoben wurde, haben keinen Verkaufspreis 7. Fuer sie gibt es in
    // PlentyONE den Verkaufspreis 8 'eBay-Preis' (Position 3, nur eBay-Konten).
    // PlentyONE waehlt selbst: Preis 7 wenn vorhanden (Position 2), sonst 8.
    // Deshalb bleibt 'An Artikelpreis binden' immer Y - die Kette muss nur
    // wissen, ob ueberhaupt ein Preis da ist.
    if (cfg.ersatzPreisId) {
      const ers = liste.find(p => Number(p.salesPriceId) === Number(cfg.ersatzPreisId));
      if (ers && Number(ers.price) > 0) ersatzByVar[v.id] = Number(ers.price);
    }
  }
  if (!gefunden) preisPruefung = 'keine_preise_gefunden';
} catch (e) {
  preisPruefung = 'nicht_moeglich';
}
// Ohne Preis entsteht kein Listing: PlentyONE meldet dann 'Es wurden keine
// Varianten fuer den Export freigeschaltet.(eBay)' - dieselbe Meldung wie bei
// fehlendem Verkaufskanal und bei inaktiver Variante (04.09.2026, Laeufe 66-70).
const preisOk = (variationId) => {
  if (preisPruefung !== 'ok') return true;          // nicht pruefbar -> nicht blockieren, aber melden
  return Number(preisByVar[variationId] || 0) > 0
      || Number(ersatzByVar[variationId] || 0) > 0;
};
// nur fuer den Bericht: laeuft das Buch ueber den freien eBay-Preis?
const ueberErsatzpreis = (variationId) =>
  Number(preisByVar[variationId] || 0) <= 0 && Number(ersatzByVar[variationId] || 0) > 0;

// 6) Barcodes - fuer die Sprache. Die ISBN-Gruppe hinter dem 978er-Praefix nennt
//    den Sprachraum. Das ist die einzige verlaessliche Quelle: Titel ohne
//    VLB-Treffer bekommen von der Migration "Deutsch" als Vorgabe eingetragen
//    (vlb_status = KEIN_TREFFER, z. B. APR-13092 'Twelve and a Half',
//    EAN 9780063143791 - eindeutig englisch, im Export aber als Deutsch gefuehrt).
const eanByVar = {};
try {
  const mitBarcode = await pageAll('/rest/items/variations?with=variationBarcodes');
  for (const v of mitBarcode) {
    const liste = v.variationBarcodes || v.barcodes || [];
    if (!Array.isArray(liste)) continue;
    const code = liste.map(b => String(b.code || b.barcode || ''))
                      .find(c => /^97[89][0-9]{10}$/.test(c));
    if (code) eanByVar[v.id] = code;
  }
} catch (e) {
  // Ohne Barcodes bleibt es bei der Vorgabesprache - kein Grund abzubrechen.
}

const SPRACHEN = [
  [/^978[01]/, 'Englisch', 'en'],
  [/^9782/,    'Französisch', 'fr'],
  [/^9783/,    'Deutsch', 'de'],
  [/^97884/,   'Spanisch', 'es'],
  [/^97888/,   'Italienisch', 'it'],
  [/^97890/,   'Niederländisch', 'nl'],
];
const spracheZu = (variationId) => {
  const ean = String(eanByVar[variationId] || '');
  for (const [muster, name, code] of SPRACHEN) {
    if (muster.test(ean)) return [name, code];
  }
  return [cfg.sprache || 'Deutsch', cfg.spracheCode || 'de'];
};

// --- Textregeln des Import 22 (empirisch ermittelt, verbindlich) -------------
// eBay begrenzt JEDEN Merkmalswert auf 65 Zeichen - nicht nur den Buchtitel.
// Ein Sammelband mit 25 Uebersetzern sprengt das Autorenfeld sonst sofort.
const MAX = 65;

// eBay zaehlt BYTES, nicht Zeichen. Ein Umlaut sind zwei, die typografischen
// Anfuehrungszeichen drei. Der Buchtitel
//   "Windstaerke 17: Der Roman nach ›22 Bahnen‹ | Nominiert fuer das"
// hat 61 Zeichen, aber 67 Bytes - eBay wies ihn ab (MLID 31, Fehler 21919308,
// "maximal 65 Zeichen", 04.09.2026). Deutsche Buchtitel liegen fast immer ueber
// ihrer Zeichenzahl, deshalb wird durchgaengig in Bytes gemessen und geschnitten.
const bytes = (s) => {
  let n = 0;
  for (const c of s) {
    const p = c.codePointAt(0);
    n += p < 0x80 ? 1 : p < 0x800 ? 2 : p < 0x10000 ? 3 : 4;
  }
  return n;
};

// Schneidet auf hoechstens max Bytes - nie mitten in ein Zeichen hinein.
const aufBytes = (t, max) => {
  if (bytes(t) <= max) return t;
  let out = '';
  for (const c of t) {
    if (bytes(out) + bytes(c) > max) break;
    out += c;
  }
  return out;
};

const aufMaxKuerzen = (roh) => {
  let t = (roh || '').replace(/,/g, '').replace(/\t/g, ' ').replace(/\s+/g, ' ').trim();
  if (bytes(t) > MAX) {
    const cut = aufBytes(t, MAX);
    const i = cut.lastIndexOf(' ');
    t = (i > 30 ? cut.slice(0, i) : cut).replace(/[\s|,;:\-–—·]+$/, '').trim();
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
    if (bytes(genommen.concat(a).join('; ')) > MAX) break;
    genommen.push(a);
  }
  return genommen.length ? genommen.join('; ') : aufMaxKuerzen(teile[0]);
};

const titelKuerzen = (roh) => aufMaxKuerzen(roh);

// eBay-Angebotstitel: hartes Limit 80 Zeichen. Der Artikelname kommt aus Amazon und
// traegt dort fast immer einen Marketing-Anhang hinter " | " oder " - "
// ("Schmerz: Ein Fall fuer Dora und Rado | Der fesselnde Island-Krimi des Jahres ...",
// 185 Zeichen). Ohne Kuerzung laesst PlentyONE das Listing gar nicht erst speichern:
// "Titel enthaelt zu viele Zeichen." (MLID 12, 04.09.2026, -105 Zeichen).
// Zuerst faellt der Anhang weg - das ergibt einen sauberen Titel statt eines
// mitten im Satz abgeschnittenen. Erst wenn das nicht reicht, wird hart gekuerzt.
// Kommas bleiben hier stehen: anders als bei den Merkmalen ist das eine eigene
// Tab-Spalte, kein kommagetrennter Sammelwert.
const EBAY_TITEL_MAX = 80;
const ebayTitel = (roh) => {
  let t = String(roh || '').replace(/\t/g, ' ').replace(/\s+/g, ' ').trim();
  if (bytes(t) > EBAY_TITEL_MAX) {
    const anhang = t.search(/\s[|\u2013\u2014]\s|\s-\s/);
    if (anhang > 20) t = t.slice(0, anhang);
  }
  if (bytes(t) > EBAY_TITEL_MAX) {
    // Lieber am Satzende kappen als mitten im Satz: aus
    // "Aufklaerung jetzt: Fuer Vernunft, Wissenschaft, Humanismus und Fortschritt. Eine"
    // wird so ein abgeschlossener Titel statt eines haengenden "Eine".
    const cut = aufBytes(t, EBAY_TITEL_MAX);
    const satz = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '),
                          cut.lastIndexOf('? '), cut.lastIndexOf('; '));
    const wort = cut.lastIndexOf(' ');
    t = satz >= 55 ? cut.slice(0, satz + 1) : (wort > 40 ? cut.slice(0, wort) : cut);
    // Ein gekappter Titel soll nicht auf einem Fuellwort enden ("... und", "... Eine").
    t = t.replace(/\s+(und|oder|mit|f\u00fcr|von|der|die|das|dem|den|des|ein|eine|einen|im|am|in|zu|auf|aus|bei|als|wie)$/i, '');
  }
  return t.replace(/[\s|,;:\-\u2013\u2014\u00b7]+$/, '').trim();
};

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

// --- Verwaiste Listings erkennen --------------------------------------------
// Import 23 legt in EINEM Lauf zwei Dinge an: erst das Listing, dann das
// Market-Listing. Scheitert der zweite Schritt - etwa weil die Variante nicht fuer
// eBay freigeschaltet ist ("Es wurden keine Varianten fuer den Export
// freigeschaltet.(eBay)") - bleibt ein Listing OHNE Market-Listing zurueck.
// Der Artikel gilt danach als "hat schon ein Listing" und verschwindet lautlos aus
// CSV A: Import 23 meldet 0 Zeilen, Import 22 kennt die MLID nicht, und niemand
// merkt etwas. Genau das ist am 04.09.2026 mit 37 Buechern passiert.
// Deshalb werden solche Artikel hier ausdruecklich gezaehlt und benannt.
const itemsMitMarketListing = new Set();
for (const ml of marketListings) {
  const iid = itemByVar[ml.variationId];
  if (iid) itemsMitMarketListing.add(iid);
}
const verwaiste = [];
for (const it of items) {
  if (!istBuch(it.id)) continue;
  if (!itemsMitListing.has(it.id)) continue;
  if (itemsMitMarketListing.has(it.id)) continue;
  verwaiste.push({ item_id: it.id, titel: String(titelByItem[it.id] || '').slice(0, 90),
                   grund: 'Listing ohne Market-Listing - steht wieder in CSV A, Import 23 holt den zweiten Schritt nach' });
}

// --- CSV A: Buch-Artikel OHNE Listing (Import 23) ----------------------------
const aRows = ['ItemID\tMarketID\tUserID\tTypeID\tStockDependenceTypeID\tUnitCombinationID\tDirectoryID\tEnabled\tDuration'];
const ohnePreis = [];
const ohneBild = [];
const ohneGpsr = [];
let gpsrAusserhalbEu = 0;
let aCount = 0;
// Entscheidend ist das MARKET-Listing, nicht das Listing. Wer nur auf
// itemsMitListing prueft, haelt einen halb angelegten Artikel fuer erledigt und
// bietet ihn nie wieder an - die Kette steht dann still, ohne dass es auffaellt.
for (const it of items) {
  if (!istBuch(it.id)) continue;
  if (itemsMitMarketListing.has(it.id)) continue;
  const v = varByItem[it.id];
  if (!gpsrOk(it)) {
    // Ohne Herstellerangabe darf das Angebot nach Art. 19 GPSR nicht online.
    const g = gpsrVon(it);
    ohneGpsr.push({ item_id: it.id, titel: String(titelByItem[it.id] || '').slice(0, 90),
                    grund: g === null
                      ? 'kein Hersteller am Artikel - Art. 19 GPSR verlangt Name,'
                        + ' Anschrift und E-Mail des Herstellers im Angebot'
                      : 'Hersteller \"' + g.name + '\" unvollstaendig, es fehlt: ' + g.fehlt });
    continue;
  }
  if (!bildOk(it.id)) {
    // Ohne Bild scheitert die eBay-Pruefung mit 'kein Artikelbild vorhanden'.
    // Solche Titel gar nicht erst anlegen - sonst steht der Bericht dauerhaft rot.
    ohneBild.push({ item_id: it.id, titel: String(titelByItem[it.id] || '').slice(0, 90),
                    grund: 'kein Artikelbild - eBay lehnt Angebote ohne Bild ab'
                           + ' (meist kein VLB-Treffer, also auch kein Cover)' });
    continue;
  }
  const gEu = gpsrVon(it);
  if (gEu !== null && gEu.ausserhalbEu) gpsrAusserhalbEu++;
  if (!preisOk(v.variationId)) {
    // Weder gebundener Ladenpreis noch freier eBay-Preis - ohne Preis kein Listing.
    const vorhanden = allePreiseByVar[v.variationId] || [];
    ohnePreis.push({ item_id: it.id, titel: String(titelByItem[it.id] || '').slice(0, 90),
                     grund: 'weder Verkaufspreis ' + cfg.bpbPreisId + ' (Buchpreisbindung) noch '
                            + cfg.ersatzPreisId + ' (eBay-Preis)'
                            + ' | vorhandene Verkaufspreise: ' + (vorhanden.join(', ') || 'keine') });
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
  ['versandprofil_id', cfg.versandprofilId || '1'],      // eBay-Versandprofil "Buecher DE" (eigener Zahlenraum!)
  ['zustand_id',       cfg.zustandId       || '1000'],   // eBay-Zustands-ID: 1000 = Neu (eBay-Standardcode)
  ['layout_id',        cfg.layoutId        || '1'],      // Layout-Vorlagen-ID ("Buecher")
  ['lager_id',         cfg.lagerId         || '2'],      // Lager-ID (FBA)
  // Bestandsabhaengigkeit des LISTINGS (Zielfeld in Import 22:
  // "Listing >> Bestandsabhaengigkeits-ID"). Import-Skala: 2 = beschraenkt (ohne
  // Reservierung) - Voraussetzung fuer Bestandsautomatik und "Nicht mehr vorraetig".
  // Import 23 setzt den Wert bei der Anlage; diese Spalte zieht Altbestand nach.
  ['bestandsabhaengigkeit', cfg.stockDependenceTypeId || '2'],
  // Der Base-Reiter hat ZWEI Steuerfelder. Bei MLID 1 standen beide gefuellt, aber
  // das kam von der Stapel-Vorlage. Die vorlagenfreien Listings (MLID 12-21,
  // 04.09.2026) zeigen: mit 'mwst' allein bleiben Satz UND Land leer.
  ['mwst_land',        cfg.mwstLand        || '1'],      // MwSt.-Land (1 = Deutschland)
  ['mwst',             cfg.mwst            || '7'],      // Mehrwertsteuersatz
  ['sprache_code',     cfg.spracheCode     || 'de'],   // je Zeile aus der ISBN     // Sprache
  // Ja/Nein durchgaengig als Buchstabe - siehe "An Artikelpreis binden" (Lauf 45/47/49):
  // 0 und 1 wurden abgewiesen, Y lief durch. Beide Felder stehen im Listing auf "Nein".
  ['uvp',              cfg.uvpUebertragen  || 'N'],      // eBay UVP uebertragen
  ['preisvorschlag',   cfg.preisvorschlag  || 'N'],      // eBay-Preisvorschlag
  ['bilder',           cfg.anzahlBilder    || '1'],      // Anzahl der Bilder
  // "An Artikelpreis binden" erwartet 'Y'/'N', nicht 0/1 und erst recht keine Preis-ID:
  //   '7' -> "Use Item Price invalid. | ( UpdateListingMarket )"  (Lauf 45, 11 Fehler)
  //   '1' -> derselbe Fehler                                      (Lauf 47, 11 Fehler)
  //   'Y' -> sauber durchgelaufen, Listing zeigt danach Preis-ID 7 (Lauf 49) ✓
  // Dieser Import-Typ nimmt Ja/Nein durchgaengig als Buchstabe - vgl. "Freigeschaltet"
  // (Y) und "Dauer" (GTC) in Import 23.
  // cfg.bpbPreisId (7) bleibt dem Preis-Guard vorbehalten - nicht wiederverwenden.
  ['preisbindung',     cfg.preisbindungWert || 'Y'],
];

// Die Zusatzspalten sind fuer alle Zeilen gleich - bis auf die Sprache, die am
// einzelnen Buch haengt und hier ueberschrieben wird.
const zusatzWerte = (o) => ZUSATZ.map(([name, wert]) => (name in o ? o[name] : wert));

const bRows = [['MLID', 'Name', 'Wert'].concat(ZUSATZ.map(z => z[0]))
  .concat(['titel_ebay']).join('\t')];
const uebersprungen = [];
const probleme = [];
let bCount = 0;
let mitErsatzpreis = 0;
let geprueftOk = 0;
let geprueftFehler = 0;
let nichtGeprueft = 0;
let buchListings = 0;
let bestandKaufbar = 0;
let bestandNull = 0;
let listingsOhneGpsr = 0;
let listingsAusserhalbEu = 0;

for (const ml of marketListings) {
  const itemId = itemByVar[ml.variationId];
  if (!itemId || !istBuch(itemId)) continue;
  buchListings++;
  if (bestandPruefung === 'ok') {
    const bst = bestandByVar[ml.variationId];
    if (bst && bst.netto > 0) bestandKaufbar++; else bestandNull++;
  }

  const titelRoh = titelByItem[itemId];

  // Ein bestehendes Listing ist bereits online - zurueckhalten geht nicht mehr.
  // Fehlt die Herstellerangabe, ist das Angebot abmahnbar, SOLANGE es laeuft.
  // Also als Problem melden, damit es beendet oder nachgepflegt wird.
  if (gpsrPruefung === 'ok') {
    const gl = gpsrVonItem(itemId);
    if (gl === null || !gl.vollstaendig) {
      listingsOhneGpsr++;
      probleme.push({ mlid: ml.id, item_id: itemId, titel: String(titelRoh || '').slice(0, 90),
                      grund: gl === null
                        ? 'LIVE ohne Herstellerangabe (Art. 19 GPSR) - Hersteller zuordnen'
                          + ' oder Listing beenden'
                        : 'LIVE mit unvollstaendigem Hersteller: ' + gl.name
                          + ' - es fehlt: ' + gl.fehlt });
    } else if (gl.ausserhalbEu) {
      listingsAusserhalbEu++;
    }
  }

  if (ml.verified === 'succeeded') geprueftOk++;
  else if (ml.verified === 'failed') {
    geprueftFehler++;
    probleme.push({ mlid: ml.id, item_id: itemId, titel: String(titelRoh || '').slice(0, 90),
                    grund: 'Pruefung in PlentyONE fehlgeschlagen' });
  }
  else {
    // Weder bestanden noch fehlgeschlagen: dieses Listing wurde NIE geprueft.
    // Frueher lief das unter "kein Fehler" und der Bericht wurde faelschlich gruen -
    // ein vergessenes "Market-Listings pruefen" waere unbemerkt geblieben.
    nichtGeprueft++;
    probleme.push({ mlid: ml.id, item_id: itemId, titel: String(titelRoh || '').slice(0, 90),
                    grund: 'noch nicht geprueft - "Market-Listings pruefen" ausfuehren' });
  }

  const autor = autorUmformen(autorByVar[ml.variationId]);
  const titel = titelKuerzen(titelRoh);
  if (!autor || !titel) {
    uebersprungen.push({ mlid: ml.id, item_id: itemId, titel: String(titelRoh || '').slice(0, 90),
                         grund: [!autor ? 'kein Autor' : null, !titel ? 'kein Titel' : null].filter(Boolean).join(', ') });
    continue;
  }

  const [spracheName, spracheCode] = spracheZu(ml.variationId);
  if (ueberErsatzpreis(ml.variationId)) mitErsatzpreis++;

  bRows.push([ml.id, 'Autor,Buchtitel,Sprache', autor + ',' + titel + ',' + spracheName]
    .concat(zusatzWerte({ sprache_code: spracheCode }))
    .concat([ebayTitel(titelRoh)])
    .join('\t'));
  bCount++;
}

// --- Bericht -----------------------------------------------------------------
const zahlen = {
  artikel: items.length,
  ohne_listing: aCount,
  listings: buchListings,
  geprueft_ok: geprueftOk,
  geprueft_fehler: geprueftFehler,
  nicht_geprueft: nichtGeprueft,
  merkmale: bCount,
  ohne_bpb_preis: ohnePreis.length,
  ohne_bild: ohneBild.length,
  gpsr_hersteller: hersteller.length,
  gpsr_zugeordnet: gpsrZugeordnet,
  ohne_gpsr: ohneGpsr.length,
  listings_ohne_gpsr: listingsOhneGpsr,
  gpsr_ausserhalb_eu: gpsrAusserhalbEu + listingsAusserhalbEu,
  mit_ersatzpreis: mitErsatzpreis,
  verwaiste_listings: verwaiste.length,
  bestand_kaufbar: bestandKaufbar,
  bestand_null: bestandNull,
  bestand_alter_min: bestandAlterMin,
};

const preisHinweis = preisPruefung === 'ok'
  ? null
  : (preisPruefung === 'nicht_moeglich'
      ? 'Die Verkaufspreise liessen sich nicht lesen - der Preis-Guard konnte nicht pruefen. Vor dem Start von Hand kontrollieren.'
      : 'Kein einziger Buchpreisbindungspreis gefunden - vermutlich stimmt die Verkaufspreis-ID nicht.');

const bestandHinweis = bestandPruefung === 'nicht_moeglich'
  ? 'Der FBA-Bestand (Lager ' + fbaLagerId + ') liess sich nicht lesen - eBay-Mengen koennen veraltet sein.'
  : bestandPruefung === 'keine_zeilen'
    ? 'Im FBA-Lager ' + fbaLagerId + ' liegen keine Bestandszeilen - der Amazon-Bestandsimport laeuft nicht.'
    : (bestandAlterMin > bestandMaxAlterMin)
      ? 'FBA-Bestand veraltet: letzter Import vor ' + bestandAlterMin + ' min (Grenze ' + bestandMaxAlterMin + ' min) - Amazon-Verkaeufe erreichen eBay nicht.'
      : null;

const gpsrHinweis = gpsrPruefung === 'nicht_moeglich'
  ? 'Die Hersteller liessen sich nicht lesen - der GPSR-Guard konnte nicht pruefen.'
  : gpsrPruefung === 'kein_feld'
    ? 'Kein Artikel meldet ein Hersteller-Feld - der GPSR-Guard konnte nicht'
      + ' pruefen und haelt vorsichtshalber nichts zurueck. Feldnamen pruefen.'
  : gpsrPruefung === 'keine_hersteller'
    ? 'In PlentyONE ist kein einziger Hersteller angelegt. Ohne Herstellerangabe'
      + ' darf kein Angebot online (Art. 19 GPSR) - erst den Hersteller-Import fahren.'
  : gpsrPruefung === 'keine_zuordnung'
    ? 'Es gibt ' + hersteller.length + ' Hersteller, aber kein Artikel ist einem'
      + ' zugeordnet. Im Artikelimport die Zeile vlb_verlag auf "Artikel >>'
      + ' Hersteller-ID" stellen und den Import laufen lassen. Bis dahin haelt der'
      + ' Guard nichts zurueck und schwaerzt kein laufendes Listing an.'
    : ((gpsrAusserhalbEu + listingsAusserhalbEu) > 0
        ? (gpsrAusserhalbEu + listingsAusserhalbEu)
          + ' Buch/Buecher haben einen Hersteller AUSSERHALB der EU.'
          + ' Dort verlangt Art. 19 zusaetzlich eine verantwortliche Person in der EU'
          + ' - beim Grosshaendler erfragen, wer der Einfuehrer ist.'
        : null);

const text = [
  'eBay-Kontrolle ' + new Date().toISOString().slice(0, 16).replace('T', ' ') + ' (UTC)',
  '',
  'Artikel in PlentyONE: ' + zahlen.artikel,
  'Buch-Artikel ohne Listing (Import 23): ' + zahlen.ohne_listing,
  'eBay-Listings gesamt: ' + zahlen.listings + '  (geprueft ok ' + geprueftOk
    + ', fehlgeschlagen ' + geprueftFehler + ', noch nicht geprueft ' + nichtGeprueft + ')',
  'Merkmal-Zeilen (Import 22): ' + zahlen.merkmale,
  'Ohne Buchpreisbindungspreis zurueckgehalten: ' + zahlen.ohne_bpb_preis,
  'Ohne Artikelbild zurueckgehalten: ' + zahlen.ohne_bild,
  landIdText
    ? 'Land-IDs fuer den Hersteller-Import (das Feld Land verlangt die Zahl,'
      + ' nicht den ISO-Code): ' + landIdText
    : 'Land-IDs nicht lesbar - die Laenderliste kam nicht durch.',
  'Hersteller in PlentyONE: ' + hersteller.length + ', davon zugeordnete Artikel: '
    + gpsrZugeordnet + ' von ' + items.length
    + (hersteller.length
        ? ' - z.B. ' + hersteller.slice(0, 3)
            .map(h => '#' + h.id + ' ' + String(h.name || '(ohne Namen)')).join(', ')
        : ''),
  'Ohne GPSR-Herstellerangabe zurueckgehalten: ' + zahlen.ohne_gpsr,
  listingsOhneGpsr
    ? 'ACHTUNG: ' + listingsOhneGpsr + ' LAUFENDE(S) Listing(s) ohne vollstaendige'
      + ' Herstellerangabe - abmahnbar, solange sie online sind (siehe Probleme)'
    : null,
  'Ueber den freien eBay-Preis statt der Buchpreisbindung: ' + zahlen.mit_ersatzpreis,
  bestandPruefung === 'ok'
    ? 'FBA-Lager ' + fbaLagerId + ': kaufbar ' + bestandKaufbar + ', Bestand 0: ' + bestandNull
      + ', Bestandsstand ' + (bestandStand
          ? new Date(bestandStand).toISOString().slice(0, 16).replace('T', ' ') + ' UTC (vor ' + bestandAlterMin + ' min)'
          : 'unbekannt')
    : null,
  verwaiste.length ? '' : null,
  verwaiste.length ? 'ACHTUNG: ' + verwaiste.length + ' Listing(s) ohne Market-Listing - Import 23 ist auf halbem Weg stehengeblieben:' : null,
  ...verwaiste.slice(0, 100).map(v => '  Artikel ' + v.item_id + ': ' + v.titel),
  preisHinweis ? '' : null,
  preisHinweis ? 'ACHTUNG: ' + preisHinweis : null,
  bildPruefung === 'ok' ? null : '',
  bildPruefung === 'ok' ? null
    : bildPruefung === 'kein_feld'
      ? 'ACHTUNG: Keine Variante meldet ein Bildfeld - der Bild-Guard konnte nicht'
        + ' pruefen und haelt vorsichtshalber nichts zurueck. Relationsnamen pruefen.'
      : 'ACHTUNG: Die Artikelbilder liessen sich nicht lesen - der Bild-Guard konnte nicht pruefen.',
  gpsrHinweis ? '' : null,
  gpsrHinweis ? 'ACHTUNG: ' + gpsrHinweis : null,
  bestandHinweis ? '' : null,
  bestandHinweis ? 'ACHTUNG: ' + bestandHinweis : null,
  uebersprungen.length ? '' : null,
  uebersprungen.length ? 'UEBERSPRUNGEN:' : null,
  ...uebersprungen.slice(0, 100).map(u => '  MLID ' + u.mlid + ' (Artikel ' + u.item_id + '): ' + u.grund),
].filter(x => x !== null).join('\n');

// Gruen heisst: jedes Buch-Listing ist geprueft UND bestanden. Ein ungeprueftes
// Listing zaehlt ausdruecklich NICHT als in Ordnung.
// Der Bestand macht den Bericht nur rot, wenn die Ueberwachung eingeschaltet ist
// (nach dem Pilot). Vorher steht er informativ im Text.
const ok = geprueftFehler === 0 && nichtGeprueft === 0 && ohnePreis.length === 0
        && verwaiste.length === 0 && preisPruefung === 'ok' && bildPruefung === 'ok'
        && gpsrPruefung === 'ok' && listingsOhneGpsr === 0
        && (!bestandUeberwacht || (bestandPruefung === 'ok' && bestandAlterMin <= bestandMaxAlterMin));

const koerper = JSON.stringify({
  ok,
  zahlen,
  probleme: probleme.concat(verwaiste).slice(0, 500),
  uebersprungen: uebersprungen.concat(ohnePreis).concat(ohneBild).concat(ohneGpsr).slice(0, 500),
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
        # Bestandsabhaengigkeit - ZWEI Skalen! Der Import zaehlt 0-basiert
        # (0 unbeschraenkt mit Abgleich, 1 beschraenkt mit Reservierung,
        # 2 beschraenkt ohne Reservierung, 3 unbeschraenkt ohne Abgleich),
        # REST 1-basiert (1 Unlimited with sync .. 3 Limited without reservation).
        # Beleg 06.09.2026: Importwert 1 -> GET /rest/listings zeigt 2.
        # Die eBay-Bestandsautomatik und die "Nicht mehr vorraetig"-Option
        # verlangen "beschraenkt (ohne Reservierung)" = Importwert 2.
        {"id": "a14", "name": "stockDependenceTypeId", "value": "2", "type": "string"},
        # Bestandsteil des Berichts (Lager 2 = Amazon FBA). N = nur informativ,
        # Y = veralteter oder unlesbarer FBA-Bestand macht den Bericht rot.
        {"id": "a19", "name": "bestandUeberwachung", "value": "N", "type": "string"},
        {"id": "a20", "name": "bestandMaxAlterMin", "value": "120", "type": "string"},
        {"id": "a15", "name": "unitCombinationId", "value": "1", "type": "string"},
        {"id": "a16", "name": "directoryId", "value": "1", "type": "string"},
        {"id": "a17", "name": "enabled", "value": "Y", "type": "string"},
        {"id": "a18", "name": "duration", "value": "GTC", "type": "string"},
        # --- Werte, die bisher die Stapel-Vorlage "Buecher (1)" gesetzt hat.
        # Am 04.09.2026 vom fertigen Listing MLID 1 (Dirty Diana) abgelesen.
        # Sicher: Kategorie, Versandprofil, Layout, Lager, Preisbindung.
        # Bestaetigt: mwst=7 und spracheCode=de (Lauf 50). zustandId: 1 war ungueltig,
        # eBay-Standardcode fuer "Neu" ist 1000.
        {"id": "b01", "name": "kategorieId", "value": "261186", "type": "string"},
        # ACHTUNG: eBay-Versandprofile haben einen EIGENEN Zahlenraum, nicht den der
        # PlentyONE-Versandprofile (dort: 6 Standardpaket, 7 Selbstabholer).
        # "Buecher DE" = ID 1, zu finden unter Einrichtung >> Maerkte >> eBay >>
        # Konto primehub_gbr >> Versandprofile. Die 6 quittierte die Oberflaeche
        # mit "Ungueltige Auswahl (6)".
        {"id": "b02", "name": "versandprofilId", "value": "1", "type": "string"},
        {"id": "b03", "name": "zustandId", "value": "1000", "type": "string"},
        {"id": "b04", "name": "layoutId", "value": "1", "type": "string"},
        {"id": "b05", "name": "lagerId", "value": "2", "type": "string"},
        {"id": "b06", "name": "mwst", "value": "7", "type": "string"},
        {"id": "b12", "name": "mwstLand", "value": "1", "type": "string"},
        {"id": "a10b", "name": "ersatzPreisId", "value": "8", "type": "string"},
        {"id": "b07", "name": "spracheCode", "value": "de", "type": "string"},
        {"id": "b08", "name": "uvpUebertragen", "value": "N", "type": "string"},
        {"id": "b09", "name": "preisvorschlag", "value": "N", "type": "string"},
        {"id": "b10", "name": "anzahlBilder", "value": "1", "type": "string"},
        # "An Artikelpreis binden" = Ja/Nein. Die Verkaufspreis-ID 7 steckt in bpbPreisId.
        {"id": "b11", "name": "preisbindungWert", "value": "Y", "type": "string"},
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
    # Das Dashboard stoesst den Bericht per Knopfdruck an. Geantwortet wird
    # sofort ueber "Antwort Bericht"; das Ergebnis kommt spaeter ueber
    # "Bericht senden" zurueck. Ein eigener Respond-Knoten ist noetig, weil
    # n8n sonst "Unused Respond to Webhook node found in the workflow" wirft -
    # sobald irgendein Respond-Knoten existiert, muss ihn jeder Webhook nutzen.
    node("Webhook Bericht", "n8n-nodes-base.webhook", 2, [-640, 740],
         {"path": "ebay-bericht", "httpMethod": "POST", "responseMode": "responseNode"},
         webhookId="ebay-bericht"),
    node("Antwort Bericht", "n8n-nodes-base.respondToWebhook", 1.1, [-400, 900], {
        "respondWith": "text",
        "responseBody": "angestossen",
    }),

    node("Modus listings", "n8n-nodes-base.code", 2, [-400, 60],
         {"jsCode": MODUS % (MODUS_WEBHOOK % "Webhook Listings", "listings", "true")}),
    node("Modus merkmale", "n8n-nodes-base.code", 2, [-400, 240],
         {"jsCode": MODUS % (MODUS_WEBHOOK % "Webhook Merkmale", "merkmale", "true")}),
    node("Modus bericht", "n8n-nodes-base.code", 2, [-400, 500],
         {"jsCode": MODUS % ("''", "bericht", "false")}),
    node("Modus bericht Abruf", "n8n-nodes-base.code", 2, [-400, 740],
         {"jsCode": MODUS % (MODUS_WEBHOOK % "Webhook Bericht", "bericht", "true")}),

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
    "Webhook Bericht": {"main": [verbinde("Antwort Bericht")]},
    "Antwort Bericht": {"main": [verbinde("Modus bericht Abruf")]},
    "Modus listings": {"main": [verbinde("Konfiguration")]},
    "Modus merkmale": {"main": [verbinde("Konfiguration")]},
    "Modus bericht": {"main": [verbinde("Konfiguration")]},
    "Modus bericht Abruf": {"main": [verbinde("Konfiguration")]},
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

# Den Code des Knotens "Daten holen" zusaetzlich als reine .js-Datei ablegen.
# Aus der Workflow-JSON laesst er sich nicht von Hand herauskopieren - beim
# Versuch landete am 06.09.2026 die ganze Datei im jsCode-Feld.
io.open(ZIEL_JS, "w", encoding="utf-8", newline="\n").write(DATEN)
print("geschrieben:", ZIEL_JS)
