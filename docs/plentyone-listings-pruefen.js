// Market-Listings gegen eBay pruefen lassen.
//
// PlentyONE prueft jedes Angebot, bevor es online darf. In der Oberflaeche geht
// das ueber die Gruppenfunktion "Market-Listings pruefen" - die schafft aber nur
// eine Handvoll auf einmal. Ueber die Schnittstelle geht es vollstaendig:
//
//   POST /rest/listings/markets/verify   { "id": <MLID> }   -> {"affectedRows":1}
//
// Wichtig: NUR dieses Format wirkt. {ids:[...]}, {listingIds:[...]} und
// {marketListingIds:[...]} antworten ebenfalls mit 200, bewirken aber nichts
// ({"affectedRows":0}) - eine Falle, in der man lange suchen kann.
// Geprueft am 16.09.2026 an MLID 115: verified ging von "unknown" auf "succeeded".
//
// Das Feld 'verified' ist ein String, kein Boolescher Wert:
//   "unknown"   noch nicht geprueft
//   "succeeded" geprueft, darf starten
//   alles andere -> Pruefung fehlgeschlagen, steht im Statusbericht
//
// Der Lauf ist wiederholbar: bereits geprueft = uebersprungen.

const cfg = $('Konfiguration').first().json;
const login = $('PlentyONE Login').first().json;
const token = login.accessToken || (login.data && login.data.accessToken);
if (!token) throw new Error('Kein Login-Token von PlentyONE erhalten - Passwort im Knoten "Konfiguration" pruefen.');

// Wird der Lauf per Webhook angestossen, muss der Token stimmen. Der manuelle
// Start aus der n8n-Oberflaeche braucht keinen - dort sitzt ohnehin ein Mensch.
try {
  const hook = $('Webhook Start').first().json;
  const kopf = (hook.headers || {})['x-primehub-token'] || '';
  if (kopf !== cfg.webhookToken) throw new Error('Abruf ohne gueltigen Token abgelehnt.');
} catch (e) {
  if (String(e.message).indexOf('abgelehnt') !== -1) throw e;
}

// 0 = alle. Zum Ausprobieren eine kleine Zahl setzen.
const LIMIT = Number(cfg.limit || 0);

const schlafen = (ms) => new Promise(r => setTimeout(r, ms));

// PlentyONE begrenzt Schreibvorgaenge je Minute - wie streng, haengt vom Tarif ab.
// Jede Antwort nennt im Kopf, wie viel im laufenden Fenster noch frei ist. Danach
// richtet sich der Lauf, statt ins Limit zu rennen und die Instanz auszusperren.
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

// Sicherung: Liefert die Liste nichts, wurde nichts gefunden - nicht blind
// weitermachen, sondern melden.
if (!marktListings.length) {
  throw new Error('Keine Market-Listings gefunden - Abruf pruefen. Nichts geschrieben.');
}

const zustand = {};
for (const m of marktListings) {
  const v = String(m.verified);
  zustand[v] = (zustand[v] || 0) + 1;
}

const offen = marktListings
  .filter(m => String(m.verified) === 'unknown')
  .map(m => m.id)
  .sort((a, b) => a - b);

const zuTun = LIMIT > 0 ? offen.slice(0, LIMIT) : offen;

// Drei gleichzeitig - mehr reisst das Schreiblimit, siehe Kommentar oben.
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
    ungeprueft: offen.length,
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
