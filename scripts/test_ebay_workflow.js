/**
 * Regressionstest fuer den eBay-Workflow: node scripts/test_ebay_workflow.js
 *
 * Faehrt den ECHTEN Code-Node "Daten holen" aus docs/plentyone-ebay-workflow.json
 * gegen einen simulierten PlentyONE-Stand und prueft die Akzeptanzkriterien
 * AK2-AK7 sowie die Edge Cases E3-E11 aus features/plentyone/ebay-vollautomatisierung.md.
 *
 * Die Testbuecher sind echte Zeilen aus dem Amazon-Export vom 19.08.2026 - bewusst
 * die unangenehmen: Sammelbaende mit 19 bzw. 26 Autoren, "and" statt ";" als Trenner,
 * Titel weit ueber 65 Zeichen, und alle SKU-Praefixe, die im Bestand vorkommen.
 */
const fs = require('fs')
const path = require('path')

const WF = JSON.parse(fs.readFileSync(path.join(__dirname, '../docs/plentyone-ebay-workflow.json'), 'utf8'))
const CODE = WF.nodes.find((n) => n.name === 'Daten holen').parameters.jsCode

const CFG = {}
for (const a of WF.nodes.find((n) => n.name === 'Konfiguration').parameters.assignments.assignments) {
  CFG[a.name] = a.value
}
// Im Live-Workflow steht uvpPreisId leer, bis die richtige Verkaufspreis-ID
// feststeht. Der Test faehrt den eingeschalteten Zustand.
CFG.ersatzPreisId = '8'

// variantennummer = Amazon seller-sku, autor = aus dem Amazon-Titel geloester Autor
const BUECHER = [
  { nr: 'APR-10001-03-05-2026', titel: 'Dirty Diana: Das Erwachen (Dirty Diana-Trilogie, Band 1)', autor: 'Besser, Jen; Feste, Shana and Längsfeld, Sabine' },
  { nr: 'BL-0018-14-09-2025', titel: 'Mit dem Deutschland-Ticket unterwegs: Reiseführer mit den 40 besten Reiserouten', autor: 'Heue, Regine and Bahnmüller, Lisa' },
  { nr: 'FE-2093-21-02-2026', titel: 'Endlich Politik verstehen: Wie du nie wieder keine Ahnung hast', autor: 'Poppel, Nina' },
  { nr: 'JA-0352-19-01-2026', titel: 'Malte & Oßkar und das Glück, Pech zu haben', autor: 'Oßkar; Zierden, Malte; von Arenberg, Amia and von Arenberg, Amia' },
  { nr: 'MAR-0024-15-03-2026', titel: '(Fast) Alles einfach erklärt: Vom Big Bang quer durch die Weltgeschichte', autor: 'Kolorz, Niklas and Klaus, David' },
  { nr: 'MB-0000126-08-07-2025', titel: 'Earth for All Deutschland: Aufbruch in eine Zukunft für Alle', autor: 'Club of Rome and Wuppertal Institut' },
  { nr: 'PH-2036-03-01-2026', titel: 'Die große Energiekrise: ... und wie wir sie bewältigen können', autor: 'Vahrenholt, Prof. Dr. Fritz' },
  { nr: 'SC-0000018-05-07-2025', titel: 'Bring dein Herz zum Tanzen: Finde zu deiner inneren Stärke', autor: 'Wurster, Sandra' },
  { nr: 'SM-0000032-13-08-2025', titel: 'Skogland 1: Jugendthriller ab 12 Jahren', autor: 'Boie, Kirsten' },
  { nr: 'MAE-5111-12-03-2026', titel: '111 Orte in Zeeland, die man gesehen haben muss', autor: 'Roos, Dr. Martin' },
  { nr: 'PH-4439-08-12-2025', titel: 'Myrrhe, Mord und Marzipan: 24 Weihnachtskrimis von Hohwacht bis St. Moritz', autor: 'Gramoschke, Miriam; Achilles; Winkelmann, Andreas; Verhoeven, Anne; Bernard, Carine; Franke, Christiane; Kuhnert, Cornelia; Dieckerhoff, Christiane; Bardilac, Eleanor; Völler, Eva; Schwiecker, Florian; Pauly, Gisa; Lorentz, Iny; Pust, Justine; Kästner & Kästner; Bohnet, Katja; Rubel, Kerstin; Hofmann, Marc; Heitz, Markus; Kölpin, Regine; Ammer, Simon; Rüther, Sonja; Weinert, Steffen; Turhan, Su; Kastura, Thomas and Eckardt, Tilo' },
  { nr: 'APR-13092-10-06-2026', titel: 'Twelve and a Half: Leveraging the Emotional Ingredients Necessary for Business Success', autor: 'Vaynerchuk, Gary', ean: '9780063143791' },
  { nr: 'APR-13170-11-06-2026', titel: 'Windstärke 17: Der Roman nach ›22 Bahnen‹ | Nominiert für das Lieblingsbuch der Unabhängigen 2024 (Shortlist)', autor: 'Wahl, Caroline' },
  { nr: 'MAR-0025-04-09-2026', titel: 'Schmerz: Ein Fall für Dora und Rado | Der fesselnde Island-Krimi des Jahres - spannendes Ermittler-Duo, dunkle Geheimnisse und ein Fall, der unter die Haut geht', autor: 'Jónasson, Ragnar' },
  { nr: 'APR-13375-11-06-2026', titel: 'Sonne, Glück und Blaubeerduft: Die schönsten Geschichten von Astrid Lindgren, Sven Nordqvist u.a.', autor: 'Kutsch, Angelika; Lindgren, Astrid; Engelking, Katrin; Peters, Karl Kurt; Wikland, Ilon; Dohrenburg, Thyra; Nordqvist, Sven; Wieslander, Jujja; Heinig, Cäcilie and Bergström, Gunilla' },
]

