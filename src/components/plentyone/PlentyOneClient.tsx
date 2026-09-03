'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Upload, FileSpreadsheet, Images, CheckCircle2, XCircle, Loader2,
  AlertTriangle, Download, Link2,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { MappingTabelle } from './MappingTabelle'
import { HinweisListe, type Hinweis } from './HinweisListe'
import { EbayKette } from './EbayKette'
import { IMPORT_SCHRITTE } from '@/lib/plentyone-mapping'

type Strang = 'running' | 'success' | 'failed'

interface CoverPaket {
  name: string
  datei: string
  von: number
  bis: number
  gefunden: number
  fehlend: number
}

interface Run {
  id: string
  input_name: string
  zeilen_limit: number | null
  status: 'running' | 'success' | 'partial' | 'failed'
  csv_status: Strang
  csv_path: string | null
  eigenschaften_path: string | null
  csv_error: string | null
  cover_status: Strang
  cover_error: string | null
  cover_pakete: CoverPaket[]
  stats: Record<string, number>
  hinweise: Hinweis[]
  hinweise_gesamt: number
  created_at: string
  export_freigabe: boolean
  export_abrufe: number
  export_zuletzt: string | null
}

const datum = (iso: string) =>
  new Date(iso).toLocaleString('de-DE', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })

