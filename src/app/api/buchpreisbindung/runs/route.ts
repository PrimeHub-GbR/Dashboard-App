import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase-server'

export async function GET(request: NextRequest) {
  try {
    const supabaseAuth = await createSupabaseServerClient()
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Nicht authentifiziert' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const sellerDbId = searchParams.get('seller_id')

    const supabase = createSupabaseServiceClient()
    let query = supabase
      .from('buchpreischeck_runs')
      .select('id, seller_id, amazon_seller_id, status, triggered_by, total_items, violations_count, excel_file_path, error_message, proxy_bytes, pages_scraped, started_at, completed_at, created_at')
      .order('created_at', { ascending: false })
      .limit(50)

    if (sellerDbId) {
      query = query.eq('seller_id', sellerDbId)
    }

    const { data, error } = await query
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(data)
  } catch (err) {
    console.error('GET /api/buchpreisbindung/runs error:', err)
    return NextResponse.json({ error: 'Interner Serverfehler' }, { status: 500 })
  }
}
