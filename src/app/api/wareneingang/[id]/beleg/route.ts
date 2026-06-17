import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase-server'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const BUCKET = 'wareneingang-belege'

async function requireAuth() {
  const supabase = await createSupabaseServerClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return null
  return user
}

// Liefert eine Signed URL zum AB- oder Lieferschein-PDF.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireAuth()
  if (!user) {
    return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 })
  }

  const { id } = await params
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: 'Ungültige ID' }, { status: 400 })
  }

  const { searchParams } = new URL(req.url)
  const type = searchParams.get('type') === 'ls' ? 'ls' : 'ab'

  const service = createSupabaseServiceClient()
  const { data: row, error } = await service
    .from('wareneingang')
    .select('ab_pdf_path, ls_pdf_path')
    .eq('id', id)
    .maybeSingle()

  if (error || !row) {
    return NextResponse.json({ error: 'Nicht gefunden' }, { status: 404 })
  }

  const key = type === 'ls' ? row.ls_pdf_path : row.ab_pdf_path
  if (!key) {
    return NextResponse.json({ error: 'Kein Beleg vorhanden' }, { status: 404 })
  }

  const { data: signed, error: signError } = await service.storage
    .from(BUCKET)
    .createSignedUrl(key, 60 * 5)

  if (signError || !signed) {
    console.error('Signed-URL fehlgeschlagen:', signError)
    return NextResponse.json({ error: 'URL-Fehler' }, { status: 500 })
  }

  return NextResponse.json({ url: signed.signedUrl })
}
