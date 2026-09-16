// Artikelbilder mit ihrer Hauptvariante verknuepfen.
//
// Der Bild-Import per URL legt das Bild am ARTIKEL an - der Schalter "mit
// Variante verknuepft" bleibt aber aus. eBay listet die Variante, und genau
// daran muss das Bild haengen; sonst laeuft das Angebot ohne Bild und der
// eBay-Guard haelt den Titel zurueck. Am 16.09.2026 betraf das 1.885 von
// 1.953 Artikeln.
//
// PlentyONE kann das weder per Import noch per Stapelverarbeitung. Der einzige
// Weg ist die Schnittstelle:
//   POST /rest/items/{itemId}/variations/{variationId}/variation_images
//   { "imageId": <id> }
//
// Der Lauf ist wiederholbar: bereits verknuepfte Bilder werden uebersprungen.

const cfg = $('Konfiguration').first().json;
const login = $('PlentyONE Login').first().json;
const token = login.accessToken || (login.data && login.data.accessToken);
if (!token) throw new Error('Kein Login-Token von PlentyONE erhalten - Passwort im Knoten "Konfiguration" pruefen.');

// 0 = alle. Zum Ausprobieren eine kleine Zahl setzen.
const LIMIT = Number(cfg.limit || 0);

const schlafen = (ms) => new Promise(r => setTimeout(r, ms));

// PlentyONE drosselt die REST-API (429). Ein 429 ist kein Fehler, sondern die
// Bitte zu warten - also warten und erneut fragen, statt den Lauf wegzuwerfen.
const anfrage = async (pfad, methode, koerper) => {
  let warte = 3000;
  for (let versuch = 1; ; versuch++) {
    try {
      return await this.helpers.httpRequest({
        method: methode || 'GET',
        url: cfg.plentyUrl + pfad,
        headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' },
        body: koerper,
        json: true,
      });
    } catch (e) {
      const code = String(e.httpCode || e.statusCode || (e.response && e.response.status) || '');
      const ist429 = code === '429' || /\b429\b/.test(String(e.message || ''));
      if (!ist429 || versuch >= 6) throw e;
      await schlafen(warte);
      warte = Math.min(warte * 2, 30000);
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

// 1) Hauptvariante je Artikel
const varianten = await alleSeiten('/rest/items/variations');
const hauptVariante = {};
for (const v of varianten) {
  if (v.isMain === false && hauptVariante[v.itemId]) continue;
  hauptVariante[v.itemId] = v.id;
}

// 2) Welche Varianten haben bereits ein Bild? Die bleiben unberuehrt.
const mitBild = await alleSeiten('/rest/items/variations?with=images');
const bildAnVariante = {};
for (const v of mitBild) {
  const liste = v.images || v.variationImages || [];
  bildAnVariante[v.id] = Array.isArray(liste) ? liste.length : 0;
}

// Sicherung: Meldet keine einzige Variante ein Bildfeld, heisst die Relation
// anders als erwartet. Dann waere jede Variante "ohne Bild" und der Lauf wuerde
// blind 2.000 Verknuepfungen schreiben. Lieber abbrechen und nachsehen.
if (!mitBild.some(v => Array.isArray(v.images) || Array.isArray(v.variationImages))) {
  throw new Error('Keine Variante meldet ein Bildfeld - Relation "with=images" pruefen. Nichts geschrieben.');
}

const offen = Object.keys(hauptVariante)
  .map(Number)
  .filter(itemId => !(Number(bildAnVariante[hauptVariante[itemId]] || 0) > 0))
  .sort((a, b) => a - b);

const zuTun = LIMIT > 0 ? offen.slice(0, LIMIT) : offen;

// 3) Je Artikel das Bild holen und mit der Hauptvariante verknuepfen
let verknuepft = 0, ohneBild = 0, fehler = 0;
const beispiele = [];
const probleme = [];

for (const itemId of zuTun) {
  const variationId = hauptVariante[itemId];
  try {
    const bilder = await anfrage('/rest/items/' + itemId + '/images');
    const liste = Array.isArray(bilder) ? bilder : (bilder.entries || []);
    if (!liste.length) { ohneBild++; continue; }

    // Position 1 zuerst - das ist das Cover.
    liste.sort((a, b) => Number(a.position || 0) - Number(b.position || 0));
    const imageId = liste[0].id;

    await anfrage(
      '/rest/items/' + itemId + '/variations/' + variationId + '/variation_images',
      'POST',
      { imageId: imageId }
    );
    verknuepft++;
    if (beispiele.length < 5) beispiele.push(`Artikel ${itemId} -> Variante ${variationId}, Bild ${imageId}`);
    await schlafen(120);
  } catch (e) {
    fehler++;
    if (probleme.length < 20) probleme.push(`Artikel ${itemId}: ${String(e.message).slice(0, 160)}`);
  }
}

return [{
  json: {
    artikel_gesamt: Object.keys(hauptVariante).length,
    ohne_bild_an_variante: offen.length,
    in_diesem_lauf_bearbeitet: zuTun.length,
    verknuepft: verknuepft,
    artikel_ohne_bild_am_artikel: ohneBild,
    fehler: fehler,
    limit: LIMIT || 'alle',
    beispiele: beispiele,
    probleme: probleme,
  },
}];
