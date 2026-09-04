'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  ShoppingBag, CheckCircle2, XCircle, AlertTriangle, Copy, Check,
  RefreshCw, Loader2, Clock,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'

export interface EbayBericht {
  id: string
  erstellt_at: string
  ok: boolean
  zahlen: Record<string, number>
  probleme: Array<{ mlid?: number | string; item_id?: number | string; titel?: string; grund?: string }>
  uebersprungen: Array<{ mlid?: number | string; item_id?: number | string; titel?: string; grund?: string }>
  text: string | null
}

/** Die vier Dateien, die PlentyONE selbst abholt — in der Reihenfolge der Zeitpläne. */
const ABHOLUNGEN = [
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
    zeit: '03:00',
    import: 'Import 23 — eBay-Listings anlegen',
    zweck: 'eine Zeile je Buch-Artikel ohne Listing',
  },
  {
    datei: 'ebay-merkmale.csv',
    zeit: '04:00',
    import: 'Import 22 — eBay-Merkmale',
    zweck: 'Autor, Buchtitel, Sprache je Market-Listing',
  },
] as const

const ZAHL_LABEL: Record<string, string> = {
  artikel: 'Artikel in PlentyONE',
  ohne_listing: 'ohne eBay-Listing',
  listings: 'eBay-Listings',
  geprueft_ok: 'Prüfung bestanden',
  geprueft_fehler: 'Prüfung fehlgeschlagen',
  nicht_geprueft: 'noch nicht geprüft',
  merkmale: 'Merkmale gesetzt',
  ohne_bpb_preis: 'ohne Buchpreisbindungspreis',
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
  const [basis, setBasis] = useState('https://dashboard.primehubgbr.com')

  useEffect(() => {
    if (typeof window !== 'undefined') setBasis(window.location.origin)
  }, [])

  const holen = useCallback(async () => {
    try {
      const res = await fetch('/api/plentyone/ebay/bericht', { cache: 'no-store' })
      if (res.ok) {
        const j = await res.json()
        setBerichte(j.berichte ?? [])
      }
    } finally {
      setLaden(false)
    }
  }, [])

  useEffect(() => { void holen() }, [holen])

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

  return (
    <Card>
      <CardHeader className="gap-1">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <ShoppingBag className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
            <div>
              <CardTitle className="text-foreground">eBay-Automatisierung</CardTitle>
              <p className="mt-0.5 text-sm text-muted-foreground">
                PlentyONE holt die vier Dateien nachts selbst ab. Du musst nichts hochladen.
              </p>
            </div>
          </div>
          <Button type="button" size="sm" variant="ghost" onClick={() => void holen()} className="gap-1.5">
            <RefreshCw className="h-3.5 w-3.5" aria-hidden />
            Aktualisieren
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
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

        {/* -------------------------------------------------------- Bericht */}
        <section className="space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-sm font-semibold text-foreground">Letzter Statusbericht</h3>
            {aktuell && (
              <span className="text-xs text-muted-foreground">{datum(aktuell.erstellt_at)}</span>
            )}
          </div>

          {laden ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> Lade…
            </p>
          ) : !aktuell ? (
            <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
              Noch kein Bericht. Der Kontroll-Workflow in n8n meldet sich nach dem ersten
              nächtlichen Durchlauf hier.
            </p>
          ) : (
            <div className="space-y-3">
              <div
                className={`flex items-start gap-2 rounded-md border px-3 py-2 text-sm ${
                  aktuell.ok
                    ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200'
                    : 'border-amber-500/20 bg-amber-500/10 text-amber-800 dark:text-amber-200'
                }`}
              >
                {aktuell.ok
                  ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                  : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />}
                <span>
                  {aktuell.ok
                    ? 'Alle Listings sind geprüft und haben einen Buchpreisbindungspreis. Bereit zum Starten.'
                    : 'Es gibt Listings, die noch nicht startklar sind — siehe Liste unten.'}
                </span>
              </div>

              <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs sm:grid-cols-3">
                {Object.entries(aktuell.zahlen).map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-2">
                    <dt className="text-muted-foreground">{ZAHL_LABEL[k] ?? k}</dt>
                    <dd className="tabular-nums text-foreground">{v}</dd>
                  </div>
                ))}
              </dl>

              {aktuell.probleme.length > 0 && (
                <div className="space-y-1.5">
                  <p className="flex items-center gap-1.5 text-xs font-medium text-red-700 dark:text-red-300">
                    <XCircle className="h-3.5 w-3.5" aria-hidden />
                    Nicht startklar ({aktuell.probleme.length})
                  </p>
                  <ul className="space-y-1">
                    {aktuell.probleme.slice(0, 25).map((p, i) => (
                      <li key={`${p.mlid}-${i}`} className="text-xs text-muted-foreground">
                        <span className="text-foreground">MLID {p.mlid ?? '—'}</span>
                        {p.item_id ? ` · Artikel ${p.item_id}` : ''}
                        {p.titel ? ` · ${p.titel}` : ''}
                        {p.grund ? ` — ${p.grund}` : ''}
                      </li>
                    ))}
                  </ul>
                  {aktuell.probleme.length > 25 && (
                    <p className="text-xs text-muted-foreground">
                      … und {aktuell.probleme.length - 25} weitere.
                    </p>
                  )}
                </div>
              )}

              {aktuell.uebersprungen.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-amber-700 dark:text-amber-300">
                    Übersprungen ({aktuell.uebersprungen.length}) — fehlender Autor, Titel oder Preis
                  </p>
                  <ul className="space-y-1">
                    {aktuell.uebersprungen.slice(0, 25).map((p, i) => (
                      <li key={`${p.mlid}-${i}`} className="text-xs text-muted-foreground">
                        <span className="text-foreground">
                          {p.mlid ? `MLID ${p.mlid}` : `Artikel ${p.item_id ?? '—'}`}
                        </span>
                        {p.titel ? ` · ${p.titel}` : ''}
                        {p.grund ? ` — ${p.grund}` : ''}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </section>

        {/* --------------------------------------------------- Abhol-URLs */}
        <section className="space-y-3">
          <div>
            <h3 className="text-sm font-semibold text-foreground">
              Abhol-URLs für PlentyONE
            </h3>
            <p className="text-xs text-muted-foreground">
              Einmalig eintragen: Daten » Import » jeweilige Definition » Datenquelle
              „HTTPS / URL" und Zeitplan. <code className="rounded bg-muted px-1">DEIN_TOKEN</code>{' '}
              durch den Wert von <code className="rounded bg-muted px-1">PLENTYONE_EXPORT_TOKEN</code>{' '}
              aus den Vercel-Umgebungsvariablen ersetzen.
            </p>
          </div>

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
            Zwischen 03:00 und 04:00 liegt die Stapelverarbeitung: Vorlage „Bücher (1)" auf die
            neuen Listings anwenden. Das sind bis auf Weiteres die einzigen zwei Klicks im ganzen
            Zyklus — der Batch-Endpunkt dafür ist noch nicht bekannt.
          </p>
        </section>
      </CardContent>
    </Card>
  )
}
