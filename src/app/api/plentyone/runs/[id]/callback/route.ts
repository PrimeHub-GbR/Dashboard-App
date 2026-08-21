import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createSupabaseServiceClient } from '@/lib/supabase-server'

export const runtime = 'nodejs'

/**
 * Rückmeldung aus N8N. Jeder der beiden Stränge meldet sich eigenständig —
 * der Gesamtstatus des Laufs wird per DB-Trigger daraus abgeleitet.
 */
const callbackSchema = z.object({
  strang: z.enum(['csv', 'cover']),
  status: z.enum(['success', 'failed']),
  fehler: z.string().max(2000).optional(),
  // Strang csv
  datei: z.string().max(500).optional(),
  eigenschaften_datei: z.string().max(500).optional(),
  stats: z.record(z.string(), z.unknown()).optional(),
  hinweise: z.array(z.record(z.string(), z.unknown())).optional(),
  hinweise_gesamt: z.number().int().nonnegative().optional(),
  // Strang cover
  pakete: z.array(z.record(z.string(), z.unknown())).optional(),
  fehlende_isbn: z.array(z.string()).optional(),
})

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

    const svc = createSupabaseServiceClient()
    const { data: run } = await svc
      .from('plentyone_runs')
      .select('csv_status, cover_status, stats')
      .eq('id', id)
      .single()

    if (!run) return NextResponse.json({ error: 'Lauf nicht gefunden' }, { status: 404 })

    // Bereits gemeldeter Strang wird nicht überschrieben (Retry-Schutz).
    const bisher = d.strang === 'csv' ? run.csv_status : run.cover_status
    if (bisher !== 'running') {
      return NextResponse.json({ ok: true, ignoriert: true })
    }

    const patch: Record<string, unknown> = {
      [`${d.strang}_status`]: d.status,
    }
    if (d.fehler) patch[`${d.strang}_error`] = d.fehler

    if (d.strang === 'csv') {
      const putzen = (v: string) => v.replace(/^\/*(workflow-results\/)?/, '')
      if (d.datei) patch.csv_path = putzen(d.datei)
      if (d.eigenschaften_datei) patch.eigenschaften_path = putzen(d.eigenschaften_datei)
      if (d.hinweise) patch.hinweise = d.hinweise
      if (typeof d.hinweise_gesamt === 'number') patch.hinweise_gesamt = d.hinweise_gesamt
    } else {
      if (d.pakete) patch.cover_pakete = d.pakete
    }

    // Statistik beider Stränge zusammenführen, statt sie gegenseitig zu überschreiben
    if (d.stats) {
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
