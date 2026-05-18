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

    const [runResult, itemsResult] = await Promise.all([
      supabase
        .from('buchpreischeck_runs')
        .select('*')
        .eq('id', id)
        .single(),
      supabase
        .from('buchpreischeck_items')
        .select('*')
        .eq('run_id', id)
        .order('is_compliant', { ascending: true }) // violations first
        .limit(500),
    ])

    if (runResult.error || !runResult.data) {
      return NextResponse.json({ error: 'Run nicht gefunden' }, { status: 404 })
    }

    return NextResponse.json({ run: runResult.data, items: itemsResult.data ?? [] })
  } catch (err) {
    console.error('GET /api/buchpreisbindung/runs/[id] error:', err)
    return NextResponse.json({ error: 'Interner Serverfehler' }, { status: 500 })
  }
}