function StrangKarte({
  titel, untertitel, icon: Icon, status, fehler, children,
}: {
  titel: string
  untertitel: string
  icon: typeof FileSpreadsheet
  status: Strang
  fehler: string | null
  children?: React.ReactNode
}) {
  const rahmen =
    status === 'success' ? 'border-emerald-500/30 bg-emerald-500/5'
    : status === 'failed' ? 'border-red-500/30 bg-red-500/5'
    : 'border-sky-500/30 bg-sky-500/5'

  return (
    <Card className={rahmen}>
      <CardHeader className="gap-1 pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <Icon className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
            <div>
              <CardTitle className="text-base text-foreground">{titel}</CardTitle>
              <p className="mt-0.5 text-xs text-muted-foreground">{untertitel}</p>
            </div>
          </div>
          {status === 'running' && (
            <span className="flex items-center gap-1.5 text-xs text-sky-700 dark:text-sky-300">
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> läuft
            </span>
          )}
          {status === 'success' && (
            <span className="flex items-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-300">
              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> fertig
            </span>
          )}
          {status === 'failed' && (
            <span className="flex items-center gap-1.5 text-xs text-red-700 dark:text-red-300">
              <XCircle className="h-3.5 w-3.5" aria-hidden /> fehlgeschlagen
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3 pt-0">
        {fehler && (
          <p className="rounded-md border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs leading-relaxed text-red-800 dark:text-red-200">
            {fehler}
          </p>
        )}
        {children}
      </CardContent>
    </Card>
  )
}

export function PlentyOneClient() {
  const [runs, setRuns] = useState<Run[]>([])
  const [laden, setLaden] = useState(true)
  const [starten, setStarten] = useState(false)
  const [fehler, setFehler] = useState<string | null>(null)
  const [datei, setDatei] = useState<File | null>(null)
  const [limit, setLimit] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const aktuell = runs[0] ?? null
  const laeuft = aktuell?.status === 'running'

  const holen = useCallback(async () => {
    try {
      const res = await fetch('/api/plentyone/runs', { cache: 'no-store' })
      if (!res.ok) throw new Error((await res.json()).error ?? 'Laden fehlgeschlagen')
      const j = await res.json()
      setRuns(j.runs ?? [])
    } catch (e) {
      setFehler(e instanceof Error ? e.message : 'Laden fehlgeschlagen')
    } finally {
      setLaden(false)
    }
  }, [])

  useEffect(() => { void holen() }, [holen])

  // Solange ein Lauf offen ist, alle 5 Sekunden nachsehen
  useEffect(() => {
    if (!laeuft) return
    const t = setInterval(() => { void holen() }, 5000)
    return () => clearInterval(t)
  }, [laeuft, holen])

  async function start() {
    if (!datei) return
    setStarten(true)
    setFehler(null)
    try {
      const fd = new FormData()
      fd.append('file', datei)
      if (limit.trim()) fd.append('zeilen_limit', limit.trim())
      const res = await fetch('/api/plentyone/runs', { method: 'POST', body: fd })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error ?? 'Start fehlgeschlagen')
      setDatei(null)
      if (inputRef.current) inputRef.current.value = ''
      setLimit('')
      await holen()
    } catch (e) {
      setFehler(e instanceof Error ? e.message : 'Start fehlgeschlagen')
    } finally {
      setStarten(false)
    }
  }

  const dl = (id: string, was: string) =>
    `/api/plentyone/runs/${id}/download?datei=${encodeURIComponent(was)}`

  return (
    <div className="space-y-6">
      {/* ---------------------------------------------------------- Schritt 1 */}
      <Card>
        <CardHeader className="gap-1">
          <CardTitle className="text-foreground">1 · Amazon-Export hochladen</CardTitle>
          <p className="text-sm text-muted-foreground">
            Seller Central » Lagerbestandsberichte » <strong className="text-foreground">Bericht zu
            allen Angeboten</strong> herunterladen und hier unverändert hochladen. Die Datei ist
            Tab-getrennt und endet auf <code className="rounded bg-muted px-1">.txt</code>.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-[1fr_auto_auto] sm:items-end">
            <div className="space-y-1.5">
              <Label htmlFor="amazon-datei" className="text-xs text-muted-foreground">Datei</Label>
              <Input
                id="amazon-datei"
                ref={inputRef}
                type="file"
                accept=".txt,.csv,.tsv,text/plain,text/csv"
                disabled={starten || laeuft}
                onChange={(e) => setDatei(e.target.files?.[0] ?? null)}
                className="text-foreground file:text-foreground"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="limit" className="text-xs text-muted-foreground">
                Testlauf (optional)
              </Label>
              <Input
                id="limit"
                type="number"
                min={1}
                placeholder="alle"
                value={limit}
                disabled={starten || laeuft}
                onChange={(e) => setLimit(e.target.value)}
                className="w-32 text-foreground placeholder:text-muted-foreground"
              />
            </div>
            <Button onClick={start} disabled={!datei || starten || laeuft} className="gap-2">
              {starten ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                       : <Upload className="h-4 w-4" aria-hidden />}
              Migration starten
            </Button>
          </div>

          <p className="text-xs text-muted-foreground">
            Der Testlauf begrenzt den Durchlauf auf die ersten N Titel — praktisch, um in einer
            halben Minute zu prüfen, ob alles sitzt, bevor der Vollauf startet.
          </p>

          {laeuft && (
            <p className="flex items-start gap-2 rounded-md border border-sky-500/20 bg-sky-500/10 px-3 py-2 text-xs leading-relaxed text-sky-800 dark:text-sky-200">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              Es läuft gerade eine Migration. Die VLB erlaubt nur zwei gleichzeitige Sitzungen —
              ein Lauf belegt beide. Der nächste Start ist möglich, sobald beide Stränge fertig sind.
            </p>
          )}

          {fehler && (
            <p className="rounded-md border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-800 dark:text-red-200">
              {fehler}
            </p>
          )}
        </CardContent>
      </Card>

      {/* ---------------------------------------------------------- Schritt 2 */}
      {laden ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Lade…</p>
      ) : !aktuell ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            Noch kein Lauf vorhanden. Lade oben den Amazon-Export hoch.
          </CardContent>
        </Card>
      ) : (
        <>
          <section className="space-y-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-lg font-semibold text-foreground">2 · Verarbeitung</h2>
              <p className="text-xs text-muted-foreground">
                {aktuell.input_name} · {datum(aktuell.created_at)}
                {aktuell.zeilen_limit ? ` · Testlauf mit ${aktuell.zeilen_limit} Zeilen` : ''}
              </p>
            </div>
            <p className="text-sm text-muted-foreground">
              Beide Stränge laufen parallel gegen die VLB. Der CSV-Strang braucht etwa zwei Minuten,
              der Cover-Strang bei allen Titeln rund zwanzig — er lädt jedes Bild einzeln.
            </p>

            <div className="grid gap-4 md:grid-cols-2">
              <StrangKarte
                titel="Metadaten-CSV"
                untertitel="Aufbereitung, VLB-Abgleich, Import-CSV"
                icon={FileSpreadsheet}
                status={aktuell.csv_status}
                fehler={aktuell.csv_error}
              >
                {aktuell.csv_status === 'success' && (
                  <>
                    <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                      {([
                        ['Zeilen', aktuell.stats.zeilen],
                        ['Artikel', aktuell.stats.artikel],
                        ['VLB-Treffer', aktuell.stats.vlb_treffer],
                        ['ohne Treffer', aktuell.stats.kein_treffer],
                        ['mit BPB-Preis', aktuell.stats.mit_bpb_preis],
                        ['mit GPSR', aktuell.stats.mit_gpsr],
                        ['Verlage', aktuell.stats.verlage],
                        ['Gewicht geschätzt', aktuell.stats.gewicht_pauschal],
                      ] as const).map(([k, v]) =>
                        v === undefined ? null : (
                          <div key={k} className="flex justify-between gap-2">
                            <dt className="text-muted-foreground">{k}</dt>
                            <dd className="tabular-nums text-foreground">{v}</dd>
                          </div>
                        )
                      )}
                    </dl>
                    {Number(aktuell.stats.ust_19) > 0 && (
                      <p className="rounded-md border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
                        {aktuell.stats.ust_19} Titel haben laut VLB 19 % Umsatzsteuer. Die CSV setzt
                        pauschal 7 % — vor dem Import prüfen.
                      </p>
                    )}
                    <div className="space-y-1.5">
                      <Button asChild size="sm" variant="secondary" className="w-full gap-2">
                        <a href={dl(aktuell.id, 'csv')}>
                          <Download className="h-4 w-4" aria-hidden />
                          plentyONE_Import_final.csv
                        </a>
                      </Button>
                      {aktuell.eigenschaften_path && (
                        <Button asChild size="sm" variant="secondary" className="w-full justify-between gap-2">
                          <a href={dl(aktuell.id, 'eigenschaften')}>
                            <span className="flex items-center gap-2">
                              <Download className="h-4 w-4" aria-hidden />
                              plentyONE_Eigenschaften.csv
                            </span>
                            {aktuell.stats.eigenschaften_zeilen && (
                              <span className="text-xs text-muted-foreground">
                                {aktuell.stats.eigenschaften_zeilen} Zeilen
                              </span>
                            )}
                          </a>
                        </Button>
                      )}
                      <p className="text-xs leading-relaxed text-muted-foreground">
                        Zwei Dateien, zwei Importe: Artikel zuerst, danach die Eigenschaften.
                      </p>
                    </div>
                  </>
                )}
                {aktuell.csv_status === 'running' && (
                  <p className="text-xs text-muted-foreground">
                    Datei wird aufbereitet und gegen die VLB abgeglichen…
                  </p>
                )}
              </StrangKarte>

              <StrangKarte
                titel="Buchcover"
                untertitel="Originalgröße, ZIP-Pakete à 250"
                icon={Images}
                status={aktuell.cover_status}
                fehler={aktuell.cover_error}
              >
                {aktuell.cover_status === 'success' && (
                  <>
                    <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                      <div className="flex justify-between gap-2">
                        <dt className="text-muted-foreground">gefunden</dt>
                        <dd className="tabular-nums text-foreground">{aktuell.stats.cover_gefunden ?? 0}</dd>
                      </div>
                      <div className="flex justify-between gap-2">
                        <dt className="text-muted-foreground">ohne Bild</dt>
                        <dd className="tabular-nums text-foreground">{aktuell.stats.cover_fehlend ?? 0}</dd>
                      </div>
                    </dl>
                    <ul className="space-y-1.5">
                      {aktuell.cover_pakete.map((p) => (
                        <li key={p.name}>
                          <Button asChild size="sm" variant="secondary" className="w-full justify-between gap-2">
                            <a href={dl(aktuell.id, p.name)}>
                              <span className="flex items-center gap-2">
                                <Download className="h-3.5 w-3.5" aria-hidden />
                                {p.name}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                {p.gefunden} Bilder{p.fehlend ? ` · ${p.fehlend} fehlen` : ''}
                              </span>
                            </a>
                          </Button>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
                {aktuell.cover_status === 'running' && (
                  <p className="text-xs text-muted-foreground">
                    Cover werden einzeln geladen und zu ZIP-Paketen gebündelt…
                  </p>
                )}
              </StrangKarte>
            </div>
          </section>

          {/* ------------------------------------------------------- Schritt 3 */}
          {aktuell.csv_status === 'success' && (
            <section className="space-y-3">
              <h2 className="text-lg font-semibold text-foreground">3 · Unvollständige Titel</h2>
              <HinweisListe hinweise={aktuell.hinweise ?? []} gesamt={aktuell.hinweise_gesamt} />
            </section>
          )}

          {/* ------------------------------------------------------- Schritt 4 */}
          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-foreground">
              4 · Einmalige Einrichtung in PlentyONE
            </h2>
            <Card>
              <CardContent className="py-5">
                <ol className="space-y-4">
                  {IMPORT_SCHRITTE.map((s, i) => (
                    <li key={s.titel} className="flex gap-3">
                      <span
                        className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-foreground"
                        aria-hidden
                      >
                        {i + 1}
                      </span>
                      <div>
                        <p className="text-sm font-medium text-foreground">{s.titel}</p>
                        <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">{s.text}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              </CardContent>
            </Card>
          </section>
        </>
      )}

      {/* ------------------------------------------------------------ Schritt 5 */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-foreground">5 · Weiter zu eBay</h2>
        <EbayKette
          runId={aktuell?.id ?? null}
          freigabe={aktuell?.export_freigabe ?? true}
          abrufe={aktuell?.export_abrufe ?? 0}
          zuletzt={aktuell?.export_zuletzt ?? null}
          onFreigabe={() => { void holen() }}
        />
      </section>

      {/* ------------------------------------------------------------ Historie */}
      {runs.length > 0 && (
        <section className="space-y-3">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Letzte Läufe</h2>
            <p className="text-sm text-muted-foreground">
              Es werden drei Läufe aufbewahrt. Beim Start eines neuen wird der älteste samt Dateien
              gelöscht. Jede Zeile ist ein Lauf — CSV und Cover darin gehören zusammen.
            </p>
          </div>
          <Card>
            <CardContent className="overflow-x-auto py-4">
              <table className="w-full min-w-[720px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
                    <th scope="col" className="py-2 pr-3 font-medium">Datum</th>
                    <th scope="col" className="py-2 pr-3 font-medium">Quelldatei</th>
                    <th scope="col" className="py-2 pr-3 font-medium">Status</th>
                    <th scope="col" className="py-2 pr-3 font-medium">CSV</th>
                    <th scope="col" className="py-2 font-medium">Cover</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map((r) => (
                    <tr key={r.id} className="border-b border-border align-top">
                      <td className="py-3 pr-3 whitespace-nowrap text-foreground">
                        {datum(r.created_at)}
                        {r.zeilen_limit && (
                          <span className="mt-0.5 block text-xs text-muted-foreground">
                            Testlauf · {r.zeilen_limit} Zeilen
                          </span>
                        )}
                      </td>
                      <td className="py-3 pr-3 text-muted-foreground">{r.input_name}</td>
                      <td className="py-3 pr-3">
                        <Badge
                          variant="outline"
                          className={
                            r.status === 'success' ? 'border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                            : r.status === 'running' ? 'border-sky-500/30 bg-sky-500/15 text-sky-700 dark:text-sky-300'
                            : r.status === 'partial' ? 'border-amber-500/30 bg-amber-500/15 text-amber-700 dark:text-amber-300'
                            : 'border-red-500/30 bg-red-500/15 text-red-700 dark:text-red-300'
                          }
                        >
                          {r.status === 'success' ? 'vollständig'
                            : r.status === 'running' ? 'läuft'
                            : r.status === 'partial' ? 'teilweise'
                            : 'fehlgeschlagen'}
                        </Badge>
                      </td>
                      <td className="py-3 pr-3">
                        {r.csv_status === 'success' ? (
                          <span className="flex flex-col gap-0.5">
                            <a
                              href={dl(r.id, 'csv')}
                              className="inline-flex items-center gap-1.5 text-sky-700 dark:text-sky-300 underline-offset-2 hover:underline"
                            >
                              <Download className="h-3.5 w-3.5" aria-hidden />
                              Artikel
                            </a>
                            {r.eigenschaften_path && (
                              <a
                                href={dl(r.id, 'eigenschaften')}
                                className="inline-flex items-center gap-1.5 text-xs text-sky-700 dark:text-sky-300 underline-offset-2 hover:underline"
                              >
                                <Download className="h-3 w-3" aria-hidden />
                                Eigenschaften
                              </a>
                            )}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="py-3">
                        {r.cover_pakete?.length ? (
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                            <Link2 className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                            {r.cover_pakete.map((p) => (
                              <a
                                key={p.name}
                                href={dl(r.id, p.name)}
                                className="text-xs text-sky-700 dark:text-sky-300 underline-offset-2 hover:underline"
                              >
                                {p.von}–{p.bis}
                              </a>
                            ))}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </section>
      )}

      {/* -------------------------------------------------------------- Mapping */}
      <MappingTabelle />
    </div>
  )
}
