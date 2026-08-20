'use client'

import { useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export interface Hinweis {
  isbn: string
  variantennummer: string
  titel: string
  fehlt: string[]
}

/** Klartext + Einordnung je Hinweisart. */
const ART: Record<string, { label: string; erklaerung: string; schwere: 'hoch' | 'mittel' | 'gering' }> = {
  kein_vlb_treffer: {
    label: 'Kein VLB-Datensatz',
    erklaerung: 'Zu dieser ISBN kennt die VLB keinen Titel. Alle VLB-Spalten bleiben leer, es greifen nur die Amazon-Rückfallwerte.',
    schwere: 'hoch',
  },
  kein_gpsr_kontakt: {
    label: 'Kein GPSR-Kontakt',
    erklaerung: 'Ohne Hersteller-Anschrift lehnen Kaufland und eBay den Artikel ab (EU-Produktsicherheitsverordnung).',
    schwere: 'hoch',
  },
  kein_cover: {
    label: 'Kein Cover',
    erklaerung: 'Die VLB hat kein Bild zu dieser ISBN. Die Bild-URL in der CSV läuft ins Leere.',
    schwere: 'hoch',
  },
  kein_bpb_preis: {
    label: 'Kein gebundener Ladenpreis',
    erklaerung: 'Kein fester Buchpreis hinterlegt — der Verkaufspreis „Buchpreisbindung" bleibt leer.',
    schwere: 'mittel',
  },
  keine_beschreibung: {
    label: 'Keine Beschreibung',
    erklaerung: 'Der Verlag hat keinen Beschreibungstext gepflegt.',
    schwere: 'mittel',
  },
  keine_seitenzahl: {
    label: 'Keine Seitenzahl',
    erklaerung: 'Seitenzahl fehlt in der VLB. Bei eBay ein optionales Item Specific.',
    schwere: 'gering',
  },
  gewicht_pauschal: {
    label: 'Gewicht geschätzt',
    erklaerung: 'Die VLB liefert kein Gewicht — es wurden pauschal 1.000 g gesetzt. Beeinflusst die Versandkalkulation.',
    schwere: 'gering',
  },
}

const SCHWERE_STIL = {
  hoch: 'bg-red-500/15 text-red-300 border-red-500/30',
  mittel: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  gering: 'bg-white/10 text-white/60 border-white/20',
} as const

export function HinweisListe({
  hinweise,
  gesamt,
}: {
  hinweise: Hinweis[]
  gesamt: number
}) {
  const [aktiv, setAktiv] = useState<string | null>(null)
  const [suche, setSuche] = useState('')
  const [alleZeigen, setAlleZeigen] = useState(false)

  const zaehler = useMemo(() => {
    const m = new Map<string, number>()
    for (const h of hinweise) for (const f of h.fehlt) m.set(f, (m.get(f) ?? 0) + 1)
    return [...m.entries()].sort((a, b) => b[1] - a[1])
  }, [hinweise])

  const gefiltert = useMemo(() => {
    const q = suche.trim().toLowerCase()
    return hinweise.filter(
      (h) =>
        (!aktiv || h.fehlt.includes(aktiv)) &&
        (!q ||
          h.isbn.includes(q) ||
          h.titel.toLowerCase().includes(q) ||
          h.variantennummer.toLowerCase().includes(q))
    )
  }, [hinweise, aktiv, suche])

  const sichtbar = alleZeigen ? gefiltert : gefiltert.slice(0, 25)

  if (!hinweise.length) {
    return (
      <Card className="border-emerald-500/20 bg-emerald-500/5">
        <CardContent className="py-5 text-sm text-emerald-200">
          Keine Auffälligkeiten — zu allen Titeln sind die Daten vollständig.
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="border-white/10 bg-white/5">
      <CardHeader className="gap-2">
        <CardTitle className="text-white">Unvollständige Titel</CardTitle>
        <p className="text-sm text-white/50">
          {gesamt} von den verarbeiteten Titeln fehlt mindestens eine Angabe. Nach Art filtern
          oder nach ISBN suchen.
          {gesamt > hinweise.length && (
            <> Angezeigt werden die ersten {hinweise.length}.</>
          )}
        </p>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant={aktiv === null ? 'secondary' : 'ghost'}
            onClick={() => setAktiv(null)}
            className="h-8"
          >
            Alle ({hinweise.length})
          </Button>
          {zaehler.map(([art, n]) => (
            <Button
              key={art}
              size="sm"
              variant={aktiv === art ? 'secondary' : 'ghost'}
              onClick={() => setAktiv(aktiv === art ? null : art)}
              className="h-8"
            >
              {ART[art]?.label ?? art} ({n})
            </Button>
          ))}
        </div>

        {aktiv && ART[aktiv] && (
          <p className="rounded-md border border-white/10 bg-white/5 px-3 py-2 text-xs leading-relaxed text-white/60">
            {ART[aktiv].erklaerung}
          </p>
        )}

        <Input
          value={suche}
          onChange={(e) => setSuche(e.target.value)}
          placeholder="ISBN, Titel oder Variantennr. suchen…"
          className="h-9 max-w-sm border-white/10 bg-white/5 text-white placeholder:text-white/30"
          aria-label="Hinweise durchsuchen"
        />

        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-white/10 text-xs uppercase tracking-wide text-white/40">
                <th scope="col" className="w-36 py-2 pr-3 font-medium">ISBN</th>
                <th scope="col" className="w-48 py-2 pr-3 font-medium">Variantennr.</th>
                <th scope="col" className="py-2 pr-3 font-medium">Titel</th>
                <th scope="col" className="w-72 py-2 font-medium">Was fehlt</th>
              </tr>
            </thead>
            <tbody>
              {sichtbar.map((h) => (
                <tr key={h.variantennummer} className="border-b border-white/5 align-top">
                  <td className="py-2.5 pr-3 font-mono text-[13px] text-white/80">{h.isbn}</td>
                  <td className="py-2.5 pr-3 font-mono text-[12px] text-white/45">
                    {h.variantennummer}
                  </td>
                  <td className="py-2.5 pr-3 text-white/70">{h.titel}</td>
                  <td className="py-2.5">
                    <div className="flex flex-wrap gap-1">
                      {h.fehlt.map((f) => (
                        <Badge
                          key={f}
                          variant="outline"
                          className={`text-[11px] ${SCHWERE_STIL[ART[f]?.schwere ?? 'gering']}`}
                          title={ART[f]?.erklaerung}
                        >
                          {ART[f]?.label ?? f}
                        </Badge>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {gefiltert.length > sichtbar.length && (
          <Button variant="ghost" size="sm" onClick={() => setAlleZeigen(true)}>
            Alle {gefiltert.length} anzeigen
          </Button>
        )}
        {gefiltert.length === 0 && (
          <p className="py-4 text-center text-sm text-white/40">Keine Treffer.</p>
        )}
      </CardContent>
    </Card>
  )
}
