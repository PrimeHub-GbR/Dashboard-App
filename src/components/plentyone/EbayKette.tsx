'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  ShoppingBag, CheckCircle2, XCircle, AlertTriangle, Copy, Check,
  RefreshCw, Loader2, Clock, ChevronDown, Info, ArrowRight,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'

export interface EbayBericht {
  id: string
  erstellt_at: string
  ok: boolean
  zahlen: Record<string, number>
  probleme: Array<{ mlid?: number | string; item_id?: number | string; titel?: string; grund?: string }>
  uebersprungen: Array<{ mlid?: number | string; item_id?: number | string; titel?: string; grund?: string }>
  text: string | null
}

type Zahlen = Record<string, number>
type Ampel = 'ok' | 'warnung' | 'fehler' | 'info'

/** Die vier Dateien, die PlentyONE selbst abholt — in der Reihenfolge der Zeitpläne. */
const ABHOLUNGEN = [
  {
    datei: 'hersteller.csv',
    zeit: '01:45',
    import: 'Herstellerimport',
    zweck: 'Verlage mit GPSR-Kontakt — muss VOR dem Artikelimport laufen',
  },
  {
    datei: 'artikel.csv',
    zeit: '02:00',
    import: 'Artikelimport',
    zweck: 'Artikel, Varianten, Preise, Bild-URL',
  },
  {
    datei: 'eigenschaften.csv',
    zeit: '02:30',
    import: 'Eigenschaftsimport',
    zweck: 'Autor, Erscheinungsdatum, Sprache, Seitenzahl, Bindung, Warengruppe, Thema',
  },
  {
    datei: 'ebay-listings.csv',
    zeit: '02:30',
    import: 'Import 23 — eBay-Listings anlegen',
    zweck: 'eine Zeile je Buch-Artikel ohne Listing',
  },
  {
    datei: 'ebay-merkmale.csv',
    zeit: '03:00',
    import: 'Import 22 — eBay-Merkmale',
    zweck: 'Autor, Buchtitel, Sprache je Market-Listing',
  },
] as const

/**
 * Jede Kennzahl mit ihrer Bedeutung, ihrem Zielwert und einer Bewertung.
 *
 * Die nackten Zahlen aus dem n8n-Bericht sagen niemandem, ob gerade alles in
 * Ordnung ist. Deshalb steht hier zu jeder Zahl: was sie bedeutet, welcher Wert
 * richtig wäre, und — wenn etwas klemmt — was zu tun ist.
 */
interface Pruefpunkt {
  key: string
  label: string
  bedeutung: string
  ziel: string
  bewerten: (wert: number, z: Zahlen) => Ampel
  /** Was der Mensch tun muss, wenn der Punkt nicht grün ist. */
  tun?: (wert: number, z: Zahlen) => string
}

interface Gruppe {
  titel: string
  erklaerung: string
  punkte: Pruefpunkt[]
}

