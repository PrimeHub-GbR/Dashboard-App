// Der Nettobetrag verrät, wer gerechnet hat: 12.90 (zwei Nachkommastellen) ist
// ein von Amazon GELIEFERTER Wert, 9.2437 (vier) hat PlentyONE selbst aus dem
// Bruttopreis geteilt. Also lässt sich abzählen, für welche Aufträge VCS-Daten
// ankamen - und ob die Lücke einem Muster folgt (Datum, Herkunft, Land).
//
// Aufruf: node scripts/plentyone-auftrag.mjs
import { anmelden, holen } from './plentyone.mjs'

const token = await anmelden()
const d = await holen(token,
  '/rest/orders?with[]=orderItems&with[]=dates&itemsPerPage=50&sortBy=createdAt&sortOrder=desc')

function datum(a) {
  const t = (a.dates || []).find((x) => Number(x.typeId) === 2) || (a.dates || [])[0]
  return t ? String(t.date).slice(0, 10) : '?'
}
/** Mehr als zwei Nachkommastellen: der Wert wurde geteilt, nicht geliefert. */
function selbstGerechnet(n) {
  const s = String(n)
  return s.includes('.') && s.split('.')[1].length > 2
}

const zeilen = []
for (const a of d.entries || []) {
  for (const p of a.orderItems || []) {
    if (![1, 9].includes(Number(p.typeId))) continue
    const b = (p.amounts || [])[0] || {}
    zeilen.push({
      datum: datum(a), land: String(p.countryVatId), satz: Number(p.vatRate),
      referrer: String(a.referrerId), geliefert: !selbstGerechnet(b.priceNet),
    })
  }
}

const gel = zeilen.filter((z) => z.geliefert)
const ger = zeilen.filter((z) => !z.geliefert)
console.log('Positionen gesamt                    : %d', zeilen.length)
console.log('  Netto von Amazon geliefert         : %d', gel.length)
console.log('  Netto von PlentyONE selbst geteilt : %d\n', ger.length)

function saetze(liste) {
  const z = new Map()
  for (const e of liste) {
    const k = e.satz + '%(L' + e.land + ')'
    z.set(k, (z.get(k) || 0) + 1)
  }
  return [...z.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => k + ' x' + n).join('  ')
}
console.log('Sätze wenn GELIEFERT : %s', saetze(gel))
console.log('Sätze wenn GETEILT   : %s\n', saetze(ger))

for (const [titel, feld] of [['Bestelldatum', 'datum'], ['Herkunft', 'referrer']]) {
  console.log('%s — geliefert / geteilt:', titel)
  const keys = [...new Set(zeilen.map((z) => z[feld]))].sort()
  for (const k of keys) {
    const g = zeilen.filter((z) => z[feld] === k)
    console.log('   %s : %d / %d', String(k).padEnd(12),
      g.filter((z) => z.geliefert).length, g.filter((z) => !z.geliefert).length)
  }
  console.log('')
}
