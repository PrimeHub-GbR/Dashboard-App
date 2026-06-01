import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase-server'

export interface OrderSearchResult {
  id: string
  title: string | null
  ean: string | null
  supplier: string | null
  file_name: string | null
  order_date: string | null
  quantity: number | null
  cost: number | null
  total: number | null
}

const RESULT_LIMIT = 200

// Sonderzeichen escapen, die PostgREST in .or()-Filtern interpretiert
function sanitize(input: string): string {
  return input.replace(/[\\,.()%]/g, '\\$&')
}

// GET /api/orders/search?q=... — Suche über ISBN/EAN + Titel
export async function GET(req: NextRequest) {
  try {
    const supabaseAuth = await createSupabaseServerClient()
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Nicht authentifiziert' }, { status: 401 })
    }

    const q = (req.nextUrl.searchParams.get('q') ?? '').trim()
    // Erst ab 2 Zeichen suchen — sonst leeres Ergebnis
    if (q.length < 2) {
      return NextResponse.json({ results: [], truncated: false })
    }

    const safe = sanitize(q)
    const supabase = createSupabaseServiceClient()
    const { data, error } = await supabase
      .from('orders')
      .select('id, title, ean, supplier, file_name, order_date, quantity, cost, total')
      .or(`ean.ilike.%${safe}%,title.ilike.%${safe}%`)
      .order('supplier', { ascending: true })
      .order('file_name', { ascending: true })
      .limit(RESULT_LIMIT)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const results = (data ?? []) as OrderSearchResult[]
    return NextResponse.json({
      results,
      truncated: results.length === RESULT_LIMIT,
    })
  } catch (err) {
    console.error('GET /api/orders/search error:', err)
    return NextResponse.json({ error: 'Interner Serverfehler' }, { status: 500 })
  }
}
