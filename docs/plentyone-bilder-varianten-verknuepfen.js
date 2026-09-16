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

// PlentyONE begrenzt Schreibvorgaenge pro Minute - wie streng, haengt vom Tarif ab
// und steht nirgends oeffentlich. Jede Antwort nennt aber im Kopf, wie viele Aufrufe
// im laufenden Fenster noch frei sind und wann es sich erneuert. Danach richtet sich
// der Lauf: Wird es eng, wartet er von selbst das Fenster ab.
//
// Ohne diese Bremse hat ein Lauf mit acht gleichzeitigen Schreibvorgaengen am
// 16.09.2026 das Limit gerissen ("short period write limit reached") - danach
// scheiterte sogar der Login. Schneller als PlentyONE erlaubt geht es nicht;
// dieser Weg nutzt genau das erlaubte Tempo aus.
let drosselTreffer = 0, drosselWartezeitMs = 0, bremsWartezeitMs = 0, limitInfo = '';

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
      // Letzte Reserve stehen lassen - der naechste Lauf soll nicht ins Limit fallen.
      if (Number.isFinite(frei) && frei <= 5 && Number.isFinite(fenster) && fenster > 0) {
        bremsWartezeitMs += (fenster + 1) * 1000;
        await schlafen((fenster + 1) * 1000);
      }
      return res.body;
    } catch (e) {
      const code = String(e.httpCode || e.statusCode || (e.response && e.response.status) || '');
      const ist429 = code === '429' || /\b429\b/.test(String(e.message || ''));
      if (!ist429 || versuch >= 8) throw e;
      drosselTreffer++;
      // Das Minutenfenster ist voll - es hilft nur abwarten, bis es sich erneuert.
      const kopf = (e.response && e.response.headers) || {};
      const fenster = Number(kopf['x-plenty-global-short-period-decay']);
      const pause = Number.isFinite(fenster) && fenster > 0 ? (fenster + 1) * 1000 : warte;
      drosselWartezeitMs += pause;
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

// Einen Sammelabruf fuer Bilder gibt es nicht: '/rest/items/images' kennt die
// Instanz nicht (geprueft am 16.09.2026), und '/rest/items?with=images' liefert
// kein Bildfeld. Es bleibt bei einem Abruf je Artikel - deshalb die Parallelitaet
// unten.

// 3) Je Artikel das Bild holen und mit der Hauptvariante verknuepfen
let verknuepft = 0, ohneBild = 0, fehler = 0;
const beispiele = [];
const probleme = [];

// Drei Artikel gleichzeitig. Mehr bringt nichts: Das Limit zaehlt Schreibvorgaenge
// je Minute, nicht gleichzeitige Verbindungen - acht haben es am 16.09.2026 gerissen.
// Drei ueberbruecken die Wartezeit auf die Antwort, ohne das Fenster zu sprengen.
const GLEICHZEITIG = 3;
const schlange = zuTun.slice();

const arbeiter = async () => {
  while (schlange.length) {
    const itemId = schlange.shift();
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
    } catch (e) {
      fehler++;
      if (probleme.length < 20) probleme.push(`Artikel ${itemId}: ${String(e.message).slice(0, 160)}`);
    }
  }
};

await Promise.all(Array.from({ length: GLEICHZEITIG }, arbeiter));

return [{
  json: {
    artikel_gesamt: Object.keys(hauptVariante).length,
    ohne_bild_an_variante: offen.length,
    in_diesem_lauf_bearbeitet: zuTun.length,
    verknuepft: verknuepft,
    artikel_ohne_bild_am_artikel: ohneBild,
    fehler: fehler,
    limit_laut_plentyone: limitInfo || 'kein Limit-Kopf in der Antwort',
    drossel_treffer: drosselTreffer,
    wartezeit_drossel_s: Math.round(drosselWartezeitMs / 1000),
    wartezeit_vorsorglich_s: Math.round(bremsWartezeitMs / 1000),
    limit: LIMIT || 'alle',
    beispiele: beispiele,
    probleme: probleme,
  },
}];