// eBay zaehlt Bytes. Der Test muss genauso messen wie der Workflow, sonst
// laesst er genau die Titel durch, an denen eBay scheitert.
const bytes = (s) => Buffer.byteLength(String(s), 'utf8')

function baueStand({ mitListings, ohneMarketListing = 0, ohnePreis = [], nurUvp = [], ohneAutor = [], ohneBild = [], verifiedFehler = 0, ohnePruefung = 0, preisFehler = false, bilderFehlen = false, bestandNull = [], bestandAlt = false, bestandFehlt = false, bestandLeer = false, gpsrOhne = [], gpsrLuecke = [], gpsrCh = [], gpsrKeine = false, gpsrFehlt = false, laenderFehlen = false, gpsrFeldFehlt = false, gpsrZuordnungFehlt = false, bilderFehler = false }) {
  const items = [], variations = [], listings = [], markets = [], relations = [], preise = [], barcodes = [], bestand = [], bilder = []
  // Hersteller, wie /rest/items/manufacturers sie liefert. 1 = vollstaendig (DE),
  // 2 = ohne Anschrift und Mail, 3 = vollstaendig aber Sitz Schweiz (Nicht-EU).
  const hersteller = gpsrKeine ? [] : [
    { id: 1, name: 'Rowohlt Verlag GmbH', street: 'Kirchenallee 19', postcode: '20099',
      town: 'Hamburg', countryId: 1, email: 'produktsicherheit@rowohlt.de' },
    { id: 2, name: 'Verlag ohne Kontakt', street: '', postcode: '', town: '',
      countryId: 1, email: '' },
    { id: 3, name: 'Diogenes Verlag AG', street: 'Sprecherstrasse 8', postcode: '8032',
      town: 'Zuerich', countryId: 4, email: 'info@diogenes.ch' },
  ]
  const laender = [{ id: 1, isoCode2: 'DE' }, { id: 4, isoCode2: 'CH' }]
  // 0 = kein Hersteller am Artikel; sonst die ID von oben.
  const herstellerVon = (i) => gpsrZuordnungFehlt ? 0
                             : gpsrOhne.includes(i) ? 0
                             : gpsrLuecke.includes(i) ? 2
                             : gpsrCh.includes(i) ? 3 : 1
  BUECHER.forEach((b, i) => {
    const itemId = 200 + i
    const varId = 1200 + i
    items.push({
      id: itemId,
      texts: [{ lang: 'de', name1: b.titel }],
      ...(gpsrFeldFehlt ? {} : { manufacturerId: herstellerVon(i) }),
    })
    variations.push({ id: varId, itemId, number: b.nr, isMain: true })
    // Bilder haengen an der VARIANTE, so wie /rest/items/variations?with=images
    // sie liefert. Leeres Array = kein Cover, z. B. ein Buch ohne VLB-Treffer;
    // bilderFehlen laesst das Feld ganz weg, als hiesse die Relation anders.
    bilder.push({ id: varId, itemId,
      ...(bilderFehlen ? {} : { images: ohneBild.includes(i) ? [] : [{ id: 5000 + i }] }) })
    relations.push({ propertyId: 10, targetId: varId, values: [{ value: ohneAutor.includes(i) ? '' : b.autor }] })
    // Bestandszeile im FBA-Lager 2, wie /rest/stockmanagement/warehouses/2/stock sie
    // liefert. bestandAlt: letzter Amazon-Import liegt Stunden zurueck.
    bestand.push({
      variationId: varId, warehouseId: 2,
      stockNet: bestandNull.includes(i) ? 0 : 1, stockPhysical: bestandNull.includes(i) ? 0 : 1,
      reservedStock: 0,
      updatedAt: new Date(Date.now() - (bestandAlt ? 5 * 3600000 : 10 * 60000)).toISOString(),
    })
    // 978-3 = deutscher Sprachraum, sofern die Fixture nichts anderes sagt
    barcodes.push({ id: varId, itemId, variationBarcodes: [{ code: b.ean || ('9783' + String(100000000 + i)) }] })
    // nurUvp: kein gebundener Ladenpreis (7), aber ein UVP (2) - der Fall
    // 'Buch ohne Preisbindung', z. B. Importtitel.
    preise.push({
      id: varId, itemId,
      variationSalesPrices: ohnePreis.includes(i) ? []
        : nurUvp.includes(i) ? [{ salesPriceId: 8, price: 15.99 }]
        : [{ salesPriceId: 7, price: 19.9 }],
    })
    if (mitListings) {
      listings.push({ id: 500 + i, itemId })
      // Import 23 legt Listing und Market-Listing nacheinander an. Bricht er
      // dazwischen ab, bleibt das Listing allein zurueck.
      if (i < ohneMarketListing) return
      markets.push({
        id: 900 + i, listingId: 500 + i, referrerId: 2.08, variationId: varId,
        // ohnePruefung: verified fehlt ganz - so sieht ein Listing aus, das nach der
        // Anlage nie durch "Market-Listings pruefen" gelaufen ist.
        verified: i < verifiedFehler ? 'failed'
          : i < verifiedFehler + ohnePruefung ? undefined : 'succeeded',
        enabled: 'Y', duration: 'GTC',
      })
    }
  })
  // Von Hand angelegter Nicht-Buch-Artikel - darf nie ein eBay-Listing bekommen
  items.push({ id: 999, texts: [{ lang: 'de', name1: 'Adventskalender Testartikel' }],
               ...(gpsrFeldFehlt ? {} : { manufacturerId: gpsrZuordnungFehlt ? 0 : 1 }) })
  variations.push({ id: 1999, itemId: 999, number: 'MANUELL-1', isMain: true })
  bilder.push({ id: 1999, itemId: 999,
    ...(bilderFehlen ? {} : { images: [{ id: 5999 }] }) })
  preise.push({ id: 1999, itemId: 999, variationSalesPrices: [{ salesPriceId: 7, price: 12 }] })

  const stand = { items, variations, listings, markets, relations, barcodes, bestand, bestandFehlt, bestandLeer, hersteller, laender, gpsrFehlt, laenderFehlen, bilderFehler }
  if (bilderFehler) {
    Object.defineProperty(stand, 'bilder',
      { get() { throw new Error('500 undefined relationship') } })
  } else stand.bilder = bilder
  if (preisFehler) Object.defineProperty(stand, 'preise', { get() { throw new Error('500 undefined relationship') } })
  else stand.preise = preise
  return stand
}

