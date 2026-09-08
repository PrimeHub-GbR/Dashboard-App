// Beantwortet in einem einzigen Login mehrere offene Fragen an PlentyONE.
//
// Anlass war die kaufbare Menge 1 auf eBay bei neun Büchern im Bestand. Der
// erste Lauf hat gezeigt, wo das herkommt; dieser hier prüft es nicht mehr an
// einem Beispiel, sondern über alle 49 Listings - und nebenbei, wie frisch der
// FBA-Bestand wirklich ist (der stündliche Import ist noch nicht eingerichtet).
//
// Aufruf: node scripts/plentyone-diagnose.mjs
import { anmelden, alleSeiten } from './plentyone.mjs'

const LAGER_FBA = 2

/** Zählt Werte eines Feldes über eine Liste - zeigt Ausreißer statt Mittelwerte. */
function verteilung(liste, feld) {
  const z = new Map()
  for (const e of liste) {
    const k = JSON.stringify(e?.[feld])
    z.set(k, (z.get(k) || 0) + 1)
  }
  return [...z.entries()].sort((a, b) => b[1] - a[1])
    .map(([k, n]) => k + ' x' + n).join('   ')
}

const token = await anmelden()

const listings = await alleSeiten(token, '/rest/listings')
const markets = await alleSeiten(token, '/rest/listings/markets')
const varianten = await alleSeiten(token, '/rest/items/variations')
const bestand = await alleSeiten(token, '/rest/stockmanagement/warehouses/' + LAGER_FBA + '/stock')

console.log('== Listings (%d) ==', listings.length)
console.log('  stockDependenceTypeId : %s', verteilung(listings, 'stockDependenceTypeId'))
console.log('     (REST 3 = beschraenkt ohne Reservierung - Zielwert)')

console.log('\n== Market-Listings (%d) ==', markets.length)
console.log('  quantity              : %s', verteilung(markets, 'quantity'))
console.log('  enabled               : %s', verteilung(markets, 'enabled'))
console.log('  verified              : %s', verteilung(markets, 'verified'))

// Nur die Varianten, die tatsaechlich ein eBay-Listing haben.
const gelistet = new Set(markets.map((m) => String(m.variationId)))
const vGelistet = varianten.filter((v) => gelistet.has(String(v.id)))
console.log('\n== Varianten mit Listing (%d von %d) ==', vGelistet.length, varianten.length)
console.log('  mainWarehouseId       : %s', verteilung(vGelistet, 'mainWarehouseId'))
console.log('  stockLimitation       : %s', verteilung(vGelistet, 'stockLimitation'))
console.log('  maximumOrderQuantity  : %s', verteilung(vGelistet, 'maximumOrderQuantity'))

const bestandByVar = new Map(bestand.map((z) => [String(z.variationId), z]))
let summe = 0, ohneZeile = 0, null0 = 0, mehrAlsEins = 0
for (const v of vGelistet) {
  const z = bestandByVar.get(String(v.id))
  if (!z) { ohneZeile++; continue }
  const n = Number(z.stockNet) || 0
  summe += n
  if (n <= 0) null0++
  if (n > 1) mehrAlsEins++
}
const stand = bestand.map((z) => z.updatedAt).filter(Boolean).sort().pop()
const alterMin = stand ? Math.round((Date.now() - new Date(stand)) / 60000) : null

console.log('\n== FBA-Lager %d ==', LAGER_FBA)
console.log('  Bestandszeilen        : %d', bestand.length)
console.log('  gelistet ohne Zeile   : %d', ohneZeile)
console.log('  gelistet, Bestand 0   : %d', null0)
console.log('  gelistet, Bestand > 1 : %d  (die verlieren durch quantity=1 Umsatz)', mehrAlsEins)
console.log('  Summe Netto-Bestand   : %d', summe)
console.log('  letzter Stand         : %s  (vor %s Min.)', stand, alterMin)
