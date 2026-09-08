// Lesezugriff auf die PlentyONE-REST-API von der Kommandozeile.
//
// Bisher lief jede Frage an PlentyONE über den Umweg eBay-Bericht: eine
// Diagnosezeile in den n8n-Knoten bauen, einspielen, den Bericht laufen lassen,
// das Ergebnis aus Supabase lesen. Das hat funktioniert, kostet aber jedes Mal
// einen halben Umbau - und für eine einzelne Nachfrage ist es zu viel.
//
// Die Zugangsdaten stehen NICHT hier, sondern in .env.local (nicht in Git):
//
//   PLENTYONE_URL=https://<dein-system>.plentymarkets-cloud-de.com
//   PLENTYONE_USER=<REST-Benutzer>
//   PLENTYONE_PASSWORD=<Passwort>
//
// Aufruf:
//   node scripts/plentyone.mjs /rest/items/manufacturers
//   node scripts/plentyone.mjs /rest/items/variations?with=images --alle
//   node scripts/plentyone.mjs /rest/listings/markets --felder id,variationId,verified
//
// --alle    blättert alle Seiten durch (sonst nur die erste)
// --felder  gibt nur die genannten Felder aus, statt der vollen Datensätze
// --anzahl  gibt nur die Trefferzahl aus
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const WURZEL = process.cwd()

/** .env.local lesen, ohne eine Abhängigkeit dafür zu installieren. */
function umgebung() {
  const datei = path.join(WURZEL, '.env.local')
  if (!fs.existsSync(datei)) return {}
  const werte = {}
  for (const zeile of fs.readFileSync(datei, 'utf8').split('\n')) {
    const treffer = /^([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/.exec(zeile.trim())
    if (treffer) werte[treffer[1]] = treffer[2].replace(/^["']|["']$/g, '').trim()
  }
  return werte
}

const env = { ...umgebung(), ...process.env }
const BASIS = (env.PLENTYONE_URL || '').replace(/\/+$/, '')
const BENUTZER = env.PLENTYONE_USER
const PASSWORT = env.PLENTYONE_PASSWORD

if (!BASIS || !BENUTZER || !PASSWORT) {
  console.error(`Es fehlen Zugangsdaten in .env.local:

  PLENTYONE_URL=https://<dein-system>.plentymarkets-cloud-de.com
  PLENTYONE_USER=<REST-Benutzer>
  PLENTYONE_PASSWORD=<Passwort>

Lege dafür in PlentyONE einen eigenen Benutzer mit NUR Leserechten an
(Einrichtung » Einstellungen » Benutzer). Der Tempnutzer aus dem n8n-Workflow
sollte hier nicht stehen: er hat Schreibrechte und läuft mit dem Trial ab.`)
  process.exit(2)
}

/** Anmelden und Token holen. Der Token gilt für diesen Aufruf. */
export async function anmelden() {
  const antwort = await fetch(BASIS + '/rest/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ username: BENUTZER, password: PASSWORT }),
  })
  if (!antwort.ok) {
    throw new Error(`Anmeldung fehlgeschlagen (${antwort.status}). `
      + 'Benutzername, Passwort und URL in .env.local prüfen.')
  }
  const d = await antwort.json()
  const token = d.accessToken || d.access_token || d?.data?.accessToken
  if (!token) throw new Error('Kein Token in der Antwort: ' + JSON.stringify(d).slice(0, 200))
  return token
}

export async function holen(token, pfad) {
  const antwort = await fetch(BASIS + pfad, {
    headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' },
  })
  if (!antwort.ok) {
    const text = await antwort.text()
    throw new Error(`${antwort.status} bei ${pfad}: ${text.slice(0, 300)}`)
  }
  return antwort.json()
}

/** Blättert, solange PlentyONE weitere Seiten meldet. */
export async function alleSeiten(token, pfad) {
  const trenner = pfad.includes('?') ? '&' : '?'
  const alle = []
  for (let seite = 1; seite <= 400; seite++) {
    const d = await holen(token, `${pfad}${trenner}page=${seite}&itemsPerPage=250`)
    const eintraege = Array.isArray(d?.entries) ? d.entries : (Array.isArray(d) ? d : null)
    // Keine Liste: der Endpunkt kennt kein Blaettern - Antwort unveraendert zurueck.
    if (eintraege === null) return d
    alle.push(...eintraege)
    if (d.isLastPage || eintraege.length === 0) break
  }
  return alle
}

// Nur ausführen, wenn die Datei direkt gestartet wurde - beim Import nicht.
const direktGestartet = process.argv[1]
  && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])

if (direktGestartet) {
  const args = process.argv.slice(2)
  const alle = args.includes('--alle')
  const nurAnzahl = args.includes('--anzahl')
  const felderIdx = args.indexOf('--felder')
  const felder = felderIdx >= 0 ? (args[felderIdx + 1] || '').split(',').filter(Boolean) : null

  /** Erstes Argument, das weder Schalter noch Wert eines Schalters ist. */
  function pfadAusArgumenten() {
    for (let i = 0; i < args.length; i++) {
      if (args[i].startsWith('--')) { i++; continue }
      // Git Bash haengt bei /rest/... den Git-Installationspfad davor.
      const roh = args[i].replace(/^.*?(?=\/rest\/)/, '')
      return roh.startsWith('/') ? roh : '/' + roh
    }
    return null
  }

  const pfad = pfadAusArgumenten()
  if (!pfad || !pfad.startsWith('/rest/')) {
    console.error('Kein Pfad angegeben, z. B.: node scripts/plentyone.mjs /rest/items/manufacturers')
    process.exit(2)
  }

  const token = await anmelden()
  const ergebnis = alle ? await alleSeiten(token, pfad) : await holen(token, pfad)
  const zeilen = Array.isArray(ergebnis)
    ? ergebnis
    : (Array.isArray(ergebnis?.entries) ? ergebnis.entries : [ergebnis])

  if (nurAnzahl) {
    console.log(zeilen.length)
  } else if (felder) {
    for (const z of zeilen) {
      console.log(felder.map((f) => `${f}=${JSON.stringify(z?.[f])}`).join('  '))
    }
  } else {
    console.log(JSON.stringify(zeilen.length === 1 ? zeilen[0] : zeilen, null, 2))
  }
}
