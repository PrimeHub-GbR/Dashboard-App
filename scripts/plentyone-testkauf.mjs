// Auswertung des ersten echten eBay-Testkaufs (09.09.2026).
//
// Der MCF-Flow ist gelaufen und an einer Stelle gescheitert: sellerSku war null.
// PlentyONE braucht für den Multi-Channel-Auftrag die Amazon-SKU der Variante -
// und findet sie offenbar nicht. Also: den Auftrag holen, seine Variante
// bestimmen und ALLE hinterlegten Markt-SKUs dieser Variante zeigen, samt
// Marktplatz- und Konto-Zuordnung. Nebenbei die übrigen Prüfpunkte des
// Testkaufs mitnehmen, damit ein Lauf reicht.
//
// Aufruf: node scripts/plentyone-testkauf.mjs
import { anmelden, holen, alleSeiten } from './plentyone.mjs'

const token = await anmelden()

// --- 1. Der eBay-Auftrag ------------------------------------------------------
const d = await holen(token,
  '/rest/orders?with[]=orderItems&with[]=documents&with[]=amounts&with[]=dates'
  + '&itemsPerPage=50&sortBy=createdAt&sortOrder=desc')
const ebay = (d.entries || []).filter((a) => String(a.referrerId).startsWith('2.'))

console.log('=== eBay-Aufträge: %d ===', ebay.length)
if (!ebay.length) {
  console.log('Kein Auftrag mit Herkunft 2.x gefunden.')
  process.exit(0)
}

const varianten = await alleSeiten(token, '/rest/items/variations?with=variationSkus')
const vonId = new Map(varianten.map((v) => [String(v.id), v]))

for (const a of ebay) {
  const b = (a.amounts || [])[0] || {}
  const rechnungen = (a.documents || []).filter((x) => /invoice/i.test(String(x.type || '')))
  console.log('\nAuftrag %s | Herkunft %s | Status %s', a.id, a.referrerId, a.statusName || a.statusId)
  console.log('  angelegt      : %s', a.createdAt)
  console.log('  Summe         : %s   bezahlt: %s', b.invoiceTotal, b.paidAmount)
  console.log('  Rechnung      : %s', rechnungen.length
    ? rechnungen.map((r) => r.number || r.id).join(',') : 'keine')

  for (const p of a.orderItems || []) {
    if (![1, 9].includes(Number(p.typeId))) continue
    const v = vonId.get(String(p.itemVariationId))
    console.log('  Position      : "%s"', String(p.orderItemName || '').slice(0, 50))
    console.log('    Steuersatz  : %s %% (Land %s)  vatField=%s', p.vatRate, p.countryVatId, p.vatField)
    console.log('    variationId : %s  -> %s', p.itemVariationId, v ? 'gefunden' : 'NICHT GEFUNDEN')
    if (!v) continue
    console.log('    Variante    : number=%s  vatId=%s  mainWarehouseId=%s',
      v.number, v.vatId, v.mainWarehouseId)
    const skus = v.variationSkus || []
    console.log('    Markt-SKUs  : %d', skus.length)
    for (const s of skus) {
      console.log('       marketId=%s  accountId=%s  status=%s  sku=%s  initialSku=%s',
        String(s.marketId).padEnd(4), String(s.accountId).padEnd(4),
        String(s.status).padEnd(9), JSON.stringify(s.sku), JSON.stringify(s.initialSku))
    }
  }
}

// --- 2. Wie sind die SKUs im Gesamtbestand verteilt? ---------------------------
console.log('\n=== Markt-SKUs über alle Varianten ===')
const proMarkt = new Map()
for (const v of varianten) {
  for (const s of v.variationSkus || []) {
    const k = 'marketId ' + s.marketId + ' / accountId ' + s.accountId + ' / ' + s.status
    proMarkt.set(k, (proMarkt.get(k) || 0) + 1)
  }
}
for (const [k, n] of [...proMarkt.entries()].sort()) console.log('   %s : %d', k, n)

// --- 3. Wer hat eine SKU unter Marktplatz 104? --------------------------------
// Der MCF-Fehler kommt aus dem SP-API-Modul, und die Amazon-Auftraege tragen
// referrerId 104.01. Verdacht: die neue Amazon-Integration sucht ihre SKU unter
// Marktplatz 104, waehrend unsere 50 Buecher ihre unter 4 haben.
console.log('\n=== Varianten mit einer SKU unter Marktplatz 104 ===')
for (const v of varianten) {
  const skus = v.variationSkus || []
  if (!skus.some((s) => Number(s.marketId) === 104)) continue
  console.log('Variante %s | number=%s | itemId=%s', v.id, v.number, v.itemId)
  for (const s of skus) {
    console.log('   marketId=%s accountId=%s status=%s sku=%s exportedAt=%s stockUpdatedAt=%s',
      String(s.marketId).padEnd(4), s.accountId, String(s.status).padEnd(9),
      JSON.stringify(s.sku), JSON.stringify(s.exportedAt), JSON.stringify(s.stockUpdatedAt))
  }
}

console.log('\n=== Zum Vergleich: die SKU der Testkauf-Variante 1207 ===')
for (const s of (vonId.get('1207')?.variationSkus) || []) {
  console.log('   marketId=%s accountId=%s status=%s sku=%s exportedAt=%s stockUpdatedAt=%s',
    String(s.marketId).padEnd(4), s.accountId, String(s.status).padEnd(9),
    JSON.stringify(s.sku), JSON.stringify(s.exportedAt), JSON.stringify(s.stockUpdatedAt))
}

// --- 4. Aktive Verkaufskanaele: was haben 1220/1221, was 1207 fehlt? ----------
// Alle Amazon-Kanaele stehen an der Variante auf "aus" (Read-only-Regel). Falls
// MCF eine aktive Kanalzuordnung braucht, waere das neben der SKU die zweite
// Ursache. Also die Kanaele der drei Varianten nebeneinanderlegen.
console.log('\n=== Verkaufskanaele je Variante ===')
try {
  const mitMarkets = await alleSeiten(token, '/rest/items/variations?with=variationMarkets')
  const mm = new Map(mitMarkets.map((v) => [String(v.id), v]))
  for (const id of ['1207', '1220', '1221']) {
    const v = mm.get(id)
    const kanaele = (v?.variationMarkets || []).map((m) => m.marketId).sort((a, b) => a - b)
    console.log('  Variante %s (%s): %s', id, v?.number || '?',
      kanaele.length ? kanaele.join(', ') : '(keine)')
  }
  // Wie viele Varianten haben ueberhaupt einen Amazon-Kanal aktiv?
  let mitAmazon = 0
  for (const v of mitMarkets) {
    if ((v.variationMarkets || []).some((m) => Math.floor(Number(m.marketId)) === 4
      || Math.floor(Number(m.marketId)) === 104)) mitAmazon++
  }
  console.log('  Varianten mit aktivem Amazon-Kanal (4.x oder 104.x): %d von %d',
    mitAmazon, mitMarkets.length)
} catch (e) {
  console.log('  variationMarkets nicht lesbar: ' + e.message.slice(0, 120))
}
