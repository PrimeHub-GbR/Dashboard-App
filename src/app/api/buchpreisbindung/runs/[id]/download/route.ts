import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase-server'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    if (!UUID_RE.test(id)) {
      return NextResponse.json({ error: 'Ungültige ID' }, { status: 400 })
    }

    const supabaseAuth = await createSupabaseServerClient()
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Nicht authentifiziert' }, { status: 401 })
    }

    const supabase = createSupabaseServiceClient()
    const { data: run } = await supabase
      .from('buchpreischeck_runs')
      .select('excel_file_path, status')
      .eq('id', id)
      .single()

    if (!run || !run.excel_file_path) {
      return NextResponse.json({ error: 'Keine Excel-Datei für diesen Run' }, { status: 404 })
    }

    const { data: signedUrl, error: urlError } = await supabase.storage
      .from('workflow-results')
      .createSignedUrl(run.excel_file_path, 3600)

    if (urlError || !signedUrl?.signedUrl) {
      return NextResponse.json({ error: 'Download-URL konnte nicht erstellt werden' }, { status: 500 })
    }

    return NextResponse.json({ url: signedUrl.signedUrl })
  } catch (err) {
    console.error('GET /api/buchpreisbindung/runs/[id]/download error:', err)
    return NextResponse.json({ error: 'Interner Serverfehler' }, { status: 500 })
  }
}
