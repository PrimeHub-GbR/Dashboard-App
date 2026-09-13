import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createSupabaseServiceClient } from '@/lib/supabase-server'

export const runtime = 'nodejs'

/**
 * Rückmeldung aus N8N. Jeder der beiden Stränge meldet sich eigenständig —
 * der Gesamtstatus des Laufs wird per DB-Trigger daraus abgeleitet.
 *
 * Der Cover-Strang meldet seit 13.09.2026 zusätzlich jedes fertige Paket
 * einzeln (status 'paket'): die Cover landen im Bestand `plentyone_cover`,
 * das Paket in `cover_pakete`, der Strang bleibt `running`. So geht bei
 * einem Abbruch nichts verloren und das Dashboard zeigt den Fortschritt.
 */
const paketSchema = z.object({
  name: z.string().max(200),
  datei: z.string().max(500),
  von: z.number().int().nonnegative(),
  bis: z.number().int().nonnegative(),
  gefunden: z.number().int().nonnegative(),
  fehlend: z.number().int().nonnegative(),
})

const coverSchema = z.object({
  isbn: z.string().regex(/^[0-9]{13}$/),
  titel: z.string().max(500).optional(),
  ok: z.boolean(),
  grund: z.string().max(300).optional(),
})

const callbackSchema = z.object({
  strang: z.enum(['csv', 'cover']),
  status: z.enum(['success', 'failed', 'paket']),
  fehler: z.string().max(2000).optional(),
  // Strang csv
  datei: z.string().max(500).optional(),
  eigenschaften_datei: z.string().max(500).optional(),
  // Der Knoten laedt die Hersteller-Datei selbst hoch und meldet null,
  // wenn das misslang oder es keinen einzigen Verlag mit Anschrift gab.
  hersteller_datei: z.string().max(500).nullable().optional(),
  stats: z.record(z.string(), z.unknown()).optional(),
  hinweise: z.array(z.record(z.string(), z.unknown())).optional(),
  hinweise_gesamt: z.number().int().nonnegative().optional(),
  // Strang cover
  pakete: z.array(paketSchema).optional(),
  // status 'paket': ein einzelnes fertiges Paket samt seiner Cover
  paket: paketSchema.optional(),
  cover: z.array(coverSchema).max(500).optional(),
})

type Paket = z.infer<typeof paketSchema>

/** Pakete nach Name zusammenführen — n8n wiederholt Callbacks bis zu dreimal. */
function paketeVereinen(alt: Paket[], neu: Paket[]): Paket[] {
  const nachName = new Map(alt.map((p) => [p.name, p]))
  for (const p of neu) nachName.set(p.name, p)
  return [...nachName.values()].sort((a, b) => a.von - b.von)
}

function coverStats(pakete: Paket[]) {
  return {
    cover_gefunden: pakete.reduce((s, p) => s + p.gefunden, 0),
    cover_fehlend: pakete.reduce((s, p) => s + p.fehlend, 0),
    pakete: pakete.length,
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    if (!UUID.test(id)) {
      return NextResponse.json({ error: 'Ungültige Lauf-ID' }, { status: 400 })
    }

    const body = await request.json().catch(() => null)
    const parsed = callbackSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Ungültige Callback-Daten', details: parsed.error.flatten() },
        { status: 400 }
      )
    }
    const d = parsed.data
    if (d.status === 'paket' && (d.strang !== 'cover' || !d.paket)) {
      return NextResponse.json({ error: 'Paketmeldung braucht strang=cover und paket' }, { status: 400 })
    }

    const svc = createSupabaseServiceClient()
    const { data: run } = await svc
      .from('plentyone_runs')
      .select('csv_status, cover_status, stats, cover_pakete')
      .eq('id', id)
      .single()

    if (!run) return NextResponse.json({ error: 'Lauf nicht gefunden' }, { status: 404 })

    // Bereits gemeldeter Strang wird nicht überschrieben (Retry-Schutz).
    const bisher = d.strang === 'csv' ? run.csv_status : run.cover_status
    if (bisher !== 'running') {
      return NextResponse.json({ ok: true, ignoriert: true })
    }

    const paketeBisher = (run.cover_pakete ?? []) as Paket[]

    // --- Zwischenmeldung: ein Paket ist fertig, der Strang läuft weiter ---
    if (d.status === 'paket' && d.paket) {
      if (d.cover?.length) {
        const { error: rpcError } = await svc.rpc('plentyone_cover_melden', {
          p_run: id,
          p_paket: d.paket.name,
          p_paket_pfad: d.paket.datei,
          p_cover: d.cover,
        })
        if (rpcError) console.error('plentyone_cover_melden:', rpcError)
      }
      const pakete = paketeVereinen(paketeBisher, [d.paket])
      const { error } = await svc
        .from('plentyone_runs')
        .update({
          cover_pakete: pakete,
          stats: { ...(run.stats ?? {}), ...coverStats(pakete) },
        })
        .eq('id', id)
      if (error) {
        console.error('plentyone callback paket:', error)
        return NextResponse.json({ error: 'Paket konnte nicht gespeichert werden' }, { status: 500 })
      }
      return NextResponse.json({ ok: true, pakete: pakete.length })
    }

    const patch: Record<string, unknown> = {
      [`${d.strang}_status`]: d.status,
    }
    if (d.fehler) patch[`${d.strang}_error`] = d.fehler

    if (d.strang === 'csv') {
      const putzen = (v: string) => v.replace(/^\/*(workflow-results\/)?/, '')
      if (d.datei) patch.csv_path = putzen(d.datei)
      if (d.eigenschaften_datei) patch.eigenschaften_path = putzen(d.eigenschaften_datei)
      if (d.hersteller_datei) patch.hersteller_path = putzen(d.hersteller_datei)
      if (d.hinweise) patch.hinweise = d.hinweise
      if (typeof d.hinweise_gesamt === 'number') patch.hinweise_gesamt = d.hinweise_gesamt
    } else {
      // Abschluss: die per Paketmeldung gesammelten Pakete bleiben, die
      // Abschlussliste ergänzt nur (Vereinigung nach Name).
      const pakete = d.pakete ? paketeVereinen(paketeBisher, d.pakete) : paketeBisher
      patch.cover_pakete = pakete
      // Kein einziges Cover trotz Paketen: die VLB hat die Sitzung abgelehnt.
      if (d.status === 'success' && pakete.length > 0 && coverStats(pakete).cover_gefunden === 0) {
        patch.cover_status = 'failed'
        patch.cover_error = 'Kein einziges Cover geladen — VLB-Anmeldung vermutlich abgelehnt.'
      }
      if (d.status === 'success') {
        patch.stats = { ...(run.stats ?? {}), ...(d.stats ?? {}), ...coverStats(pakete) }
      }
    }

    // Statistik beider Stränge zusammenführen, statt sie gegenseitig zu überschreiben
    if (d.stats && !patch.stats) {
      patch.stats = { ...(run.stats ?? {}), ...d.stats }
    }

    const { error } = await svc.from('plentyone_runs').update(patch).eq('id', id)
    if (error) {
      console.error('plentyone callback update:', error)
      return NextResponse.json({ error: 'Lauf konnte nicht aktualisiert werden' }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('POST /api/plentyone/runs/[id]/callback:', err)
    return NextResponse.json({ error: 'Interner Serverfehler' }, { status: 500 })
  }
}
