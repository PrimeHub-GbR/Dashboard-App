import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase-server'

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// GET /api/rebuy/[id]/download — Signed URL für Excel-Datei generieren
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    if (!UUID_REGEX.test(id)) {
      return NextResponse.json({ error: 'Ungültige ID' }, { status: 400 })
    }

    const supabaseAuth = await createSupabaseServerClient()
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Nicht authentifiziert' }, { status: 401 })
    }

    const supabase = createSupabaseServiceClient()

    const { data: scrape, error: fetchError } = await supabase
      .from('rebuy_scrapes')
      .select('file_path, status')
      .eq('id', id)
      .single()

    if (fetchError || !scrape) {
      return NextResponse.json({ error: 'Scrape nicht gefunden' }, { status: 404 })
    }

    if (scrape.status !== 'success' || !scrape.file_path) {
      return NextResponse.json({ error: 'Datei nicht verfügbar' }, { status: 404 })
    }

    const { data: signedUrlData, error: signError } = await supabase.storage
      .from('rebuy-results')
      .createSignedUrl(scrape.file_path, 3600) // 1 Stunde gültig

    if (signError || !signedUrlData?.signedUrl) {
      console.error('[GET /api/rebuy/[id]/download] Sign error:', signError)
      return NextResponse.json({ error: 'Signed URL konnte nicht erstellt werden' }, { status: 500 })
    }

    return NextResponse.json({ url: signedUrlData.signedUrl })
  } catch (err) {
    console.error('[GET /api/rebuy/[id]/download]', err)
    return NextResponse.json({ error: 'Interner Serverfehler' }, { status: 500 })
  }
}
