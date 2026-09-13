'use client'

import { useCallback, useEffect, useState } from 'react'
import { Check, ChevronDown, Download, Loader2, Package, RefreshCw, Search, Undo2 } from 'lucide-react'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'

interface CoverZeile {
  isbn: string
  titel: string | null
  status: 'ok' | 'fehlt'
  grund: string | null
  paket: string | null
  paket_pfad: string | null
  run_id: string | null
  geladen_am: string
  plenty_hochgeladen_am: string | null
}

interface Paket {
  paket: string
  paket_pfad: string
  dateiname: string
  cover: number
  hochgeladen: number
  geladen_am: string
  url: string | null
}

interface Antwort {
  zeilen: CoverZeile[]
  gesamt: number
  seite: number
  seiten_groesse: number
  zaehler: { ok: number; fehlt: number; hochgeladen: number }
}

const datum = (iso: string) =>
  new Date(iso).toLocaleString('de-DE', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })

/**
 * Cover-Bestand: alle je geladenen Buchcover, unabhängig vom Lauf.
 * Künftige Läufe holen nur, was hier noch nicht mit "ok" steht.
 * Der Haken "in PlentyONE" wird je ZIP-Paket gesetzt — so wie man die
 * Pakete auch hochlädt.
 */
export function CoverBestand({ aktualisieren }: { aktualisieren?: number }) {
  const [daten, setDaten] = useState<Antwort | null>(null)
  const [laden, setLaden] = useState(true)
  const [fehler, setFehler] = useState<string | null>(null)
  const [suche, setSuche] = useState('')
  const [q, setQ] = useState('')
  const [nurOffen, setNurOffen] = useState(false)
  const [seite, setSeite] = useState(1)
  const [markiert, setMarkiert] = useState<string | null>(null)
  const [pakete, setPakete] = useState<Paket[] | null>(null)
  const [paketeOffen, setPaketeOffen] = useState(false)
  const [alleLaeuft, setAlleLaeuft] = useState<{ nr: number; von: number } | null>(null)

  const holen = useCallback(async () => {
    setLaden(true)
    setFehler(null)
    try {
      const sp = new URLSearchParams({ seite: String(seite) })
      if (q) sp.set('q', q)
      if (nurOffen) sp.set('nur_offen', '1')
      const res = await fetch(`/api/plentyone/cover?${sp}`)
      const j = await res.json()
      if (!res.ok) throw new Error(j.error ?? 'Bestand konnte nicht geladen werden')
      setDaten(j)
    } catch (e) {
      setFehler(e instanceof Error ? e.message : 'Bestand konnte nicht geladen werden')
    } finally {
      setLaden(false)
    }
  }, [q, nurOffen, seite])

  useEffect(() => { void holen() }, [holen, aktualisieren])

  const paketeHolen = useCallback(async (): Promise<Paket[]> => {
    const res = await fetch('/api/plentyone/cover/pakete')
    const j = await res.json()
    if (!res.ok) throw new Error(j.error ?? 'Pakete konnten nicht geladen werden')
    setPakete(j.pakete)
    return j.pakete
  }, [])

  useEffect(() => { paketeHolen().catch(() => setPakete([])) }, [paketeHolen, aktualisieren])

  // Ein Download über einen unsichtbaren Link — die signierte URL trägt
  // Content-Disposition, deshalb landet die Datei direkt im Download-Ordner.
  const dateiLaden = (url: string, name: string) => {
    const a = document.createElement('a')
    a.href = url
    a.download = name
    a.rel = 'noopener'
    document.body.appendChild(a)
    a.click()
    a.remove()
  }

  // Alle ZIP-Pakete nacheinander laden. Der Browser fragt beim ersten Mal,
  // ob mehrere Downloads erlaubt sind — danach läuft es durch.
  async function alleLaden() {
    setFehler(null)
    setAlleLaeuft({ nr: 0, von: 0 })
    try {
      const liste = (await paketeHolen()).filter((p) => p.url)
      if (!liste.length) throw new Error('Keine Pakete vorhanden.')
      for (let i = 0; i < liste.length; i++) {
        setAlleLaeuft({ nr: i + 1, von: liste.length })
        dateiLaden(liste[i].url!, liste[i].dateiname)
        await new Promise((r) => setTimeout(r, 900))
      }
    } catch (e) {
      setFehler(e instanceof Error ? e.message : 'Download fehlgeschlagen')
    } finally {
      setAlleLaeuft(null)
    }
  }

  // Ein ganzes Paket als hochgeladen markieren (oder den Haken zurücknehmen)
  async function paketMarkieren(paketPfad: string, hochgeladen: boolean) {
    setMarkiert(paketPfad)
    setFehler(null)
    try {
      const res = await fetch('/api/plentyone/cover', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paket_pfad: paketPfad, hochgeladen }),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error ?? 'Markieren fehlgeschlagen')
      await Promise.all([holen(), paketeHolen()])
    } catch (e) {
      setFehler(e instanceof Error ? e.message : 'Markieren fehlgeschlagen')
    } finally {
      setMarkiert(null)
    }
  }

  const z = daten?.zaehler ?? { ok: 0, fehlt: 0, hochgeladen: 0 }
  const seiten = daten ? Math.max(1, Math.ceil(daten.gesamt / daten.seiten_groesse)) : 1

  return (
    <div className="space-y-4">
      {/* Kopfzeile: Zähler + Suche */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <dl className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
          <div className="flex items-baseline gap-1.5">
            <dt className="text-muted-foreground">Cover vorhanden</dt>
            <dd className="font-medium tabular-nums text-foreground">{z.ok}</dd>
          </div>
          <div className="flex items-baseline gap-1.5">
            <dt className="text-muted-foreground">in PlentyONE</dt>
            <dd className="font-medium tabular-nums text-foreground">{z.hochgeladen}</dd>
          </div>
          <div className="flex items-baseline gap-1.5">
            <dt className="text-muted-foreground">noch offen</dt>
            <dd className="font-medium tabular-nums text-foreground">{z.ok - z.hochgeladen}</dd>
          </div>
          <div className="flex items-baseline gap-1.5">
            <dt className="text-muted-foreground">ohne Bild in der VLB</dt>
            <dd className="font-medium tabular-nums text-foreground">{z.fehlt}</dd>
          </div>
        </dl>
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(e) => { e.preventDefault(); setSeite(1); setQ(suche.trim()) }}
        >
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              value={suche}
              onChange={(e) => setSuche(e.target.value)}
              placeholder="ISBN oder Titel"
              aria-label="Im Cover-Bestand suchen"
              className="h-9 w-56 pl-8 text-foreground"
            />
          </div>
          <Button type="submit" size="sm" variant="secondary">Suchen</Button>
          <div className="flex items-center gap-2 pl-1">
            <Checkbox
              id="cover-nur-offen"
              checked={nurOffen}
              onCheckedChange={(v) => { setSeite(1); setNurOffen(v === true) }}
            />
            <Label htmlFor="cover-nur-offen" className="text-xs text-muted-foreground">nur offene</Label>
          </div>
          <Button type="button" size="sm" variant="ghost" onClick={() => void holen()} aria-label="Neu laden">
            <RefreshCw className={`h-3.5 w-3.5 ${laden ? 'animate-spin' : ''}`} aria-hidden />
          </Button>
        </form>
      </div>

      {/* Alle Cover herunterladen + Paketliste */}
      <Collapsible open={paketeOffen} onOpenChange={setPaketeOffen}>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            onClick={alleLaden}
            disabled={alleLaeuft !== null || !pakete?.length}
            className="gap-2"
          >
            {alleLaeuft
              ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              : <Download className="h-4 w-4" aria-hidden />}
            {alleLaeuft && alleLaeuft.von
              ? `Paket ${alleLaeuft.nr} von ${alleLaeuft.von} …`
              : `Alle Cover herunterladen${pakete?.length ? ` (${pakete.length} ZIP${pakete.length === 1 ? '' : 's'})` : ''}`}
          </Button>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground" disabled={!pakete?.length}>
              <Package className="h-3.5 w-3.5" aria-hidden />
              Pakete einzeln
              <ChevronDown className={`h-3.5 w-3.5 transition-transform ${paketeOffen ? 'rotate-180' : ''}`} aria-hidden />
            </Button>
          </CollapsibleTrigger>
          <span className="text-xs text-muted-foreground">
            Jedes ZIP enthält bis zu 50 Cover als <span className="font-mono">&lt;ISBN&gt;.jpg</span>. Der
            Browser fragt einmal, ob mehrere Downloads erlaubt sind.
          </span>
        </div>
        <CollapsibleContent>
          <ul className="mt-3 grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
            {pakete?.map((p) => (
              <li key={p.paket_pfad} className="flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs">
                <button
                  type="button"
                  className="inline-flex min-w-0 flex-1 items-center gap-1.5 text-left hover:underline disabled:opacity-50"
                  disabled={!p.url}
                  onClick={() => p.url && dateiLaden(p.url, p.dateiname)}
                  title={p.dateiname}
                >
                  <Download className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="truncate font-mono text-foreground">{p.dateiname}</span>
                </button>
                <span className="shrink-0 tabular-nums text-muted-foreground">{p.cover} Cover</span>
                {p.hochgeladen >= p.cover ? (
                  <span className="inline-flex shrink-0 items-center gap-1 text-emerald-700 dark:text-emerald-300" title="in PlentyONE hochgeladen">
                    <Check className="h-3 w-3" aria-hidden /> Plenty
                  </span>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 shrink-0 px-2 text-[11px]"
                    disabled={markiert !== null}
                    onClick={() => paketMarkieren(p.paket_pfad, true)}
                    title="Dieses Paket als in PlentyONE hochgeladen markieren"
                  >
                    hochgeladen
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </CollapsibleContent>
      </Collapsible>

      {fehler && <p className="text-sm text-red-600 dark:text-red-400">{fehler}</p>}

      {/* Tabelle */}
      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Titel</TableHead>
              <TableHead>Dateiname</TableHead>
              <TableHead>geladen am</TableHead>
              <TableHead>Paket</TableHead>
              <TableHead className="text-right">in PlentyONE</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {laden && !daten && (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                  <Loader2 className="mr-2 inline h-4 w-4 animate-spin" aria-hidden /> Bestand wird geladen…
                </TableCell>
              </TableRow>
            )}
            {daten && daten.zeilen.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                  {q || nurOffen
                    ? 'Nichts gefunden.'
                    : 'Noch keine Cover geladen — der erste Cover-Lauf füllt diese Tabelle.'}
                </TableCell>
              </TableRow>
            )}
            {daten?.zeilen.map((r) => (
              <TableRow key={r.isbn} className={r.status === 'fehlt' ? 'opacity-70' : undefined}>
                <TableCell className="max-w-[28rem]">
                  <span className="line-clamp-2 text-sm text-foreground">{r.titel ?? '—'}</span>
                </TableCell>
                <TableCell className="font-mono text-xs text-foreground">
                  {r.status === 'ok' ? (
                    <a
                      href={`/api/plentyone/cover/${r.isbn}/download`}
                      className="inline-flex items-center gap-1.5 hover:underline"
                      title="ZIP-Paket mit diesem Cover herunterladen"
                    >
                      <Download className="h-3 w-3 text-muted-foreground" aria-hidden />
                      {r.isbn}.jpg
                    </a>
                  ) : (
                    <span className="inline-flex items-center gap-2">
                      {r.isbn}
                      <Badge variant="outline" className="font-sans text-[10px]">
                        kein Bild{r.grund ? ` · ${r.grund}` : ''}
                      </Badge>
                    </span>
                  )}
                </TableCell>
                <TableCell className="whitespace-nowrap text-xs tabular-nums text-muted-foreground">
                  {datum(r.geladen_am)}
                </TableCell>
                <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                  {r.paket ?? '—'}
                </TableCell>
                <TableCell className="text-right">
                  {r.status !== 'ok' || !r.paket_pfad ? (
                    <span className="text-xs text-muted-foreground">—</span>
                  ) : r.plenty_hochgeladen_am ? (
                    <span className="inline-flex items-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-300">
                      <Check className="h-3.5 w-3.5" aria-hidden />
                      {datum(r.plenty_hochgeladen_am)}
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6"
                        disabled={markiert !== null}
                        onClick={() => paketMarkieren(r.paket_pfad!, false)}
                        title="Haken für das ganze Paket zurücknehmen"
                        aria-label="Haken für das ganze Paket zurücknehmen"
                      >
                        <Undo2 className="h-3 w-3" aria-hidden />
                      </Button>
                    </span>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 gap-1.5 text-xs"
                      disabled={markiert !== null}
                      onClick={() => paketMarkieren(r.paket_pfad!, true)}
                      title={`Alle Cover aus ${r.paket ?? 'diesem Paket'} als hochgeladen markieren`}
                    >
                      {markiert === r.paket_pfad
                        ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                        : <Check className="h-3 w-3" aria-hidden />}
                      Paket hochgeladen
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Seiten */}
      {daten && daten.gesamt > daten.seiten_groesse && (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {(daten.seite - 1) * daten.seiten_groesse + 1}–
            {Math.min(daten.seite * daten.seiten_groesse, daten.gesamt)} von {daten.gesamt}
          </span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={seite <= 1 || laden} onClick={() => setSeite((s) => s - 1)}>
              Zurück
            </Button>
            <Button size="sm" variant="outline" disabled={seite >= seiten || laden} onClick={() => setSeite((s) => s + 1)}>
              Weiter
            </Button>
          </div>
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        Der Haken gilt immer für ein ganzes ZIP-Paket — so, wie die Pakete auch in PlentyONE
        hochgeladen werden. Künftige Läufe laden nur Cover nach, die hier noch fehlen.
      </p>
    </div>
  )
}
