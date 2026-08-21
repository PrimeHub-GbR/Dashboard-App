import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase-server'

export const runtime = 'nodejs'

const RESULT_BUCKET = 'workflow-results'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Liefert eine signierte Download-URL. `datei` ist entweder `csv` oder der Name
 * eines Cover-Pakets. Der Pfad wird ausschliesslich aus dem Datensatz gelesen,
 * nie aus dem Parameter übernommen — sonst wäre der Bucket frei durchsuchbar.
 */
export async function GET(
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

  const gesucht = request.nextUrl.searchParams.get('datei') ?? 'csv'

  const { data: run } = await svc
    .from('plentyone_runs')
    .select('csv_path, eigenschaften_path, cover_pakete')
    .eq('id', id)
    .single()
  if (!run) return NextResponse.json({ error: 'Lauf nicht gefunden' }, { status: 404 })

  let pfad: string | null = null
  if (gesucht === 'csv') {
    pfad = run.csv_path
  } else if (gesucht === 'eigenschaften') {
    pfad = run.eigenschaften_path
  } else {
    const paket = ((run.cover_pakete ?? []) as Array<{ name?: string; datei?: string }>).find(
      (p) => p?.name === gesucht
    )
    pfad = paket?.datei ?? null
  }

  if (!pfad) {
    return NextResponse.json({ error: 'Datei ist für diesen Lauf nicht vorhanden' }, { status: 404 })
  }

  const { data: signed, error } = await svc.storage
    .from(RESULT_BUCKET)
    .createSignedUrl(pfad, 300, { download: pfad.split('/').pop() })

  if (error || !signed) {
    return NextResponse.json({ error: 'Download-Link konnte nicht erzeugt werden' }, { status: 500 })
  }

  return NextResponse.redirect(signed.signedUrl)
}
