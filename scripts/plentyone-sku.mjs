// Die Amazon-Auftragspositionen kommen mit itemVariationId 0 an: PlentyONE
// ordnet sie keinem Artikel zu und nimmt deshalb den Normalsatz. Zugeordnet
// wird über die am Artikel hinterlegte Markt-SKU. Also nachsehen, welche SKUs
// dort stehen - und ob die SKU aus dem Auftragsnamen darunter ist.
//
// Aufruf: node scripts/plentyone-sku.mjs
import { anmelden, holen, alleSeiten } from './plentyone.mjs'

const token = await anmelden()

let skus = []
for (const weg of ['/rest/items/variations?with=variationSkus', '/rest/items/variations/skus']) {
  try {
    const liste = await alleSeiten(token, weg)
    const gesammelt = []
    for (const v of liste) {
      for (const s of (v.variationSkus || (v.sku ? [v] : []))) {
        gesammelt.push({ variationId: v.id ?? s.variationId, ...s })
      }
    }
    if (gesammelt.length) { skus = gesammelt; console.log('SKUs gelesen über: ' + weg); break }
    console.log(weg + ' -> keine SKU-Felder in der Antwort')
  } catch (e) {
    console.log(weg + ' -> ' + e.message.slice(0, 110))
  }
}

console.log('\nHinterlegte Markt-SKUs: %d', skus.length)
if (skus.length) {
  const jeMarkt = new Map()
  for (const s of skus) {
    const k = String(s.marketId)
    jeMarkt.set(k, (jeMarkt.get(k) || 0) + 1)
  }
  console.log('  je Marktplatz-ID : %s',
    [...jeMarkt.entries()].map(([k, n]) => k + ' x' + n).join('   '))
  console.log('  Beispiel         : %s', JSON.stringify(skus[0]))
}

// Gegenprobe: SKUs aus den letzten Auftragsnamen gegen Variantennummern.
const d = await holen(token, '/rest/orders?with[]=orderItems&itemsPerPage=20&sortBy=createdAt&sortOrder=desc')
const varianten = await alleSeiten(token, '/rest/items/variations')
const nachNummer = new Map(varianten.map((v) => [String(v.number), v]))
const nachSku = new Map(skus.map((s) => [String(s.sku), s]))

console.log('\nSKU aus dem Auftragsnamen gegen die Stammdaten:')
let ok = 0, fehlt = 0
for (const a of (d.entries || [])) {
  for (const p of a.orderItems || []) {
    const m = /\[([^\]]+)\]/.exec(p.orderItemName || '')
    if (!m) continue
    const sku = m[1]
    const alsNummer = nachNummer.get(sku)
    const alsSku = nachSku.get(sku)
    if (alsNummer || alsSku) ok++; else fehlt++
    if (ok + fehlt <= 6) {
      console.log('  %s | Variantennummer: %s | Markt-SKU: %s',
        sku.padEnd(24),
        alsNummer ? 'ja (id ' + alsNummer.id + ', vatId ' + alsNummer.vatId + ')' : 'nein',
        alsSku ? 'ja (Markt ' + alsSku.marketId + ')' : 'nein')
    }
  }
}
console.log('\n  gefunden: %d   nicht gefunden: %d', ok, fehlt)
