// Von 13 automatisch erzeugten Rechnungen sind 12 unauffällig. Eine trägt 20 %
// auf eine österreichische Lieferung, ohne dass Amazon Steuerdaten geliefert
// hätte - Bücher wären dort 10 %. Diese eine muss namentlich auf den Tisch,
// alles andere ist Statistik.
//
// Aufruf: node scripts/plentyone-rechnungen.mjs
import { anmelden, holen } from './plentyone.mjs'

const token = await anmelden()
const d = await holen(token,
  '/rest/orders?with[]=orderItems&with[]=documents&with[]=dates&itemsPerPage=50&sortBy=createdAt&sortOrder=desc')

const selbstGerechnet = (n) => {
  const s = String(n)
  return s.includes('.') && s.split('.')[1].length > 2
}

console.log('=== Alle Aufträge MIT erzeugter Rechnung ===\n')
for (const a of d.entries || []) {
  const rechnungen = (a.documents || []).filter((x) => /invoice/i.test(String(x.type || '')))
  if (!rechnungen.length) continue
  const pos = (a.orderItems || []).filter((p) => [1, 9].includes(Number(p.typeId)))
  const nr = rechnungen.map((r) => r.number || r.id).join(',')
  console.log('Auftrag %s | Rechnung %s', a.id, nr)
  for (const p of pos) {
    const b = (p.amounts || [])[0] || {}
    console.log('   %s %% (Land %s) | VCS %s | brutto %s netto %s | %s',
      String(p.vatRate).padEnd(2), p.countryVatId,
      selbstGerechnet(b.priceNet) ? 'fehlt    ' : 'geliefert',
      String(b.priceGross).padEnd(6), String(b.priceNet).padEnd(8),
      String(p.orderItemName || '').slice(0, 46))
  }
  console.log('')
}