const GRUPPEN: Gruppe[] = [
  {
    titel: '1 · Voraussetzungen je Buch',
    erklaerung:
      'Fehlt hier etwas, wird das Buch gar nicht erst zum Listing vorgeschlagen — es taucht unten unter „Zurückgehalten" auf.',
    punkte: [
      {
        key: 'ohne_bild',
        label: 'ohne Artikelbild',
        bedeutung:
          'eBay lehnt jedes Angebot ohne Bild ab. Gezählt wird das Bild an der Variante — ein Cover, das nur am Artikel hängt, reicht nicht.',
        ziel: '0',
        bewerten: (v) => (v === 0 ? 'ok' : 'fehler'),
        tun: () =>
          'Der nächtliche Lauf „Bilder mit Varianten verknüpfen" (04:30) hängt die Cover an die Varianten. Bleibt die Zahl über Nacht stehen, in n8n unter Executions nachsehen.',
      },
      {
        key: 'ohne_gpsr',
        label: 'ohne Herstellerangabe (GPSR)',
        bedeutung:
          'Art. 19 GPSR verlangt Name, Anschrift und E-Mail des Verlags in jedem Angebot. Ohne diese Daten darf das Buch nicht online.',
        ziel: '0',
        bewerten: (v) => (v === 0 ? 'ok' : 'fehler'),
        tun: () =>
          'Beim Verlag die GPSR-Kontaktdaten erfragen und über den Herstellerimport nachtragen.',
      },
      {
        key: 'ohne_bpb_preis',
        label: 'ohne Preis',
        bedeutung:
          'Weder gebundener Ladenpreis aus der VLB noch freier eBay-Preis. Ohne Preis kein Angebot.',
        ziel: '0',
        bewerten: (v) => (v === 0 ? 'ok' : 'fehler'),
        tun: () => 'Preis in PlentyONE an der Variante setzen (Verkaufspreis 7 oder 8).',
      },
      {
        key: 'gpsr_zugeordnet',
        label: 'Artikel mit Verlag verknüpft',
        bedeutung:
          'Diagnose: So viele Artikel zeigen auf einen Hersteller. Steht hier 0, fehlt im Artikelimport die Zuordnung „vlb_verlag → Hersteller-ID".',
        ziel: 'möglichst alle',
        bewerten: (v, z) => {
          const alle = z.artikel ?? 0
          if (v === 0) return 'fehler'
          return alle > 0 && v >= alle * 0.95 ? 'ok' : 'warnung'
        },
        tun: (v, z) =>
          v === 0
            ? 'Im Artikelimport die Zuordnung „vlb_verlag → Artikel » Hersteller-ID" einschalten.'
            : `${(z.artikel ?? 0) - v} Artikel haben keinen Verlag — meist Titel ohne VLB-Treffer.`,
      },
    ],
  },
  {
    titel: '2 · Listings anlegen (Import 23)',
    erklaerung:
      'Hier entsteht das eBay-Angebot. Die Warteschlange ist kein Fehler, sondern die Arbeit, die der nächste Import erledigt.',
    punkte: [
      {
        key: 'ohne_listing',
        label: 'warten auf Import 23',
        bedeutung:
          'So viele Zeilen bekommt Import 23 beim nächsten Lauf. Jede Zeile wird ein neues eBay-Listing.',
        ziel: 'sinkt auf 0',
        bewerten: (v) => (v === 0 ? 'ok' : 'info'),
        tun: () =>
          'Import 23 läuft nachts um 02:30 von selbst. Schneller geht es über Daten » Import » „eBay-Listings anlegen" » Import starten.',
      },
      {
        key: 'listings',
        label: 'eBay-Listings insgesamt',
        bedeutung: 'So viele Angebote existieren bereits in PlentyONE.',
        ziel: 'wächst',
        bewerten: () => 'info',
      },
      {
        key: 'verwaiste_listings',
        label: 'halb angelegte Listings',
        bedeutung:
          'Listing ohne Market-Listing: Die Anlage ist auf halber Strecke gescheitert. Der Artikel gilt als erledigt, steht aber in keinem Angebot.',
        ziel: '0',
        bewerten: (v) => (v === 0 ? 'ok' : 'fehler'),
        tun: () =>
          'Diese Artikel stehen wieder in der Warteschlange — Import 23 erneut starten, dann holt er den zweiten Schritt nach.',
      },
    ],
  },
  {
    titel: '3 · Startklar machen',
    erklaerung:
      'Angelegt ist nicht gestartet. PlentyONE prüft jedes Angebot gegen eBay, bevor es online darf.',
    punkte: [
      {
        key: 'geprueft_ok',
        label: 'Prüfung bestanden',
        bedeutung: 'Diese Angebote dürfen auf eBay gestartet werden.',
        ziel: '= Anzahl Listings',
        bewerten: (v, z) => (v > 0 && v === (z.listings ?? 0) ? 'ok' : 'info'),
      },
      {
        key: 'geprueft_fehler',
        label: 'Prüfung fehlgeschlagen',
        bedeutung: 'eBay hat das Angebot abgelehnt — der Grund steht unten in der Liste.',
        ziel: '0',
        bewerten: (v) => (v === 0 ? 'ok' : 'fehler'),
        tun: () => 'Grund unten aufklappen, Ursache beheben, dann „Market-Listings prüfen" erneut ausführen.',
      },
      {
        key: 'nicht_geprueft',
        label: 'noch nicht geprüft',
        bedeutung: 'Frisch angelegte Angebote, die PlentyONE noch nicht gegen eBay geprüft hat.',
        ziel: '0',
        bewerten: (v) => (v === 0 ? 'ok' : 'warnung'),
        tun: () =>
          'In PlentyONE: Artikel » Market-Listings » alle markieren » „Market-Listings prüfen".',
      },
      {
        key: 'merkmale',
        label: 'Merkmale gesetzt',
        bedeutung:
          'Zeilen für Import 22 — Autor, Buchtitel und Sprache je Angebot. Ohne sie zeigt eBay keine Buchdetails.',
        ziel: '= Anzahl Listings',
        bewerten: (v, z) => (v === (z.listings ?? 0) ? 'ok' : 'warnung'),
        tun: () => 'Import 22 läuft nachts um 03:00 — oder in PlentyONE von Hand starten.',
      },
    ],
  },
  {
    titel: '4 · Bestand aus dem Amazon-FBA-Lager',
    erklaerung:
      'Der Bestand kommt stündlich von Amazon. Er entscheidet nur, ob ein Angebot kaufbar ist — angelegt wird es in jedem Fall.',
    punkte: [
      {
        key: 'bestand_kaufbar',
        label: 'auf eBay kaufbar',
        bedeutung: 'Angebote mit Bestand größer null. Nur diese kann jemand tatsächlich kaufen.',
        ziel: 'möglichst viele',
        bewerten: (v) => (v > 0 ? 'ok' : 'warnung'),
        tun: () => 'Kein Angebot hat Bestand — FBA-Bestandsimport in PlentyONE prüfen.',
      },
      {
        key: 'bestand_null',
        label: 'ohne Bestand',
        bedeutung:
          'Diese Angebote stehen auf „nicht vorrätig". Das ist kein Fehler: Das Buch ist bei Amazon gerade ausverkauft und kommt von selbst zurück, sobald Ware eintrifft.',
        ziel: 'kein Zielwert',
        bewerten: () => 'info',
      },
      {
        key: 'bestand_alter_min',
        label: 'Bestandsstand alt (Minuten)',
        bedeutung: 'Wie lange der letzte Bestandsabgleich mit Amazon her ist. Normal sind unter 60 Minuten.',
        ziel: '< 120',
        bewerten: (v) => (v < 120 ? 'ok' : 'warnung'),
        tun: () =>
          'Der FBA-Bestandsimport hängt: PlentyONE » Einrichtung » Märkte » Amazon » Auftragseinstellungen » Bestandsimport prüfen.',
      },
    ],
  },
  {
    titel: '5 · Recht an laufenden Angeboten',
    erklaerung:
      'Diese Punkte betreffen Angebote, die bereits online sind. Hier zählt jede Zahl über null sofort.',
    punkte: [
      {
        key: 'listings_ohne_gpsr',
        label: 'laufende Angebote ohne Herstellerangabe',
        bedeutung:
          'Diese Angebote sind online und verstoßen gegen Art. 19 GPSR. Ein dokumentierter eBay-Fall kostete 1.216,60 €.',
        ziel: '0',
        bewerten: (v) => (v === 0 ? 'ok' : 'fehler'),
        tun: () =>
          'Sofort handeln: Verlagsdaten nachtragen oder die betroffenen Angebote beenden, bis die Daten vollständig sind.',
      },
      {
        key: 'listings_ohne_eu_vertreter',
        label: 'laufende Angebote ohne EU-Verantwortlichen',
        bedeutung:
          'Der Verlag sitzt außerhalb der EU und es ist keine verantwortliche Person in der EU benannt. Art. 19 GPSR verlangt sie.',
        ziel: '0',
        bewerten: (v) => (v === 0 ? 'ok' : 'fehler'),
        tun: () => 'Beim Großhändler erfragen, wer der Einführer ist, und beim Hersteller eintragen.',
      },
      {
        key: 'gpsr_ausserhalb_eu',
        label: 'Verlage außerhalb der EU',
        bedeutung:
          'Bücher dieser Verlage brauchen zusätzlich eine verantwortliche Person in der EU. Nur ein Hinweis, solange die Angebote nicht laufen.',
        ziel: 'kein Zielwert',
        bewerten: (v) => (v === 0 ? 'ok' : 'warnung'),
        tun: () => 'Beim Großhändler nach dem Einführer fragen und beim Hersteller hinterlegen.',
      },
      {
        key: 'mit_ersatzpreis',
        label: 'über den freien eBay-Preis',
        bedeutung:
          'Diese Bücher haben keinen gebundenen Ladenpreis in der VLB und werden über den freien Preis angeboten — bei Kalendern oder Spielzeug normal.',
        ziel: 'kein Zielwert',
        bewerten: () => 'info',
      },
    ],
  },
]

