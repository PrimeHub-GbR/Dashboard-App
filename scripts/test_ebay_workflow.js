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
  { nr: 'MAR-0025-04-09-2026', titel: 'Schmerz: Ein Fall für Dora und Rado | Der fesselnde Island-Krimi des Jahres - spannendes Ermittler-Duo, dunkle Geheimnisse und ein Fall, der unter die Haut geht', autor: 'Jónasson, Ragnar' },
  { nr: 'APR-13375-11-06-2026', titel: 'Sonne, Glück und Blaubeerduft: Die schönsten Geschichten von Astrid Lindgren, Sven Nordqvist u.a.', autor: 'Kutsch, Angelika; Lindgren, Astrid; Engelking, Katrin; Peters, Karl Kurt; Wikland, Ilon; Dohrenburg, Thyra; Nordqvist, Sven; Wieslander, Jujja; Heinig, Cäcilie and Bergström, Gunilla' },
]

function baueStand({ mitListings, ohneMarketListing = 0, ohnePreis = [], ohneAutor = [], verifiedFehler = 0, ohnePruefung = 0, preisFehler = false }) {
  const items = [], variations = [], listings = [], markets = [], relations = [], preise = []
  BUECHER.forEach((b, i) => {
    const itemId = 200 + i
    const varId = 1200 + i
    items.push({ id: itemId, texts: [{ lang: 'de', name1: b.titel }] })
    variations.push({ id: varId, itemId, number: b.nr, isMain: true })
    relations.push({ propertyId: 10, targetId: varId, values: [{ value: ohneAutor.includes(i) ? '' : b.autor }] })
    preise.push({
      id: varId, itemId,
      variationSalesPrices: ohnePreis.includes(i) ? [] : [{ salesPriceId: 7, price: 19.9 }],
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
  items.push({ id: 999, texts: [{ lang: 'de', name1: 'Adventskalender Testartikel' }] })
  variations.push({ id: 1999, itemId: 999, number: 'MANUELL-1', isMain: true })
  preise.push({ id: 1999, itemId: 999, variationSalesPrices: [{ salesPriceId: 7, price: 12 }] })

  const stand = { items, variations, listings, markets, relations }
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
        if (url.includes('/rest/items?with=texts')) return seite(stand.items, url)
        if (url.includes('/rest/items/variations?with=variationSalesPrices')) return seite(stand.preise, url)
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
  pruefe(kopf.length === 16, `16 Spalten: 3 Merkmale + 12 Konfigurationswerte + eBay-Titel, erhalten ${kopf.length}`)
  pruefe(b.slice(1).every((z) => z.split('\t').length === kopf.length), 'jede Zeile hat gleich viele Spalten')
  const spalte = (name) => kopf.indexOf(name)
  const erste = b[1].split('\t')
  pruefe(erste[spalte('kategorie_id')] === '261186', 'Kategorie 261186 steht in jeder Zeile')
  // "An Artikelpreis binden" ist Ja/Nein. Mit der Verkaufspreis-ID 7 antwortete
  // PlentyONE auf jede Zeile mit "Use Item Price invalid." (Import-Lauf 45).
  pruefe(erste[spalte('preisbindung')] === 'Y', 'An Artikelpreis binden = Y (7 und 1 wurden abgewiesen)')
  pruefe(erste[spalte('lager_id')] === '2', 'Lager 2 (FBA)')
  pruefe(erste[spalte('mwst_land')] === '1' && erste[spalte('mwst')] === '7',
         'Steuer vollstaendig: Land 1 (DE) + Satz 7 - der Satz allein bleibt leer')

  // eBay laesst hoechstens 80 Zeichen im Angebotstitel zu. PlentyONE verweigert sonst
  // schon das Speichern ("Titel enthaelt zu viele Zeichen", MLID 12).
  const titel = b.slice(1).map(z => z.split('\t')[spalte('titel_ebay')])
  pruefe(titel.every(t => t && t.length <= 80),
         `jeder eBay-Titel <= 80 Zeichen, laengster ${Math.max(...titel.map(t => (t||'').length))}`)
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
    for (const w of werte) if (w.length > 65) lang++
  }
  pruefe(spalten === 0, 'keine zusaetzlichen Tabs in den Werten (E5)')
  pruefe(paare === 0, 'Anzahl Namen == Anzahl Werte je Zeile')
  pruefe(lang === 0, `jeder Merkmalswert <= 65 Zeichen — auch der Autor (E4/K2), ${lang} zu lang`)
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
