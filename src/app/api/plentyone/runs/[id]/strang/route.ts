import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase-server'
import { strangAnstossen } from '@/lib/plentyone-strang'

export const runtime = 'nodejs'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const bodySchema = z.object({
  strang: z.enum(['csv', 'cover']),
})

/**
 * Einen einzelnen Strang eines bestehenden Laufs (nach)starten.
 *
 * Erlaubt, wenn der Strang "pending" (nie gestartet) oder "failed" ist. Der
 * andere Strang bleibt unberührt — typischer Ablauf: erst nur die CSV, und
 * wenn die sitzt, die Cover hinterher. Die Eingabedatei liegt noch im
 * Storage, der Webhook bekommt denselben Auftrag wie beim Start.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  if (!UUID.test(id)) {
    return NextResponse.json({ error: 'Ungültige Lauf-ID' }, { status: 400 })
  }

  const auth = await createSupabaseServerClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Nicht authentifiziert' }, { status: 401 })

  const svc = createSupabaseServiceClient()
  const { data: rolle } = await svc
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .single()
  if (rolle?.role !== 'admin' && rolle?.role !== 'manager') {
    return NextResponse.json({ error: 'Keine Berechtigung' }, { status: 403 })
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Ungültiger Strang' }, { status: 400 })
  }
  const { strang } = parsed.data
  const statusFeld = `${strang}_status` as const
  const fehlerFeld = `${strang}_error` as const

  const { data: run } = await svc
    .from('plentyone_runs')
    .select('id, csv_status, cover_status, input_path, zeilen_limit')
    .eq('id', id)
    .single()
  if (!run) return NextResponse.json({ error: 'Lauf nicht gefunden' }, { status: 404 })

  const bisher = run[statusFeld] as string
  if (bisher !== 'pending' && bisher !== 'failed') {
    return NextResponse.json(
      { error: `Der ${strang === 'csv' ? 'CSV' : 'Cover'}-Strang läuft bereits oder ist fertig` },
      { status: 409 }
    )
  }
  if (!run.input_path || run.input_path === 'wird-gleich-gesetzt') {
    return NextResponse.json({ error: 'Eingabedatei dieses Laufs fehlt' }, { status: 409 })
  }

  // Erst zurücksetzen, dann anstoßen — der Callback ignoriert Meldungen für
  // einen Strang, der nicht auf "running" steht.
  const { error: resetError } = await svc
    .from('plentyone_runs')
    .update({ [statusFeld]: 'running', [fehlerFeld]: null })
    .eq('id', id)
    .eq(statusFeld, bisher)
  if (resetError) {
    return NextResponse.json({ error: 'Lauf konnte nicht zurückgesetzt werden' }, { status: 500 })
  }

  const fehler = await strangAnstossen(strang, {
    run_id: run.id,
    input_file_path: run.input_path,
    callback_url: `${request.nextUrl.origin}/api/plentyone/runs/${run.id}/callback`,
    limit: run.zeilen_limit,
  })

  if (fehler) {
    await svc
      .from('plentyone_runs')
      .update({ [statusFeld]: 'failed', [fehlerFeld]: fehler })
      .eq('id', id)
    return NextResponse.json({ error: fehler }, { status: 502 })
  }

  const { data: aktuell } = await svc.from('plentyone_runs').select('*').eq('id', id).single()
  return NextResponse.json({ run: aktuell })
}