/** Der eine Satz, der oben steht: was als Nächstes zu tun ist. */
function naechsterSchritt(z: Zahlen): { ampel: Ampel; titel: string; text: string } {
  const w = (k: string) => z[k] ?? 0

  if (w('listings_ohne_gpsr') > 0 || w('listings_ohne_eu_vertreter') > 0) {
    return {
      ampel: 'fehler',
      titel: 'Sofort handeln — laufende Angebote sind abmahnbar',
      text: `${w('listings_ohne_gpsr') + w('listings_ohne_eu_vertreter')} Angebote sind online, ohne die nach Art. 19 GPSR vorgeschriebene Herstellerangabe. Verlagsdaten nachtragen oder Angebote beenden.`,
    }
  }
  if (w('geprueft_fehler') > 0) {
    return {
      ampel: 'fehler',
      titel: 'Prüfung fehlgeschlagen',
      text: `eBay hat ${w('geprueft_fehler')} Angebote abgelehnt. Gründe unten unter „Nicht startklar" aufklappen und beheben.`,
    }
  }
  if (w('verwaiste_listings') > 0) {
    return {
      ampel: 'fehler',
      titel: 'Import 23 erneut starten',
      text: `${w('verwaiste_listings')} Listings wurden nur halb angelegt. Sie stehen wieder in der Warteschlange — ein erneuter Import 23 holt den zweiten Schritt nach.`,
    }
  }
  if (w('ohne_bild') > 0) {
    return {
      ampel: 'warnung',
      titel: 'Bilder fehlen noch an den Varianten',
      text: `${w('ohne_bild')} Bücher werden zurückgehalten, weil das Cover nicht an der Variante hängt. Der Lauf „Bilder mit Varianten verknüpfen" um 04:30 erledigt das von selbst — danach hier aktualisieren.`,
    }
  }
  if (w('ohne_gpsr') > 0) {
    return {
      ampel: 'warnung',
      titel: 'Verlagsdaten unvollständig',
      text: `${w('ohne_gpsr')} Bücher haben keinen vollständigen GPSR-Kontakt und bleiben deshalb aus Import 23 heraus. Beim Verlag erfragen und nachtragen.`,
    }
  }
  if (w('nicht_geprueft') > 0) {
    return {
      ampel: 'warnung',
      titel: 'Market-Listings prüfen',
      text: `${w('nicht_geprueft')} Angebote sind angelegt, aber noch nicht gegen eBay geprüft. In PlentyONE: Artikel » Market-Listings » alle markieren » „Market-Listings prüfen".`,
    }
  }
  if (w('ohne_listing') > 0) {
    return {
      ampel: 'info',
      titel: `${w('ohne_listing')} Bücher warten auf Import 23`,
      text: 'Alle Voraussetzungen stimmen. Import 23 läuft nachts um 02:30 von selbst — oder du startest ihn in PlentyONE von Hand.',
    }
  }
  return {
    ampel: 'ok',
    titel: 'Alles startklar',
    text: 'Jedes Angebot ist angelegt, geprüft und hat einen Preis. Der letzte Schritt bleibt bewusst bei dir: In PlentyONE die Listings starten.',
  }
}