async function lauf(stand, modus) {
  const seite = (arr, url) => {
    const p = Number((url.match(/[?&]page=(\d+)/) || [])[1] || 1)
    return { entries: arr.slice((p - 1) * 250, p * 250), isLastPage: p * 250 >= arr.length }
  }
  const ctx = {
    helpers: {
      httpRequest: async ({ url }) => {
        if (url.includes('/rest/items/manufacturers')) {
          if (stand.gpsrFehlt) throw new Error('500 Internal Server Error')
          return seite(stand.hersteller, url)
        }
        if (url.includes('/rest/orders/shipping/countries')) {
          if (stand.laenderFehlen) throw new Error('403 Forbidden')
          return seite(stand.laender, url)
        }
        if (url.includes('/rest/items?with=texts')) return seite(stand.items, url)
        if (url.includes('/rest/stockmanagement/warehouses/2/stock')) {
          if (stand.bestandFehlt) throw new Error('503 Service Unavailable')
          return seite(stand.bestandLeer ? [] : stand.bestand, url)
        }
        if (url.includes('/rest/items/variations?with=images')) return seite(stand.bilder, url)
        if (url.includes('/rest/items/variations?with=variationSalesPrices')) return seite(stand.preise, url)
        if (url.includes('/rest/items/variations?with=variationBarcodes')) return seite(stand.barcodes, url)
        if (url.includes('/rest/items/variations')) return seite(stand.variations, url)
        if (url.includes('/rest/listings/markets')) return seite(stand.markets, url)
        if (url.includes('/rest/listings')) return seite(stand.listings, url)
        if (url.includes('/rest/v2/properties/relations')) return seite(stand.relations, url)
        throw new Error('Unbekannte URL im Test: ' + url)
      },
    },
  }
  const knoten = {
    Konfiguration: { first: () => ({ json: CFG }) },
    'Zugang pruefen': { first: () => ({ json: { modus } }) },
    'PlentyONE Login': { first: () => ({ json: { accessToken: 'test-token' } }) },
  }
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor
  return (await new AsyncFunction('$', CODE).call(ctx, (n) => knoten[n]))[0].json
}

const fehler = []
const pruefe = (ok, text) => { console.log((ok ? '  OK   ' : '  FEHL ') + text); if (!ok) fehler.push(text) }

