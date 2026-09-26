// ALLE Market-Listings erneut gegen eBay pruefen lassen - auch die bereits
// geprueften. Ausgeloest ueber den Knopf "Alle Listings neu pruefen" im Dashboard.
//
// Wozu: PlentyONE rechnet beim Pruefen auch die eBay-Gebuehr des Angebots neu.
// Aendert sich bei eBay etwas am Konto (z. B. Top-Shop-Abo: Einstellgebuehr
// 0,42 EUR -> 0,06 EUR), bleibt an bereits geprueften Angeboten der alte Wert
// stehen, bis sie erneut geprueft werden. Ebenso bekommen fehlgeschlagene
// Angebote nach einer Korrektur (Bild, GPSR, Preis) hier ihre zweite Chance.
//
// Der naechtliche Workflow "Market-Listings pruefen (PrimeHub)" (04:30) bleibt
// wie er ist: er prueft nur "unknown". Dieser hier nimmt jedes Listing.
//
// Schnittstelle (siehe docs/plentyone-listings-pruefen.md):
//   POST /rest/listings/markets/verify   { "id": <MLID> }   -> {"affectedRows":1}
// NUR dieses Format wirkt - {ids:[...]} & Co. antworten 200 mit affectedRows 0.
//
// 'verified' ist ein String: "unknown" | "succeeded" | alles andere = fehlgeschlagen.

const cfg = $('Konfiguration').first().json;
const login = $('PlentyONE Login').first().json;
const token = login.accessToken || (login.data && login.data.accessToken);
if (!token) throw new Error('Kein Login-Token von PlentyONE erhalten - Passwort im Knoten "Konfiguration" pruefen.');

// 0 = alle. Zum Ausprobieren eine kleine Zahl setzen (Konfiguration oder Webhook-Body).
let LIMIT = Number(cfg.limit || 0);
try {
  const body = $('Webhook Start').first().json.body || {};
  if (Number(body.limit) > 0) LIMIT = Number(body.limit);
} catch (e) { /* manueller Start - kein Webhook */ }

const schlafen = (ms) => new Promise(r => setTimeout(r, ms));

// PlentyONE begrenzt Aufrufe je Minute. Jede Antwort nennt im Kopf, wie viel im
// laufenden Fenster noch frei ist - danach richtet sich der Lauf.
let drosselTreffer = 0, wartezeitMs = 0, limitInfo = '';

const anfrage = async (pfad, methode, koerper) => {
  let warte = 1000;
  for (let versuch = 1; ; versuch++) {
    try {
      const res = await this.helpers.httpRequest({
        method: methode || 'GET',
        url: cfg.plentyUrl + pfad,
        headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' },
        body: koerper,
        json: true,
        returnFullResponse: true,
      });
      const kopf = res.headers || {};
      const frei = Number(kopf['x-plenty-global-short-period-calls-left']);
      const fenster = Number(kopf['x-plenty-global-short-period-decay']);
      if (!limitInfo && Number.isFinite(frei)) {
        limitInfo = frei + ' Aufrufe frei, Fenster erneuert sich in ' + fenster + ' s';
      }
      if (Number.isFinite(frei) && frei <= 5 && Number.isFinite(fenster) && fenster > 0) {
        wartezeitMs += (fenster + 1) * 1000;
        await schlafen((fenster + 1) * 1000);
      }
      return res.body;
    } catch (e) {
      const code = String(e.httpCode || e.statusCode || (e.response && e.response.status) || '');
      const ist429 = code === '429' || /\b429\b/.test(String(e.message || ''));
      if (!ist429 || versuch >= 8) throw e;
      drosselTreffer++;
      const kopf = (e.response && e.response.headers) || {};
      const fenster = Number(kopf['x-plenty-global-short-period-decay']);
      const pause = Number.isFinite(fenster) && fenster > 0 ? (fenster + 1) * 1000 : warte;
      wartezeitMs += pause;
      await schlafen(pause);
      warte = Math.min(warte * 2, 60000);
    }
  }
};

const alleSeiten = async (basis) => {
  const trenner = basis.includes('?') ? '&' : '?';
  const alle = [];
  for (let s = 1; s <= 400; s++) {
    if (s > 1) await schlafen(150);
    const res = await anfrage(`${basis}${trenner}page=${s}&itemsPerPage=250`);
    const zeilen = res.entries || [];
    alle.push(...zeilen);
    if (res.isLastPage || zeilen.length === 0) break;
  }
  return alle;
};

const marktListings = await alleSeiten('/rest/listings/markets');

if (!marktListings.length) {
  throw new Error('Keine Market-Listings gefunden - Abruf pruefen. Nichts geschrieben.');
}

const zustand = {};
for (const m of marktListings) {
  const v = String(m.verified);
  zustand[v] = (zustand[v] || 0) + 1;
}

// Unterschied zum naechtlichen Lauf: KEIN Filter auf "unknown". Fehlgeschlagene
// zuerst, dann ungepruefte, dann die bestandenen - bricht der Lauf ab, sind die
// wichtigsten schon durch.
const rang = (v) => (v === 'succeeded' ? 2 : v === 'unknown' ? 1 : 0);
const alle = marktListings
  .slice()
  .sort((a, b) => rang(String(a.verified)) - rang(String(b.verified)) || a.id - b.id)
  .map(m => m.id);

const zuTun = LIMIT > 0 ? alle.slice(0, LIMIT) : alle;

// Drei gleichzeitig - mehr reisst das Schreiblimit.
let angestossen = 0, ohneWirkung = 0, fehler = 0;
const probleme = [];
const schlange = zuTun.slice();

const arbeiter = async () => {
  while (schlange.length) {
    const mlid = schlange.shift();
    try {
      const antwort = await anfrage('/rest/listings/markets/verify', 'POST', { id: mlid });
      const zeilen = Number((antwort || {}).affectedRows);
      if (zeilen > 0) angestossen++;
      else {
        ohneWirkung++;
        if (probleme.length < 20) probleme.push(`MLID ${mlid}: keine Zeile betroffen`);
      }
    } catch (e) {
      fehler++;
      if (probleme.length < 20) probleme.push(`MLID ${mlid}: ${String(e.message).slice(0, 160)}`);
    }
  }
};

await Promise.all(Array.from({ length: 3 }, arbeiter));

return [{
  json: {
    market_listings_gesamt: marktListings.length,
    zustand_vor_dem_lauf: zustand,
    in_diesem_lauf: zuTun.length,
    pruefung_angestossen: angestossen,
    ohne_wirkung: ohneWirkung,
    fehler: fehler,
    limit_laut_plentyone: limitInfo || 'kein Limit-Kopf in der Antwort',
    drossel_treffer: drosselTreffer,
    wartezeit_s: Math.round(wartezeitMs / 1000),
    limit: LIMIT || 'alle',
    probleme: probleme,
  },
}];
