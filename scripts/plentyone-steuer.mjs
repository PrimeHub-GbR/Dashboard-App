// Warum steht auf der Rechnung der falsche Steuersatz?
//
// Kandidaten, in dieser Reihenfolge: (a) die Umsatzsteuer-Einstellung am Artikel
// selbst, (b) die Steuersatz-Tabelle des Mandanten, (c) der Auftrag. PlentyONE
// speichert an der Variante keine Prozentzahl, sondern eine POSITION in dieser
// Tabelle - dieselbe Falle wie bei den Verkaufspreisen. Steht dort die Position
// des Normalsatzes, wird aus 7 % stillschweigend 19 %.
//
// Aufruf: node scripts/plentyone-steuer.mjs
import { anmelden, holen, alleSeiten } from './plentyone.mjs'

function verteilung(liste, feld) {
  const z = new Map()
  for (const e of liste) {
    const k = JSON.stringify(e?.[feld])
    z.set(k, (z.get(k) || 0) + 1)
  }
  return [...z.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => k + ' x' + n).join('   ')
}

const token = await anmelden()

// --- 1. Steuersatz-Tabelle des Mandanten -------------------------------------
for (const weg of ['/rest/vat', '/rest/vat/standard', '/rest/vat/locations']) {
  try {
    const d = await holen(token, weg)
    console.log('\n=== ' + weg + ' ===')
    console.log(JSON.stringify(d, null, 2).slice(0, 2500))
  } catch (e) {
    console.log('\n' + weg + ': ' + e.message.slice(0, 120))
  }
}

// --- 2. Was steht an den Buch-Varianten? -------------------------------------
const varianten = await alleSeiten(token, '/rest/items/variations')
const markets = await alleSeiten(token, '/rest/listings/markets')
const gelistet = new Set(markets.map((m) => String(m.variationId)))
const buecher = varianten.filter((v) => gelistet.has(String(v.id)))

console.log('\n=== Varianten mit eBay-Listing (%d) ===', buecher.length)
for (const feld of ['vatId', 'vatField', 'taxId']) {
  if (buecher.some((v) => v?.[feld] !== undefined)) {
    console.log('  %s : %s', feld.padEnd(10), verteilung(buecher, feld))
  }
}
console.log('  alle Feldnamen der Variante:')
console.log('   ', Object.keys(buecher[0] || {}).join(', '))
