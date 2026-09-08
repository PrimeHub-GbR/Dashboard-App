// Drei Lücken, die verdächtig gleich groß sind: 16 Aufträge mit VCS-Steuerdaten,
// 15 mit erfasster Zahlung, 13 mit Rechnung. Falls das dieselben Aufträge sind,
// ist es EINE Lücke - Amazon hat für diese Bestellungen vollständig geliefert
// und für die anderen nicht. Dann ist "ausstehend" keine offene Forderung,
// sondern eine fehlende Meldung.
//
// Aufruf: node scripts/plentyone-zahlungen.mjs
import { anmelden, holen } from './plentyone.mjs'

const token = await anmelden()
const d = await holen(token,
  '/rest/orders?with[]=orderItems&with[]=documents&with[]=amounts&with[]=dates'
  + '&itemsPerPage=50&sortBy=createdAt&sortOrder=desc')

const selbstGerechnet = (n) => {
  const s = String(n)
  return s.includes('.') && s.split('.')[1].length > 2
}

const zeilen = []
for (const a of d.entries || []) {
  const pos = (a.orderItems || []).filter((p) => [1, 9].includes(Number(p.typeId)))
  if (!pos.length) continue
  const b = (a.amounts || [])[0] || {}
  const pb = (pos[0].amounts || [])[0] || {}
  zeilen.push({
    auftrag: a.id,
    bezahlt: Number(b.paidAmount) > 0,
    vcs: !selbstGerechnet(pb.priceNet),
    rechnung: (a.documents || []).some((x) => /invoice/i.test(String(x.type || ''))),
    satzOk: (Number(pos[0].countryVatId) === 1 && Number(pos[0].vatRate) === 7)
      || (Number(pos[0].countryVatId) === 2 && Number(pos[0].vatRate) === 10),
    zahldatum: (a.dates || []).some((t) => Number(t.typeId) === 3),
  })
}

console.log('Aufträge: %d\n', zeilen.length)
console.log('  mit VCS-Steuerdaten : %d', zeilen.filter((z) => z.vcs).length)
console.log('  mit Zahlung erfasst : %d', zeilen.filter((z) => z.bezahlt).length)
console.log('  mit Zahlungsdatum   : %d  (Datumstyp 3)', zeilen.filter((z) => z.zahldatum).length)
console.log('  mit Rechnung        : %d', zeilen.filter((z) => z.rechnung).length)

const beide = zeilen.filter((z) => z.vcs === z.bezahlt).length
console.log('\nVCS-Daten und Zahlung stimmen überein bei %d von %d Aufträgen', beide, zeilen.length)

console.log('\nKreuztabelle VCS x bezahlt x Rechnung x Satz korrekt:')
const k = new Map()
for (const z of zeilen) {
  const s = 'VCS ' + (z.vcs ? 'ja ' : 'nein') + ' | bezahlt ' + (z.bezahlt ? 'ja ' : 'nein')
    + ' | Rechnung ' + (z.rechnung ? 'ja ' : 'nein') + ' | Satz ' + (z.satzOk ? 'ok    ' : 'falsch')
  k.set(s, (k.get(s) || 0) + 1)
}
for (const [s, n] of [...k.entries()].sort()) console.log('   %s  x%d', s, n)

const abweichler = zeilen.filter((z) => z.vcs !== z.bezahlt)
if (abweichler.length) {
  console.log('\nAufträge, bei denen VCS und Zahlung auseinanderfallen:')
  for (const z of abweichler) {
    console.log('   Auftrag %s | VCS %s | bezahlt %s | Rechnung %s',
      z.auftrag, z.vcs ? 'ja' : 'nein', z.bezahlt ? 'ja' : 'nein', z.rechnung ? 'ja' : 'nein')
  }
}