const AMPEL_STIL: Record<Ampel, { rahmen: string; text: string; Icon: typeof CheckCircle2 }> = {
  ok: {
    rahmen: 'border-emerald-500/20 bg-emerald-500/10',
    text: 'text-emerald-800 dark:text-emerald-200',
    Icon: CheckCircle2,
  },
  warnung: {
    rahmen: 'border-amber-500/20 bg-amber-500/10',
    text: 'text-amber-800 dark:text-amber-200',
    Icon: AlertTriangle,
  },
  fehler: {
    rahmen: 'border-red-500/20 bg-red-500/10',
    text: 'text-red-800 dark:text-red-200',
    Icon: XCircle,
  },
  info: {
    rahmen: 'border-sky-500/20 bg-sky-500/10',
    text: 'text-sky-800 dark:text-sky-200',
    Icon: Info,
  },
}

const datum = (iso: string) =>
  new Date(iso).toLocaleString('de-DE', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })

function UrlZeile({ basis, datei }: { basis: string; datei: string }) {
  const [kopiert, setKopiert] = useState(false)
  const url = `${basis}/api/plentyone/export/${datei}?t=DEIN_TOKEN`

  async function kopieren() {
    try {
      await navigator.clipboard.writeText(url)
      setKopiert(true)
      setTimeout(() => setKopiert(false), 1500)
    } catch {
      /* Zwischenablage nicht verfügbar — die URL steht ja im Text */
    }
  }

  return (
    <div className="flex items-center gap-2">
      <code className="min-w-0 flex-1 truncate rounded bg-muted px-2 py-1 text-xs text-foreground">
        {url}
      </code>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        onClick={kopieren}
        aria-label={`URL für ${datei} kopieren`}
      >
        {kopiert
          ? <Check className="h-3.5 w-3.5 text-emerald-600" aria-hidden />
          : <Copy className="h-3.5 w-3.5" aria-hidden />}
      </Button>
    </div>
  )
}