;(async () => {
  const N = BUECHER.length

  // ohnePreis bewusst auf 10/11 - deren Praefixe (PH, APR) kommen auch anderswo vor,
  // damit die Praefix-Pruefung nicht am Preis-Guard scheitert.
  console.log('=== Import 23: Artikel ohne Listing ===')
  const r1 = await lauf(baueStand({ mitListings: false, ohnePreis: [10, 11] }), 'listings')
  const a = r1.inhalt.split('\n')
  pruefe(a[0].split('\t').length === 9, 'Kopfzeile hat 9 Spalten')
  // Import-Skala: 2 = beschraenkt (ohne Reservierung). 1 war 'mit Reservierung'
  // (REST zeigte 2), 3 waere 'unbeschraenkt ohne Abgleich' - keine Automatik.
  pruefe(a.slice(1).every((z) => z.split('\t')[4] === '2'),
         'StockDependenceTypeID = 2 (beschraenkt ohne Reservierung, Import-Skala)')
  pruefe(a.length - 1 === N - 2, `${N - 2} Zeilen (2 ohne Buchpreisbindungspreis zurueckgehalten), erhalten ${a.length - 1}`)
  pruefe(!a.some((z) => z.startsWith('999\t')), 'Nicht-Buch bleibt draussen (E9/E11)')
  pruefe(r1.zahlen.ohne_bpb_preis === 2, 'Preis-Guard meldet 2 zurueckgehaltene Artikel (E10/AK4)')
  const durch = new Set(a.slice(1).map((z) => BUECHER[Number(z.split('\t')[0]) - 200].nr.split('-')[0]))
  pruefe(durch.size === new Set(BUECHER.map((b) => b.nr.split('-')[0])).size,
    `alle SKU-Praefixe kommen durch: ${[...durch].sort().join(',')} (K1/AK11)`)

  console.log('\n=== Import 23 nach der Anlage: idempotent ===')
  const voll = baueStand({ mitListings: true, verifiedFehler: 2 })
  pruefe((await lauf(voll, 'listings')).inhalt.split('\n').length === 1, 'keine zweite Anlage, keine Duplikate (E8/AK5)')

  console.log('\n=== Import 22: Merkmale ===')
  const r2 = await lauf(voll, 'merkmale')
  const b = r2.inhalt.split('\n')
  const kopf = b[0].split('\t')
  pruefe(kopf.slice(0, 3).join('\t') === 'MLID\tName\tWert', 'Kopfzeile beginnt mit MLID/Name/Wert')
  pruefe(kopf.length === 17, `17 Spalten: 3 Merkmale + 13 Konfigurationswerte + eBay-Titel, erhalten ${kopf.length}`)
  pruefe(b.slice(1).every((z) => z.split('\t').length === kopf.length), 'jede Zeile hat gleich viele Spalten')
  const spalte = (name) => kopf.indexOf(name)
  const erste = b[1].split('\t')
  pruefe(erste[spalte('kategorie_id')] === '261186', 'Kategorie 261186 steht in jeder Zeile')
  // "An Artikelpreis binden" ist Ja/Nein. Mit der Verkaufspreis-ID 7 antwortete
  // PlentyONE auf jede Zeile mit "Use Item Price invalid." (Import-Lauf 45).
  pruefe(erste[spalte('preisbindung')] === 'Y', 'An Artikelpreis binden = Y (7 und 1 wurden abgewiesen)')
  pruefe(erste[spalte('lager_id')] === '2', 'Lager 2 (FBA)')
  pruefe(b.slice(1).every((z) => z.split('\t')[spalte('bestandsabhaengigkeit')] === '2'),
         'Bestandsabhaengigkeit 2 in jeder Zeile - zieht bestehende Listings nach')
  pruefe(erste[spalte('mwst_land')] === '1' && erste[spalte('mwst')] === '7',
         'Steuer vollstaendig: Land 1 (DE) + Satz 7 - der Satz allein bleibt leer')

  // eBay laesst hoechstens 80 Zeichen im Angebotstitel zu. PlentyONE verweigert sonst
  // schon das Speichern ("Titel enthaelt zu viele Zeichen", MLID 12).
  const titel = b.slice(1).map(z => z.split('\t')[spalte('titel_ebay')])
  pruefe(titel.every(t => t && bytes(t) <= 80),
         `jeder eBay-Titel <= 80 BYTES, laengster ${Math.max(...titel.map(t => bytes(t || '')))}`)
  pruefe(titel.every(t => !/[|\u2013\u2014]\s*$/.test(t) && !/\s$/.test(t)),
         'kein Titel endet auf einem Trennzeichen')
  const anhangWeg = b.slice(1).find(z => z.split('\t')[spalte('titel_ebay')] === 'Schmerz: Ein Fall für Dora und Rado')
  pruefe(!!anhangWeg, 'Marketing-Anhang hinter " | " faellt weg statt mitten im Wort zu kappen')
  const mlids = b.slice(1).map((z) => z.split('\t')[0])
  pruefe(new Set(mlids).size === mlids.length, 'genau eine Zeile je MLID (E7)')
  let lang = 0, spalten = 0, paare = 0
  for (const z of b.slice(1)) {
    const t = z.split('\t')
    if (t.length !== kopf.length) { spalten++; continue }
    const namen = t[1].split(','), werte = t[2].split(',')
    if (namen.length !== werte.length) paare++
    for (const w of werte) if (bytes(w) > 65) lang++
  }
  pruefe(spalten === 0, 'keine zusaetzlichen Tabs in den Werten (E5)')
  pruefe(paare === 0, 'Anzahl Namen == Anzahl Werte je Zeile')
  pruefe(lang === 0, `jeder Merkmalswert <= 65 BYTES — auch der Autor (E4/K2), ${lang} zu lang`)
  // Der reale Fehlerfall: 61 Zeichen, aber 67 Bytes. Vor der Umstellung auf
  // Byte-Zaehlung rutschte genau dieser Titel durch und eBay wies ihn ab.
  const windstaerke = b.slice(1).find((z) => z.split('\t')[2].includes('Windst'))
  pruefe(!!windstaerke, 'der Windstaerke-Titel ist in der Datei')
  if (windstaerke) {
    const wert = windstaerke.split('\t')[2].split(',')[1]
    pruefe(bytes(wert) <= 65 && wert.length < 61,
           `Windstaerke-Buchtitel: ${wert.length} Zeichen / ${bytes(wert)} Bytes (Grenze 65 Bytes)`)
  }
  const sammelband = b.find((z) => z.startsWith('910\t'))
  pruefe(!!sammelband && !sammelband.includes('Kästner & Kästner'),
    'der 26-Autoren-Sammelband wird an der Autorengrenze gekappt')
  const dirty = b.find((z) => z.startsWith('900\t'))
  pruefe(!!dirty && dirty.includes('Jen Besser; Shana Feste; Sabine Längsfeld'),
    '"and" wird als Autorentrenner erkannt, Namen werden gedreht (E6)')

  console.log('\n=== Bericht ===')
  const ber = JSON.parse((await lauf(voll, 'bericht')).koerper)
  pruefe(ber.zahlen.geprueft_fehler === 2, 'verified=failed wird gezaehlt (AK3)')
  pruefe(ber.probleme.length === 2, 'fehlgeschlagene Listings mit MLID benannt (AK3/AK7)')
  pruefe(ber.ok === false, 'Bericht nicht gruen, solange Pruefungen offen sind')

  console.log('\n=== Listing, das nie geprueft wurde ===')
  const ungeprueft = baueStand({ mitListings: true, ohnePruefung: 5 })
  const b5 = JSON.parse((await lauf(ungeprueft, 'bericht')).koerper)
  pruefe(b5.zahlen.nicht_geprueft === 5, `5 ungepruefte Listings gezaehlt, erhalten ${b5.zahlen.nicht_geprueft}`)
  pruefe(b5.zahlen.geprueft_fehler === 0, 'ungeprueft ist NICHT dasselbe wie fehlgeschlagen')
  pruefe(b5.ok === false, 'Bericht ist ROT, solange Listings ungeprueft sind (vergessene Pruefung faellt auf)')
  pruefe(b5.probleme.some((p) => /noch nicht geprueft/.test(String(p.grund))),
    'jedes ungepruefte Listing wird mit MLID benannt')

  console.log('\n=== Sprache aus der ISBN-Gruppe ===')
  const englisch = b.slice(1).find((z) => z.split('\t')[2].includes('Twelve and a Half'))
  pruefe(!!englisch, 'das englische Buch steht in der Datei')
  if (englisch) {
    const t = englisch.split('\t')
    pruefe(t[2].split(',')[2] === 'Englisch',
           `EAN 978-0... ergibt Merkmal Sprache=Englisch, erhalten ${t[2].split(',')[2]}`)
    pruefe(t[spalte('sprache_code')] === 'en',
           `und sprache_code=en, erhalten ${t[spalte('sprache_code')]}`)
  }
  const deutsch = b[1].split('\t')
  pruefe(deutsch[2].split(',')[2] === 'Deutsch' && deutsch[spalte('sprache_code')] === 'de',
         'ein 978-3-Buch bleibt Deutsch/de')

  console.log('\n=== Kein gebundener Ladenpreis: Verkaufspreis 8 traegt ===')
  // PlentyONE waehlt selbst zwischen Preis 7 (Position 2) und 8 (Position 3).
  // Die Kette muss nur wissen, ob ueberhaupt einer da ist - gebunden wird immer.
  const ersatzStand = baueStand({ mitListings: true, nurUvp: [0, 1] })
  const rErs = await lauf(ersatzStand, 'merkmale')
  const bErs = rErs.inhalt.split('\n')
  const kErs = bErs[0].split('\t')
  const sp = (n) => kErs.indexOf(n)
  pruefe(!kErs.includes('festpreis'), 'die festpreis-Spalte ist raus')
  pruefe(bErs.slice(1).every((z) => z.split('\t')[sp('preisbindung')] === 'Y'),
         'jede Zeile bindet an den Artikelpreis - PlentyONE waehlt den richtigen')
  pruefe(rErs.zahlen.mit_ersatzpreis === 2,
         `mit_ersatzpreis zaehlt 2, erhalten ${rErs.zahlen.mit_ersatzpreis}`)
  const aErs = (await lauf(baueStand({ mitListings: false, nurUvp: [0, 1] }), 'listings')).inhalt.split('\n')
  pruefe(aErs.length - 1 === BUECHER.length,
         `Buecher mit Verkaufspreis 8 werden nicht zurueckgehalten, erhalten ${aErs.length - 1} von ${BUECHER.length}`)
  // Der Klartext nennt nur die Zahl - die Begruendung je Buch steht im Koerper,
  // den das Dashboard anzeigt.
  const bericht = await lauf(baueStand({ mitListings: false, ohnePreis: [0] }), 'bericht')
  const ohneAlles = JSON.parse(bericht.koerper).uebersprungen.map((u) => u.grund || '').join(' | ')
  pruefe(/weder Verkaufspreis 7 \(Buchpreisbindung\) noch 8 \(eBay-Preis\)/.test(ohneAlles),
         'ohne beide Preise nennt der Bericht beide IDs')

  console.log('\n=== Listing ohne Market-Listing (Import 23 auf halbem Weg) ===')
  const halb = baueStand({ mitListings: true, ohneMarketListing: 3 })
  const rHalb = await lauf(halb, 'listings')
  const aHalb = rHalb.inhalt.split('\n')
  pruefe(aHalb.length - 1 === 3,
         `die 3 halb angelegten Buecher stehen wieder in CSV A, erhalten ${aHalb.length - 1}`)
  pruefe(rHalb.zahlen.verwaiste_listings === 3,
         `verwaiste_listings zaehlt 3, erhalten ${rHalb.zahlen.verwaiste_listings}`)
  pruefe(rHalb.ok === false, 'Bericht ist ROT, solange ein Listing ohne Market-Listing dasteht')
  const bHalb = await lauf(halb, 'bericht')
  pruefe(/Listing\(s\) ohne Market-Listing/.test(bHalb.inhalt), 'der Bericht benennt den halben Zustand')

  console.log('\n=== Buch ohne Autor ===')
  const ohne = baueStand({ mitListings: true, ohneAutor: [4] })
  pruefe((await lauf(ohne, 'merkmale')).inhalt.split('\n').length - 1 === N - 1, 'keine unvollstaendige Merkmalzeile (E3)')
  const b3 = JSON.parse((await lauf(ohne, 'bericht')).koerper)
  pruefe(b3.uebersprungen.some((x) => String(x.grund).includes('kein Autor')),
    'das uebersprungene Buch wird namentlich genannt (E3/AK6)')

  console.log('\n=== Artikel ohne Bild ===')
  // eBay lehnt Angebote ohne Bild ab ('kein Artikelbild vorhanden'), deshalb
  // darf so ein Buch gar nicht erst in CSV A landen.
  const rBild = await lauf(baueStand({ mitListings: false, ohneBild: [0, 1] }), 'listings')
  pruefe(rBild.inhalt.split('\n').length - 1 === BUECHER.length - 2,
         `zwei Buecher ohne Bild werden zurueckgehalten, erhalten ${rBild.inhalt.split('\n').length - 1} von ${BUECHER.length - 2}`)
  const bBericht = await lauf(baueStand({ mitListings: false, ohneBild: [0, 1] }), 'bericht')
  pruefe(bBericht.zahlen.ohne_bild === 2, `ohne_bild zaehlt 2, erhalten ${bBericht.zahlen.ohne_bild}`)
  pruefe(/Ohne Artikelbild zurueckgehalten: 2/.test(bBericht.inhalt),
         'der Bericht zaehlt sie im Text mit')
  const uebBild = JSON.parse(bBericht.koerper).uebersprungen
  pruefe(uebBild.some((u) => /kein Artikelbild/.test(u.grund || '')),
         'die betroffenen Artikel stehen namentlich im Bericht')

  console.log('\n=== Bilder nicht lesbar ===')
  // Liefert PlentyONE gar kein Bildfeld, wird NICHT gefiltert - sonst faellt
  // stillschweigend das ganze Sortiment weg.
  const rOhneFeld = await lauf(baueStand({ mitListings: false, bilderFehlen: true }), 'listings')
  pruefe(rOhneFeld.inhalt.split('\n').length - 1 === BUECHER.length,
         `ohne lesbares Bildfeld wird nichts zurueckgehalten, erhalten ${rOhneFeld.inhalt.split('\n').length - 1} von ${BUECHER.length}`)
  const bOhneFeld = await lauf(baueStand({ mitListings: false, bilderFehlen: true }), 'bericht')
  pruefe(/Keine Variante meldet ein Bildfeld/.test(bOhneFeld.inhalt),
         'der Bericht nennt den Grund: die Relation heisst anders')
  pruefe(bOhneFeld.ok === false, 'und der Bericht ist deshalb nicht gruen')

  // Zweiter Ausfallweg: der Abruf selbst scheitert. Auch dann nicht filtern.
  // Genau dieser Fall lief vom 07.09.2026 an unbemerkt, weil der Guard die
  // Bilder am Artikel suchte - dort gibt es sie nicht.
  const rFehler = await lauf(baueStand({ mitListings: false, bilderFehler: true }), 'listings')
  pruefe(rFehler.inhalt.split('\n').length - 1 === BUECHER.length,
         `unlesbare Bilder halten kein Buch zurueck, erhalten ${rFehler.inhalt.split('\n').length - 1} von ${BUECHER.length}`)
  const bFehler = await lauf(baueStand({ mitListings: false, bilderFehler: true }), 'bericht')
  pruefe(/Artikelbilder liessen sich nicht lesen/.test(bFehler.inhalt) && bFehler.ok === false,
         'unlesbare Bilder: gemeldet und rot')
  pruefe(bFehler.zahlen.ohne_bild === 0, 'und es wird kein Buch faelschlich als bildlos gezaehlt')

  console.log('\n=== GPSR-Guard ===')
  // Art. 19 GPSR: ohne Herstellername, Anschrift und E-Mail darf kein Angebot
  // online. Der Guard haelt solche Buecher zurueck, statt sie abmahnbar zu listen.
  const gOk = await lauf(baueStand({ mitListings: false }), 'listings')
  pruefe(gOk.zahlen.ohne_gpsr === 0 && gOk.inhalt.split('\n').length - 1 === N,
         `vollstaendige Hersteller halten nichts zurueck, erhalten ${gOk.zahlen.ohne_gpsr}`)

  const gOhne = await lauf(baueStand({ mitListings: false, gpsrOhne: [0, 1] }), 'listings')
  pruefe(gOhne.zahlen.ohne_gpsr === 2, `ohne Hersteller am Artikel: 2, erhalten ${gOhne.zahlen.ohne_gpsr}`)
  pruefe(gOhne.inhalt.split('\n').length - 1 === N - 2, 'die zwei stehen nicht in CSV A')

  const gLuecke = await lauf(baueStand({ mitListings: false, gpsrLuecke: [2] }), 'listings')
  pruefe(gLuecke.zahlen.ohne_gpsr === 1, `unvollstaendiger Hersteller: 1, erhalten ${gLuecke.zahlen.ohne_gpsr}`)

  const bLuecke = await lauf(baueStand({ mitListings: false, gpsrLuecke: [2] }), 'bericht')
  pruefe(/Ohne GPSR-Herstellerangabe zurueckgehalten: 1/.test(bLuecke.inhalt),
         'der Bericht nennt die Zahl')
  const koerper = JSON.parse(bLuecke.koerper)
  pruefe(koerper.uebersprungen.some(u => /Verlag ohne Kontakt/.test(u.grund || '')
                                      && /Strasse/.test(u.grund || '')),
         'das Buch steht namentlich mit Grund in uebersprungen - so sieht es der Nutzer im Dashboard')

  // Schweizer Verlag: darf gelistet werden, wird aber gemeldet - Art. 19 verlangt
  // dort zusaetzlich eine verantwortliche Person in der EU.
  const gCh = await lauf(baueStand({ mitListings: false, gpsrCh: [0] }), 'bericht')
  pruefe(gCh.zahlen.ohne_gpsr === 0 && gCh.zahlen.gpsr_ausserhalb_eu === 1,
         `Nicht-EU-Hersteller wird gezaehlt, nicht gefiltert: erhalten ohne_gpsr `
         + `${gCh.zahlen.ohne_gpsr} / ausserhalb_eu ${gCh.zahlen.gpsr_ausserhalb_eu}`)
  pruefe(/AUSSERHALB der EU/.test(gCh.inhalt), 'der Bericht weist auf den EU-Verantwortlichen hin')

  // Kein Hersteller angelegt = Hersteller-Import fehlt. Dann NICHT alles filtern,
  // sondern melden und den Bericht rot machen.
  const gKeine = await lauf(baueStand({ mitListings: false, gpsrKeine: true }), 'bericht')
  pruefe(gKeine.zahlen.ohne_gpsr === 0, 'ohne angelegte Hersteller wird nichts stumm gefiltert')
  pruefe(/kein einziger Hersteller angelegt/.test(gKeine.inhalt) && gKeine.ok === false,
         'fehlender Hersteller-Import: gemeldet und rot')
  const aKeine = (await lauf(baueStand({ mitListings: false, gpsrKeine: true }), 'listings'))
                   .inhalt.split('\n')
  pruefe(aKeine.length - 1 === N, `CSV A bleibt vollstaendig, erhalten ${aKeine.length - 1} von ${N}`)

  const gFehlt = await lauf(baueStand({ mitListings: false, gpsrFehlt: true }), 'bericht')
  pruefe(/nicht lesen/.test(gFehlt.inhalt) && gFehlt.ok === false,
         'unlesbare Hersteller: gemeldet und rot')
  pruefe(gFehlt.zahlen.ohne_gpsr === 0, 'unlesbare Hersteller halten kein Buch zurueck')

  // Ohne Laenderliste laeuft der Guard weiter, nur die EU-Pruefung entfaellt.
  const gLand = await lauf(baueStand({ mitListings: false, gpsrCh: [0], laenderFehlen: true }), 'bericht')
  pruefe(/Land-IDs nicht lesbar/.test(gLand.inhalt),
         'ohne Laenderliste sagt der Bericht das auch fuer die Land-IDs')

  // Der Hersteller-Import verlangt am Feld Land die ID, nicht 'DE'. Welche
  // Zahl das ist, weiss nur das eigene System - der Bericht sagt es an.
  const gIds = await lauf(baueStand({ mitListings: false }), 'bericht')
  pruefe(/Land-IDs fuer den Hersteller-Import/.test(gIds.inhalt)
         && /DE=1/.test(gIds.inhalt) && /CH=4/.test(gIds.inhalt),
         'der Bericht nennt die Land-IDs im Klartext')
  pruefe(gLand.zahlen.gpsr_ausserhalb_eu === 0 && gLand.zahlen.ohne_gpsr === 0,
         'fehlende Laenderliste legt den Guard nicht lahm')

  // Heisst das Hersteller-Feld anders als erwartet, darf der Guard NICHT alles
  // filtern - das waere der teuerste Fehler, den er machen koennte.
  const gFeld = await lauf(baueStand({ mitListings: false, gpsrFeldFehlt: true }), 'bericht')
  pruefe(gFeld.zahlen.ohne_gpsr === 0 && /Hersteller-Feld/.test(gFeld.inhalt)
         && gFeld.ok === false,
         'unbekannter Feldname: nichts gefiltert, gemeldet und rot')
  const aFeld = (await lauf(baueStand({ mitListings: false, gpsrFeldFehlt: true }), 'listings'))
                  .inhalt.split('\n')
  pruefe(aFeld.length - 1 === N, `CSV A bleibt vollstaendig, erhalten ${aFeld.length - 1} von ${N}`)

  // Bestehende Listings kann der Guard nicht mehr zurueckhalten - sie sind online.
  // Er muss sie aber melden, sonst laeuft ein abmahnbares Angebot unbemerkt weiter.
  const gLive = await lauf(baueStand({ mitListings: true, gpsrLuecke: [2] }), 'bericht')
  pruefe(gLive.zahlen.listings_ohne_gpsr === 1,
         `laufendes Listing ohne Herstellerangabe wird gezaehlt, erhalten ${gLive.zahlen.listings_ohne_gpsr}`)
  pruefe(gLive.ok === false, 'und macht den Bericht rot')
  pruefe(/LAUFENDE\(S\) Listing/.test(gLive.inhalt), 'der Text warnt ausdruecklich')
  pruefe(JSON.parse(gLive.koerper).probleme.some(x => /LIVE mit unvollstaendigem/.test(x.grund || '')),
         'es steht mit MLID unter Probleme, nicht unter Uebersprungen')

  const gLiveOk = await lauf(baueStand({ mitListings: true }), 'bericht')
  pruefe(gLiveOk.zahlen.listings_ohne_gpsr === 0, 'vollstaendige Hersteller melden nichts')

  // Auch hier gilt: nicht pruefbar heisst nicht melden - sonst waeren schlagartig
  // alle laufenden Listings als abmahnbar markiert.
  const gLiveKeine = await lauf(baueStand({ mitListings: true, gpsrKeine: true }), 'bericht')
  pruefe(gLiveKeine.zahlen.listings_ohne_gpsr === 0,
         'ohne lesbare Hersteller wird kein laufendes Listing angeschwaerzt')

  const gLiveCh = await lauf(baueStand({ mitListings: true, gpsrCh: [1] }), 'bericht')
  pruefe(gLiveCh.zahlen.gpsr_ausserhalb_eu === 1 && gLiveCh.zahlen.listings_ohne_gpsr === 0,
         `laufendes Listing mit Nicht-EU-Hersteller: gezaehlt, nicht angeschwaerzt, erhalten ${gLiveCh.zahlen.gpsr_ausserhalb_eu}`)

  // Hersteller angelegt, aber niemand zeigt darauf: ein Einrichtungsfehler.
  // Der Guard darf daraus keine tausend Einzelmeldungen machen und erst recht
  // nicht jedes Buch zurueckhalten.
  const gZu = await lauf(baueStand({ mitListings: true, gpsrZuordnungFehlt: true }), 'bericht')
  pruefe(gZu.zahlen.listings_ohne_gpsr === 0 && gZu.zahlen.ohne_gpsr === 0,
         `fehlende Zuordnung schwaerzt nichts an, erhalten listings ${gZu.zahlen.listings_ohne_gpsr} / neu ${gZu.zahlen.ohne_gpsr}`)
  pruefe(/kein Artikel ist einem/.test(gZu.inhalt) && gZu.ok === false,
         'sie wird als eine Meldung genannt und macht den Bericht rot')
  pruefe(gZu.zahlen.gpsr_hersteller === 3 && gZu.zahlen.gpsr_zugeordnet === 0,
         `die Diagnosezahlen zeigen Hersteller ohne Zuordnung, erhalten ${gZu.zahlen.gpsr_hersteller} / ${gZu.zahlen.gpsr_zugeordnet}`)
  const aZu = (await lauf(baueStand({ mitListings: false, gpsrZuordnungFehlt: true }), 'listings'))
                .inhalt.split('\n')
  pruefe(aZu.length - 1 === N, `CSV A bleibt vollstaendig, erhalten ${aZu.length - 1} von ${N}`)

  // Gegenprobe: sobald wenigstens ein Artikel zugeordnet ist, sind fehlende
  // Hersteller wieder echte Einzelbefunde und werden gemeldet.
  const gEinzeln = await lauf(baueStand({ mitListings: true, gpsrOhne: [0] }), 'bericht')
  pruefe(gEinzeln.zahlen.listings_ohne_gpsr === 1 && gEinzeln.zahlen.gpsr_zugeordnet > 0,
         `einzelner Ausreisser wird weiterhin gemeldet, erhalten ${gEinzeln.zahlen.listings_ohne_gpsr}`)

  console.log('\n=== FBA-Bestand im Bericht ===')
  // Bestand 0 ist Normalfall (ausverkauft) und macht nie rot. Rot wird es nur,
  // wenn die Ueberwachung eingeschaltet ist UND der Bestand veraltet oder unlesbar ist.
  const bNormal = await lauf(baueStand({ mitListings: true, bestandNull: [0, 1] }), 'bericht')
  pruefe(bNormal.zahlen.bestand_kaufbar === N - 2 && bNormal.zahlen.bestand_null === 2,
         `kaufbar ${N - 2} / Bestand 0: 2, erhalten ${bNormal.zahlen.bestand_kaufbar} / ${bNormal.zahlen.bestand_null}`)
  pruefe(bNormal.zahlen.bestand_alter_min <= 11, `Alter des Bestands in Minuten, erhalten ${bNormal.zahlen.bestand_alter_min}`)
  pruefe(/FBA-Lager 2: kaufbar/.test(bNormal.inhalt), 'der Text nennt den FBA-Bestand')
  pruefe(bNormal.ok === true, 'Bestand 0 macht den Bericht nicht rot')

  const bAltAus = await lauf(baueStand({ mitListings: true, bestandAlt: true }), 'bericht')
  pruefe(/ACHTUNG: FBA-Bestand veraltet/.test(bAltAus.inhalt), 'veralteter Bestand wird immer gemeldet')
  pruefe(bAltAus.ok === true, 'ohne Ueberwachung bleibt der Bericht trotzdem gruen')

  CFG.bestandUeberwachung = 'Y'
  const bAltAn = await lauf(baueStand({ mitListings: true, bestandAlt: true }), 'bericht')
  pruefe(bAltAn.ok === false, 'mit Ueberwachung macht ein veralteter Bestand den Bericht rot')
  const bFehlt = await lauf(baueStand({ mitListings: true, bestandFehlt: true }), 'bericht')
  pruefe(/liess sich nicht lesen/.test(bFehlt.inhalt) && bFehlt.ok === false,
         'unlesbarer Bestand: gemeldet und rot')
  pruefe(bFehlt.zahlen.bestand_kaufbar === 0 && bFehlt.zahlen.bestand_null === 0,
         'unlesbarer Bestand zaehlt nichts - kein Buch gilt faelschlich als ausverkauft')
  const bLeer = await lauf(baueStand({ mitListings: true, bestandLeer: true }), 'bericht')
  pruefe(/keine Bestandszeilen/.test(bLeer.inhalt) && bLeer.ok === false,
         'leeres FBA-Lager: Amazon-Import laeuft nicht - gemeldet und rot')
  const bFrisch = await lauf(baueStand({ mitListings: true }), 'bericht')
  pruefe(bFrisch.ok === true, 'frischer Bestand mit Ueberwachung: gruen')
  CFG.bestandUeberwachung = 'N'
  // CSV A und B bleiben vom Bestand unberuehrt - nie filtern.
  const aFehlt = (await lauf(baueStand({ mitListings: false, bestandFehlt: true }), 'listings')).inhalt.split('\n')
  pruefe(aFehlt.length - 1 === N, `unlesbarer Bestand haelt kein Buch zurueck, erhalten ${aFehlt.length - 1} von ${N}`)

  console.log('\n=== Verkaufspreise nicht lesbar ===')
  const kaputt = baueStand({ mitListings: false, preisFehler: true })
  pruefe((await lauf(kaputt, 'listings')).inhalt.split('\n').length - 1 === N,
    'es wird NICHT stumm gefiltert, wenn der Preis-Guard nicht pruefen kann')
  const b4 = JSON.parse((await lauf(kaputt, 'bericht')).koerper)
  pruefe(b4.ok === false && b4.text.includes('ACHTUNG'), 'der Bericht verlangt ausdruecklich eine Handpruefung (AK4)')

  console.log('\n================================')
  console.log(fehler.length ? `${fehler.length} FEHLER:\n- ${fehler.join('\n- ')}` : 'alle Pruefungen bestanden')
  process.exit(fehler.length ? 1 : 0)
})()
