'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { MAPPING_BLOECKE, HERKUNFT_LABEL, type Herkunft } from '@/lib/plentyone-mapping'

const HERKUNFT_STIL: Record<Herkunft, string> = {
  amazon: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30',
  vlb: 'bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30',
  berechnet: 'bg-violet-500/15 text-violet-700 dark:text-violet-300 border-violet-500/30',
  fest: 'bg-muted text-muted-foreground border-border',
}

export function MappingTabelle() {
  const [suche, setSuche] = useState('')

  const filter = suche.trim().toLowerCase()
  const bloecke = MAPPING_BLOECKE.map((b) => ({
    ...b,
    zeilen: filter
      ? b.zeilen.filter(
          (z) =>
            z.spalte.toLowerCase().includes(filter) ||
            z.beschreibung.toLowerCase().includes(filter) ||
            (z.zielfeld ?? '').toLowerCase().includes(filter)
        )
      : b.zeilen,
  })).filter((b) => b.zeilen.length > 0)

  const gesamt = MAPPING_BLOECKE.reduce((s, b) => s + b.zeilen.length, 0)

  return (
    <Card>
      <CardHeader className="gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="text-foreground">Mapping-Tabelle</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Welche Spalte der CSV auf welches PlentyONE-Feld gehört — und was drinsteht.
              {' '}{gesamt} Spalten.
            </p>
          </div>
          <Input
            value={suche}
            onChange={(e) => setSuche(e.target.value)}
            placeholder="Spalte oder Inhalt suchen…"
            className="h-9 w-full max-w-xs text-foreground placeholder:text-muted-foreground"
            aria-label="Mapping-Tabelle durchsuchen"
          />
        </div>
      </CardHeader>
      <CardContent className="space-y-8">
        {bloecke.map((block) => (
          <section key={block.key} aria-labelledby={`map-${block.key}`}>
            <h3 id={`map-${block.key}`} className="text-sm font-semibold text-foreground">
              {block.titel}
            </h3>
            {block.hinweis && (
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{block.hinweis}</p>
            )}

            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[880px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
                    <th scope="col" className="w-10 py-2 pr-2 font-medium">#</th>
                    <th scope="col" className="w-52 py-2 pr-3 font-medium">Spalte</th>
                    <th scope="col" className="w-60 py-2 pr-3 font-medium">Zielfeld in PlentyONE</th>
                    <th scope="col" className="w-24 py-2 pr-3 font-medium">Herkunft</th>
                    <th scope="col" className="py-2 font-medium">Was drinsteht</th>
                  </tr>
                </thead>
                <tbody>
                  {block.zeilen.map((z) => (
                    <tr key={z.spalte} className="border-b border-border align-top">
                      <td className="py-2.5 pr-2 text-muted-foreground tabular-nums">{z.nr ?? '—'}</td>
                      <td className="py-2.5 pr-3">
                        <code className="rounded bg-muted px-1.5 py-0.5 text-[13px] text-foreground">
                          {z.spalte}
                        </code>
                      </td>
                      <td className="py-2.5 pr-3 text-foreground">
                        {z.zielfeld ?? <span className="text-muted-foreground">Import aus</span>}
                        {z.zusatz && (
                          <span className="mt-0.5 block text-xs text-muted-foreground">{z.zusatz}</span>
                        )}
                      </td>
                      <td className="py-2.5 pr-3">
                        <Badge variant="outline" className={`text-[11px] ${HERKUNFT_STIL[z.herkunft]}`}>
                          {HERKUNFT_LABEL[z.herkunft]}
                        </Badge>
                      </td>
                      <td className="py-2.5 text-muted-foreground leading-relaxed">{z.beschreibung}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))}

        {bloecke.length === 0 && (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Keine Spalte gefunden für „{suche}".
          </p>
        )}
      </CardContent>
    </Card>
  )
}