/** Eine Zeile der Prüfliste: Ampel, Bedeutung, Wert, Zielwert. */
function PruefZeile({ punkt, wert, zahlen }: { punkt: Pruefpunkt; wert: number; zahlen: Zahlen }) {
  const ampel = punkt.bewerten(wert, zahlen)
  const stil = AMPEL_STIL[ampel]
  const hinweis = ampel !== 'ok' && punkt.tun ? punkt.tun(wert, zahlen) : null

  return (
    <li className="flex gap-3 border-t border-border px-3 py-2.5 first:border-t-0">
      <stil.Icon className={`mt-0.5 h-4 w-4 shrink-0 ${stil.text}`} aria-hidden />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
          <span className="text-sm font-medium text-foreground">{punkt.label}</span>
          <span className="flex items-baseline gap-1.5 tabular-nums">
            <span className={`text-sm font-semibold ${stil.text}`}>{wert}</span>
            <span className="text-xs text-muted-foreground">Ziel: {punkt.ziel}</span>
          </span>
        </div>
        <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{punkt.bedeutung}</p>
        {hinweis && (
          <p className={`mt-1.5 flex items-start gap-1.5 text-xs leading-relaxed ${stil.text}`}>
            <ArrowRight className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
            <span>{hinweis}</span>
          </p>
        )}
      </div>
    </li>
  )
}

