import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase-server'

export const runtime = 'nodejs'

const RESULT_BUCKET = 'workflow-results'

/**
 * Signierte URL auf das ZIP-Paket, in dem das Cover dieser ISBN liegt.
 * Der Pfad kommt ausschließlich aus dem Bestand, nie aus dem Request.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ isbn: string }> }
) {
  const { isbn } = await params
  if (!/^[0-9]{13}$/.test(isbn)) {
    return NextResponse.json({ error: 'Ungültige ISBN' }, { status: 400 })
  }

  const auth = await createSupabaseServerClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Nicht authentifiziert' }, { status: 401 })

  const svc = createSupabaseServiceClient()
  const { data: rolle } = await svc.from('user_roles').select('role').eq('user_id', user.id).single()
  if (rolle?.role !== 'admin' && rolle?.role !== 'manager') {
    return NextResponse.json({ error: 'Keine Berechtigung' }, { status: 403 })
  }

  const { data: zeile } = await svc
    .from('plentyone_cover')
    .select('paket_pfad, status')
    .eq('isbn', isbn)
    .single()
  if (!zeile || zeile.status !== 'ok' || !zeile.paket_pfad) {
    return NextResponse.json({ error: 'Für diese ISBN liegt kein Cover vor' }, { status: 404 })
  }

  const { data: signed, error } = await svc.storage
    .from(RESULT_BUCKET)
    .createSignedUrl(zeile.paket_pfad, 300, { download: zeile.paket_pfad.split('/').pop() })
  if (error || !signed) {
    return NextResponse.json({ error: 'Download-Link konnte nicht erzeugt werden' }, { status: 500 })
  }
  return NextResponse.redirect(signed.signedUrl)
}
