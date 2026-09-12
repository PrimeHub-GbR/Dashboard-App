import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase-server'

export const runtime = 'nodejs'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Nur den Metadaten-Strang eines Laufs neu anstoßen.
 *
 * Der Cover-Strang bleibt unberührt — er braucht bei allen Titeln lange, und
 * ein Fehler im CSV-Strang (typisch: kein freier VLB-Slot beim Login) soll
 * nicht den ganzen Lauf samt Cover-Abruf wiederholen. Die Eingabedatei liegt
 * noch im Storage, der Webhook bekommt denselben Auftrag wie beim Start.
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

  const { data: run } = await svc
    .from('plentyone_runs')
    .select('id, csv_status, input_path, zeilen_limit')
    .eq('id', id)
    .single()
  if (!run) return NextResponse.json({ error: 'Lauf nicht gefunden' }, { status: 404 })

  if (run.csv_status !== 'failed') {
    return NextResponse.json(
      { error: 'Der CSV-Strang kann nur nach einem Fehlschlag neu gestartet werden' },
      { status: 409 }
    )
  }
  if (!run.input_path || run.input_path === 'wird-gleich-gesetzt') {
    return NextResponse.json({ error: 'Eingabedatei dieses Laufs fehlt' }, { status: 409 })
  }

  const basis = process.env.N8N_WEBHOOK_BASE_URL
  if (!basis) {
    return NextResponse.json({ error: 'N8N-Webhook-URL nicht konfiguriert' }, { status: 500 })
  }

  // Erst zurücksetzen, dann anstoßen — der Callback ignoriert Meldungen für
  // einen Strang, der nicht auf "running" steht.
  const { error: resetError } = await svc
    .from('plentyone_runs')
    .update({ csv_status: 'running', csv_error: null })
    .eq('id', id)
    .eq('csv_status', 'failed')
  if (resetError) {
    return NextResponse.json({ error: 'Lauf konnte nicht zurückgesetzt werden' }, { status: 500 })
  }

  let fehler: string | null = null
  try {
    const res = await fetch(`${basis}/plentyone-metadata`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        run_id: run.id,
        input_file_path: run.input_path,
        callback_url: `${request.nextUrl.origin}/api/plentyone/runs/${run.id}/callback`,
        limit: run.zeilen_limit,
      }),
    })
    if (!res.ok) {
      const txt = await res.text().catch(() => '')
      fehler = `n8n antwortete ${res.status} ${txt.slice(0, 200)}`
    }
  } catch (e) {
    fehler = `n8n nicht erreichbar: ${e instanceof Error ? e.message : 'Netzwerkfehler'}`
  }

  if (fehler) {
    await svc
      .from('plentyone_runs')
      .update({ csv_status: 'failed', csv_error: fehler })
      .eq('id', id)
    return NextResponse.json({ error: fehler }, { status: 502 })
  }

  const { data: aktuell } = await svc.from('plentyone_runs').select('*').eq('id', id).single()
  return NextResponse.json({ run: aktuell })
}