/** Aufklappbare Liste betroffener Titel — zugeklappt, weil es Hunderte sein können. */
function ProblemListe({
  titel,
  erklaerung,
  eintraege,
  ampel,
}: {
  titel: string
  erklaerung: string
  eintraege: EbayBericht['probleme']
  ampel: Ampel
}) {
  const [offen, setOffen] = useState(false)
  const stil = AMPEL_STIL[ampel]
  const zeigen = eintraege.slice(0, 100)

  return (
    <Collapsible open={offen} onOpenChange={setOffen}>
      <div className={`rounded-lg border ${stil.rahmen}`}>
        <CollapsibleTrigger className="group flex w-full items-start gap-2.5 px-3 py-2.5 text-left">
          <stil.Icon className={`mt-0.5 h-4 w-4 shrink-0 ${stil.text}`} aria-hidden />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`text-sm font-medium ${stil.text}`}>{titel}</span>
              <Badge variant="outline" className="font-normal tabular-nums">
                {eintraege.length}
              </Badge>
            </div>
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{erklaerung}</p>
          </div>
          <ChevronDown
            className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180"
            aria-hidden
          />
        </CollapsibleTrigger>

        <CollapsibleContent>
          <ul className="max-h-80 space-y-1 overflow-y-auto border-t border-border/50 px-3 py-2.5">
            {zeigen.map((p, i) => (
              <li key={`${p.mlid ?? p.item_id}-${i}`} className="text-xs leading-relaxed text-muted-foreground">
                <span className="text-foreground">
                  {p.mlid ? `MLID ${p.mlid}` : `Artikel ${p.item_id ?? '—'}`}
                </span>
                {p.titel ? ` · ${p.titel}` : ''}
                {p.grund ? ` — ${p.grund}` : ''}
              </li>
            ))}
            {eintraege.length > zeigen.length && (
              <li className="pt-1 text-xs text-muted-foreground">
                … und {eintraege.length - zeigen.length} weitere mit demselben Befund.
              </li>
            )}
          </ul>
        </CollapsibleContent>
      </div>
    </Collapsible>
  )
}

