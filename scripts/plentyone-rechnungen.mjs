// Rechnung 50000 stammt aus einem manuellen Klick - die Automatik hat sie nicht
// erzeugt. Damit steht die Frage neu: schuetzt die Automatik (faktura nur bei
// gesicherten Steuerdaten), oder hat sie fuer die 19-%-Auftraege nur noch nicht
// ausgeloest? Unterscheiden laesst sich das am Auftragsstatus: haengt sie an
// einem Status, muessten fakturierte und nicht fakturierte sich dort trennen.
//
// Aufruf: node scripts/plentyone-rechnungen.mjs
import { anmelden, holen } from './plentyone.mjs'

const MANUELL = ['50000']   // vom Nutzer von Hand erzeugt, nicht von der Automatik

const token = await anmelden()
const d = await holen(token,
  '/rest/orders?with[]=orderItems&with[]=documents&itemsPerPage=50&sortBy=createdAt&sortOrder=desc')

const selbstGerechnet = (n) => {
  const s = String(n)
  return s.includes('.') && s.split('.')[1].length > 2
}

const zeilen = []
for (const a of d.entries || []) {
  const pos = (a.orderItems || []).filter((p) => [1, 9].includes(Number(p.typeId)))
  if (!pos.length) continue
  const rechnungen = (a.documents || []).filter((x) => /invoice/i.test(String(x.type || '')))
  const nummern = rechnungen.map((r) => String(r.number || r.id))
  const b = (pos[0].amounts || [])[0] || {}
  zeilen.push({
    auftrag: a.id,
    status: String(a.statusId),
    satz: Number(pos[0].vatRate),
    land: String(pos[0].countryVatId),
    vcs: !selbstGerechnet(b.priceNet),
    // Nur Rechnungen zaehlen, die die Automatik erzeugt hat.
    fakturiert: nummern.some((n) => !MANUELL.includes(n)),
    korrekt: (pos[0].countryVatId === 1 && Number(pos[0].vatRate) === 7)
      || (pos[0].countryVatId === 2 && Number(pos[0].vatRate) === 10),
  })
}

const auto = zeilen.filter((z) => z.fakturiert)
const offen = zeilen.filter((z) => !z.fakturiert)
console.log('Aufträge: %d   davon von der Automatik fakturiert: %d\n', zeilen.length, auto.length)

console.log('Von der Automatik fakturiert:')
console.log('   Steuersatz korrekt : %d von %d', auto.filter((z) => z.korrekt).length, auto.length)
console.log('   mit VCS-Daten      : %d von %d', auto.filter((z) => z.vcs).length, auto.length)

console.log('\nNoch offen (keine Rechnung):')
console.log('   Steuersatz korrekt : %d von %d', offen.filter((z) => z.korrekt).length, offen.length)
console.log('   mit VCS-Daten      : %d von %d', offen.filter((z) => z.vcs).length, offen.length)

console.log('\nAuftragsstatus — fakturiert / offen:')
for (const st of [...new Set(zeilen.map((z) => z.status))].sort()) {
  const g = zeilen.filter((z) => z.status === st)
  console.log('   Status %s : %d / %d', st.padEnd(5),
    g.filter((z) => z.fakturiert).length, g.filter((z) => !z.fakturiert).length)
}

// Das entscheidende Gegenbeispiel: falscher Satz UND von der Automatik fakturiert.
const schlecht = auto.filter((z) => !z.korrekt)
console.log('\nVon der Automatik fakturiert MIT falschem Satz: %d', schlecht.length)
if (schlecht.length) {
  for (const z of schlecht) console.log('   Auftrag %s | %s %% Land %s', z.auftrag, z.satz, z.land)
} else {
  console.log('   -> kein Gegenbeispiel: die Automatik hat bisher nur Korrektes fakturiert')
}
