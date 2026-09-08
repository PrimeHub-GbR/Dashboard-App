// Letzte offene Frage: hängt der Steuersatz an der Artikelzuordnung? Die vier
// zugeordneten Positionen gegen die 46 nicht zugeordneten stellen - und die
// Namen mitausgeben, damit sich Buch von Nonbook unterscheiden lässt.
//
// Aufruf: node scripts/plentyone-auftrag.mjs
import { anmelden, holen, alleSeiten } from './plentyone.mjs'

const token = await anmelden()
const varianten = await alleSeiten(token, '/rest/items/variations')
const vonId = new Map(varianten.map((v) => [String(v.id), v]))

const d = await holen(token,
  '/rest/orders?with[]=orderItems&itemsPerPage=50&sortBy=createdAt&sortOrder=desc')

const mit = [], ohne = []
for (const a of d.entries || []) {
  for (const p of a.orderItems || []) {
    if (![1, 9].includes(Number(p.typeId))) continue
    const v = vonId.get(String(p.itemVariationId))
    ;(v ? mit : ohne).push({
      auftrag: a.id, satz: Number(p.vatRate), land: p.countryVatId,
      vatId: v ? v.vatId : null, name: String(p.orderItemName || '').slice(0, 52),
    })
  }
}

console.log('=== MIT Artikelzuordnung (%d) ===', mit.length)
for (const z of mit) {
  console.log('  Auftrag %s | Land %s | Satz %s %% | Variante vatId %s | %s',
    z.auftrag, z.land, String(z.satz).padEnd(2), z.vatId, z.name)
}

console.log('\n=== OHNE Artikelzuordnung (%d), nach Satz ===', ohne.length)
for (const satz of [...new Set(ohne.map((z) => z.satz))].sort((a, b) => a - b)) {
  const g = ohne.filter((z) => z.satz === satz)
  console.log('\n  --- %s %% (Land %s) : %d Positionen',
    satz, [...new Set(g.map((z) => z.land))].join('/'), g.length)
  for (const z of g.slice(0, 8)) console.log('      %s', z.name)
}