export function EbayKette({
  runId,
  freigabe,
  abrufe,
  zuletzt,
  onFreigabe,
}: {
  runId: string | null
  freigabe: boolean
  abrufe: number
  zuletzt: string | null
  onFreigabe: () => void
}) {
  const [berichte, setBerichte] = useState<EbayBericht[]>([])
  const [laden, setLaden] = useState(true)
  const [schalten, setSchalten] = useState(false)
  const [rechnet, setRechnet] = useState(false)
  const [fehler, setFehler] = useState<string | null>(null)
  const [basis, setBasis] = useState('https://dashboard.primehubgbr.com')
  // Die Abhol-URLs braucht man einmal beim Einrichten, danach nie wieder.
  const [urlsOffen, setUrlsOffen] = useState(false)

  useEffect(() => {
    if (typeof window !== 'undefined') setBasis(window.location.origin)
  }, [])

  const holen = useCallback(async () => {
    try {
      const res = await fetch('/api/plentyone/ebay/bericht', { cache: 'no-store' })
      if (res.ok) {
        const j = await res.json()
        setBerichte(j.berichte ?? [])
        return (j.berichte?.[0]?.erstellt_at ?? null) as string | null
      }
    } finally {
      setLaden(false)
    }
    return null
  }, [])

  useEffect(() => { void holen() }, [holen])

  /**
   * Stoesst den n8n-Workflow an und wartet, bis ein neuerer Bericht eintrifft.
   * n8n antwortet sofort und meldet das Ergebnis spaeter per Callback - deshalb
   * wird hier gepollt statt auf die Antwort zu warten. Der Lauf liest gut 2.000
   * Artikel aus PlentyONE, eine gute Minute ist normal. Bremst PlentyONE mit 429
   * (etwa waehrend eines laufenden Imports), wartet n8n ab und wiederholt - dann
   * dauert es laenger. Deshalb fuenf Minuten Geduld statt zwei.
   */
  async function neuBerechnen() {
    setFehler(null)
    setRechnet(true)
    const vorher = berichte[0]?.erstellt_at ?? null
    try {
      const res = await fetch('/api/plentyone/ebay/bericht/starten', { method: 'POST' })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        setFehler(j.error ?? `Start fehlgeschlagen (${res.status})`)
        return
      }
      for (let i = 0; i < 100; i++) {
        await new Promise((r) => setTimeout(r, 3000))
        const neu = await holen()
        if (neu && neu !== vorher) return
      }
      setFehler('Der Bericht kam nicht innerhalb von fünf Minuten zurück — Lauf in n8n prüfen.')
    } catch {
      setFehler('Der Bericht konnte nicht angestoßen werden.')
    } finally {
      setRechnet(false)
    }
  }

  async function freigabeUmlegen(an: boolean) {
    if (!runId) return
    setSchalten(true)
    try {
      await fetch(`/api/plentyone/runs/${runId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ export_freigabe: an }),
      })
      onFreigabe()
    } finally {
      setSchalten(false)
    }
  }

  const aktuell = berichte[0] ?? null
  const schritt = aktuell ? naechsterSchritt(aktuell.zahlen) : null
  const schrittStil = schritt ? AMPEL_STIL[schritt.ampel] : null

  return (
    <Card>
      <CardHeader className="gap-1">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <ShoppingBag className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
            <div>
              <CardTitle className="text-foreground">eBay-Automatisierung</CardTitle>
              <p className="mt-0.5 text-sm text-muted-foreground">
                PlentyONE holt die Dateien nachts selbst ab. Du musst nichts hochladen.
              </p>
            </div>
          </div>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => void neuBerechnen()}
            disabled={rechnet}
            className="gap-1.5"
          >
            {rechnet
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              : <RefreshCw className="h-3.5 w-3.5" aria-hidden />}
            {rechnet ? 'Bericht läuft…' : 'Aktualisieren'}
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {fehler && (
          <p className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            <XCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            {fehler}
          </p>
        )}

        {laden ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> Lade…
          </p>
        ) : !aktuell ? (
          <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
            Noch kein Bericht. Der Kontroll-Workflow in n8n meldet sich nach dem ersten
            nächtlichen Durchlauf hier — oder du klickst oben auf „Aktualisieren".
          </p>
        ) : (
          <>
            {/* ------------------------------------------- Was ist jetzt zu tun */}
            {schritt && schrittStil && (
              <div className={`rounded-lg border px-4 py-3 ${schrittStil.rahmen}`}>
                <div className="flex items-start gap-2.5">
                  <schrittStil.Icon className={`mt-0.5 h-5 w-5 shrink-0 ${schrittStil.text}`} aria-hidden />
                  <div className="min-w-0">
                    <p className={`text-sm font-semibold ${schrittStil.text}`}>
                      Nächster Schritt: {schritt.titel}
                    </p>
                    <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                      {schritt.text}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* ----------------------------------------------------- Prüfliste */}
            <section className="space-y-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-sm font-semibold text-foreground">Prüfliste</h3>
                <span className="text-xs text-muted-foreground">
                  Stand {datum(aktuell.erstellt_at)} · {aktuell.zahlen.artikel ?? 0} Artikel in PlentyONE
                </span>
              </div>

              {GRUPPEN.map((gruppe) => {
                const punkte = gruppe.punkte.filter((p) => p.key in aktuell.zahlen)
                if (punkte.length === 0) return null
                return (
                  <div key={gruppe.titel} className="space-y-2">
                    <div>
                      <h4 className="text-sm font-medium text-foreground">{gruppe.titel}</h4>
                      <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                        {gruppe.erklaerung}
                      </p>
                    </div>
                    <ul className="rounded-lg border border-border">
                      {punkte.map((p) => (
                        <PruefZeile
                          key={p.key}
                          punkt={p}
                          wert={aktuell.zahlen[p.key]}
                          zahlen={aktuell.zahlen}
                        />
                      ))}
                    </ul>
                  </div>
                )
              })}
            </section>

            {/* ------------------------------------------------- Problemlisten */}
            {(aktuell.probleme.length > 0 || aktuell.uebersprungen.length > 0) && (
              <section className="space-y-2">
                <h3 className="text-sm font-semibold text-foreground">Betroffene Titel</h3>

                {aktuell.probleme.length > 0 && (
                  <ProblemListe
                    ampel="fehler"
                    titel="Nicht startklar — Handeingriff nötig"
                    erklaerung="Diese Angebote existieren, dürfen aber nicht online. Aufklappen zeigt je Angebot den Grund."
                    eintraege={aktuell.probleme}
                  />
                )}

                {aktuell.uebersprungen.length > 0 && (
                  <ProblemListe
                    ampel="warnung"
                    titel="Zurückgehalten — kein Angebot angelegt"
                    erklaerung="Diesen Büchern fehlt etwas: Bild, Preis, Autor oder GPSR-Kontakt. Sie kommen automatisch dazu, sobald die Angabe da ist."
                    eintraege={aktuell.uebersprungen}
                  />
                )}
              </section>
            )}
          </>
        )}

        {/* -------------------------------------------------- Export-Freigabe */}
        {runId && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border px-4 py-3">
            <div className="space-y-0.5">
              <Label htmlFor="export-freigabe" className="text-sm text-foreground">
                Export für PlentyONE freigegeben
              </Label>
              <p className="text-xs text-muted-foreground">
                An: PlentyONE zieht Artikel und Eigenschaften aus diesem Lauf (7 Tage lang).
                Aus: die Abhol-URL liefert nur die Kopfzeile — nichts wird überschrieben.
                {abrufe > 0 && (
                  <>
                    {' '}Bisher {abrufe}&nbsp;Abrufe
                    {zuletzt ? `, zuletzt ${datum(zuletzt)}` : ''}.
                  </>
                )}
              </p>
            </div>
            <Switch
              id="export-freigabe"
              checked={freigabe}
              disabled={schalten}
              onCheckedChange={(an) => void freigabeUmlegen(an)}
            />
          </div>
        )}

        {/* --------------------------------------------------- Abhol-URLs */}
        <Collapsible asChild open={urlsOffen} onOpenChange={setUrlsOffen}>
        <section className="space-y-3">
          <div>
            <CollapsibleTrigger className="group flex w-full items-center gap-2 text-left">
              <ChevronDown
                className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180"
                aria-hidden
              />
              <h3 className="text-sm font-semibold text-foreground">
                Abhol-URLs für PlentyONE
              </h3>
              <span className="text-xs text-muted-foreground">
                ({ABHOLUNGEN.length}) — nur beim Einrichten nötig
              </span>
            </CollapsibleTrigger>
          </div>

          <CollapsibleContent className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Einmalig eintragen: Daten » Import » jeweilige Definition » Datenquelle
              „HTTPS / URL" und Zeitplan. <code className="rounded bg-muted px-1">DEIN_TOKEN</code>{' '}
              durch den Wert von <code className="rounded bg-muted px-1">PLENTYONE_EXPORT_TOKEN</code>{' '}
              aus den Vercel-Umgebungsvariablen ersetzen.
            </p>

          <ul className="space-y-3">
            {ABHOLUNGEN.map((a) => (
              <li key={a.datei} className="space-y-1.5 rounded-lg border border-border px-3 py-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className="gap-1 font-normal">
                    <Clock className="h-3 w-3" aria-hidden />
                    {a.zeit}
                  </Badge>
                  <span className="text-sm font-medium text-foreground">{a.import}</span>
                </div>
                <p className="text-xs text-muted-foreground">{a.zweck}</p>
                <UrlZeile basis={basis} datei={a.datei} />
              </li>
            ))}
          </ul>

          <p className="rounded-md border border-sky-500/20 bg-sky-500/10 px-3 py-2 text-xs leading-relaxed text-sky-800 dark:text-sky-200">
            Keine Stapelverarbeitung mehr nötig: Import 22 setzt Kategorie, Versandprofil, Zustand,
            Layout, Lager, MwSt, Sprache, Bilder, Preisbindung und den eBay-Titel selbst. Die Vorlage
            „Bücher (1)" ist damit überflüssig und kann nach dem Vollimport gelöscht werden.
          </p>
            </CollapsibleContent>
        </section>
        </Collapsible>
      </CardContent>
    </Card>
  )
}
