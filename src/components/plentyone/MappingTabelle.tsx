'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  MAPPING_SPALTEN, HERKUNFT_LABEL, BLOCK_LABEL, EIGENSCHAFTEN_IMPORT,
  type Herkunft, type Block,
} from '@/lib/plentyone-mapping'

const HERKUNFT_STIL: Record<Herkunft, string> = {
  amazon: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30',
  vlb: 'bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30',
  berechnet: 'bg-violet-500/15 text-violet-700 dark:text-violet-300 border-violet-500/30',
  fest: 'bg-muted text-muted-foreground border-border',
}

const BLOCK_STIL: Record<Block, string> = {
  A: 'text-amber-700 dark:text-amber-300',
  B: 'text-emerald-700 dark:text-emerald-300',
  C: 'text-sky-700 dark:text-sky-300',
  D: 'text-muted-foreground',
}

export function MappingTabelle() {
  const [suche, setSuche] = useState('')
  const [nurGemappt, setNurGemappt] = useState(false)

  const q = suche.trim().toLowerCase()
  const zeilen = MAPPING_SPALTEN
    .map((z, i) => ({ ...z, csvSpalte: i + 1 }))
    .filter((z) => !nurGemappt || z.zielfeld)
    .filter(
      (z) =>
        !q ||
        z.spalte.toLowerCase().includes(q) ||
        z.beschreibung.toLowerCase().includes(q) ||
        (z.zielfeld ?? '').toLowerCase().includes(q)
    )

  const gemappt = MAPPING_SPALTEN.filter((z) => z.zielfeld).length

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="gap-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="text-foreground">Mapping-Tabelle — Artikelimport</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                In der <strong className="text-foreground">Reihenfolge der CSV-Spalten</strong> —
                so wie sie im Import untereinander stehen. {MAPPING_SPALTEN.length} Spalten,
                davon {gemappt} gemappt.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setNurGemappt((v) => !v)}
                className={`h-9 rounded-md border px-3 text-sm transition-colors ${
                  nurGemappt
                    ? 'border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300'
                    : 'border-border text-muted-foreground hover:text-foreground'
                }`}
              >
                {nurGemappt ? 'Alle Spalten' : 'Nur gemappte'}
              </button>
              <Input
                value={suche}
                onChange={(e) => setSuche(e.target.value)}
                placeholder="Spalte oder Inhalt suchen…"
                className="h-9 w-full max-w-xs"
                aria-label="Mapping-Tabelle durchsuchen"
              />
            </div>
          </div>
        </CardHeader>

        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[920px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
                <th scope="col" className="w-14 py-2 pr-2 font-medium">CSV</th>
                <th scope="col" className="w-52 py-2 pr-3 font-medium">Spalte</th>
                <th scope="col" className="w-64 py-2 pr-3 font-medium">Zielfeld in PlentyONE</th>
                <th scope="col" className="w-24 py-2 pr-3 font-medium">Herkunft</th>
                <th scope="col" className="py-2 font-medium">Was drinsteht</th>
              </tr>
            </thead>
            <tbody>
              {zeilen.map((z) => (
                <tr
                  key={z.spalte}
                  className={`border-b border-border align-top ${z.zielfeld ? '' : 'opacity-70'}`}
                >
                  <td className="py-2.5 pr-2 tabular-nums">
                    <span className="text-foreground">{z.csvSpalte}</span>
                    <span className={`mt-0.5 block text-[10px] uppercase ${BLOCK_STIL[z.block]}`}>
                      {BLOCK_LABEL[z.block]}
                    </span>
                  </td>
                  <td className="py-2.5 pr-3">
                    <code className="rounded bg-muted px-1.5 py-0.5 text-[13px] text-foreground">
                      {z.spalte}
                    </code>
                  </td>
                  <td className="py-2.5 pr-3">
                    {z.zielfeld ? (
                      <span className="text-foreground">{z.zielfeld}</span>
                    ) : (
                      <span className="text-muted-foreground">Import aus</span>
                    )}
                    {z.zusatz && (
                      <span className="mt-0.5 block text-xs text-muted-foreground">{z.zusatz}</span>
                    )}
                  </td>
                  <td className="py-2.5 pr-3">
                    <Badge variant="outline" className={`text-[11px] ${HERKUNFT_STIL[z.herkunft]}`}>
                      {HERKUNFT_LABEL[z.herkunft]}
                    </Badge>
                  </td>
                  <td className="py-2.5 leading-relaxed text-muted-foreground">{z.beschreibung}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {zeilen.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Keine Spalte gefunden für „{suche}".
            </p>
          )}
        </CardContent>
      </Card>

      {/* ------------------------------------------------ zweiter Import */}
      <Card>
        <CardHeader className="gap-2">
          <CardTitle className="text-foreground">
            Mapping-Tabelle — Eigenschaften-Import
          </CardTitle>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {EIGENSCHAFTEN_IMPORT.hinweis}
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
                  <th scope="col" className="w-14 py-2 pr-2 font-medium">CSV</th>
                  <th scope="col" className="w-44 py-2 pr-3 font-medium">Spalte</th>
                  <th scope="col" className="w-72 py-2 pr-3 font-medium">Zielfeld</th>
                  <th scope="col" className="py-2 font-medium">Bedeutung</th>
                </tr>
              </thead>
              <tbody>
                {EIGENSCHAFTEN_IMPORT.mapping.map((m, i) => (
                  <tr key={m.spalte} className="border-b border-border align-top">
                    <td className="py-2.5 pr-2 tabular-nums text-foreground">{i + 1}</td>
                    <td className="py-2.5 pr-3">
                      <code className="rounded bg-muted px-1.5 py-0.5 text-[13px] text-foreground">
                        {m.spalte}
                      </code>
                    </td>
                    <td className="py-2.5 pr-3 text-foreground">{m.zielfeld}</td>
                    <td className="py-2.5 leading-relaxed text-muted-foreground">{m.beschreibung}</td>
                  </tr>
                ))}
                <tr className="border-b border-border align-top opacity-70">
                  <td className="py-2.5 pr-2 tabular-nums text-foreground">7</td>
                  <td className="py-2.5 pr-3">
                    <code className="rounded bg-muted px-1.5 py-0.5 text-[13px] text-foreground">
                      {EIGENSCHAFTEN_IMPORT.nichtGemappt}
                    </code>
                  </td>
                  <td className="py-2.5 pr-3 text-muted-foreground">Import aus</td>
                  <td className="py-2.5 leading-relaxed text-muted-foreground">
                    Klartextname der Eigenschaft — nur damit die Datei lesbar bleibt.
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-foreground">
              Welche Eigenschaft aus welcher Spalte kommt
            </h3>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[640px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
                    <th scope="col" className="w-16 py-2 pr-3 font-medium">ID</th>
                    <th scope="col" className="w-44 py-2 pr-3 font-medium">Eigenschaft</th>
                    <th scope="col" className="w-28 py-2 pr-3 font-medium">Typ</th>
                    <th scope="col" className="w-52 py-2 pr-3 font-medium">Quelle in der Artikel-CSV</th>
                    <th scope="col" className="py-2 font-medium">landet in</th>
                  </tr>
                </thead>
                <tbody>
                  {EIGENSCHAFTEN_IMPORT.eigenschaften.map((e) => (
                    <tr key={e.id} className="border-b border-border">
                      <td className="py-2.5 pr-3 tabular-nums text-foreground">{e.id}</td>
                      <td className="py-2.5 pr-3 text-foreground">{e.name}</td>
                      <td className="py-2.5 pr-3 text-muted-foreground">{e.typ}</td>
                      <td className="py-2.5 pr-3">
                        <code className="rounded bg-muted px-1.5 py-0.5 text-[12px] text-foreground">
                          {e.quelle}
                        </code>
                      </td>
                      <td className="py-2.5">
                        <code className="rounded bg-muted px-1.5 py-0.5 text-[12px] text-foreground">
                          {e.ziel}
                        </code>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
              Sprache und Bindung sind Auswahl-Eigenschaften — sie gehen über die
              Auswahlwert-ID, nicht über den Text. Alle übrigen über den Wert.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
