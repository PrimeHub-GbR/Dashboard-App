import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { PRICES_PAGE_SIZE } from '@/lib/price-types'

const querySchema = z.object({
  q: z.string().max(200).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(500).default(PRICES_PAGE_SIZE),
})

// Escape ILIKE wildcards so user input is treated as a literal string
function escapeLike(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/%/g, '\\%')
    .replace(/_/g, '\\_')
    .replace(/,/g, '\\,')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Nicht authentifiziert' }, { status: 401 })
    }

    const { searchParams } = request.nextUrl
    const parsed = querySchema.safeParse({
      q: searchParams.get('q') ?? undefined,
      page: searchParams.get('page') ?? undefined,
      pageSize: searchParams.get('pageSize') ?? undefined,
    })

    if (!parsed.success) {
      return NextResponse.json({ error: 'Ungültige Parameter' }, { status: 400 })
    }

    const { q, page, pageSize } = parsed.data
    const from = (page - 1) * pageSize
    const to = from + pageSize - 1

    // current_ek_prices is a view that already includes asin via LEFT JOIN —
    // select columns directly (no embedded FK join, views have no FK in PostgREST)
    let query = supabase
      .from('current_ek_prices')
      .select('ean, asin, ek_price, order_date, supplier', { count: 'exact' })

    if (q) {
      const safe = escapeLike(q)
      query = query.or(`ean.ilike.%${safe}%,asin.ilike.%${safe}%`)
    }

    query = query.order('order_date', { ascending: false, nullsFirst: false }).range(from, to)

    const { data, error: fetchError, count } = await query

    if (fetchError) {
      console.error('GET /api/prices error:', fetchError)
      return NextResponse.json({ error: 'Preisdaten konnten nicht geladen werden' }, { status: 500 })
    }

    return NextResponse.json({ data: data ?? [], totalCount: count ?? 0 })
  } catch (err) {
    console.error('GET /api/prices unexpected error:', err)
    return NextResponse.json({ error: 'Interner Serverfehler' }, { status: 500 })
  }
}
