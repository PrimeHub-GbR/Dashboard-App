import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createSupabaseServerClient } from '@/lib/supabase-server'

const querySchema = z.object({
  q: z.string().max(200).optional(),
})

function escapeLike(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/%/g, '\\%')
    .replace(/_/g, '\\_')
    .replace(/,/g, '\\,')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
}

function toCsv(
  rows: { ean: string; asin: string | null; ek_price: number | null; supplier: string | null; order_date: string | null }[]
): string {
  const header = ['EAN', 'ASIN', 'EK-Preis (EUR)', 'Lieferant', 'Bestelldatum']
  const escape = (v: string) => `"${v.replace(/"/g, '""')}"`
  const lines = rows.map((r) => [
    escape(r.ean),
    escape(r.asin ?? ''),
    escape(r.ek_price != null ? r.ek_price.toFixed(2) : ''),
    escape(r.supplier ?? ''),
    escape(r.order_date ? new Date(r.order_date).toLocaleDateString('de-DE') : ''),
  ].join(','))
  return [header.map(escape).join(','), ...lines].join('\n')
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Nicht authentifiziert' }, { status: 401 })
    }

    const { searchParams } = request.nextUrl
    const parsed = querySchema.safeParse({ q: searchParams.get('q') ?? undefined })

    if (!parsed.success) {
      return NextResponse.json({ error: 'Ungültige Parameter' }, { status: 400 })
    }

    const { q } = parsed.data

    let query = supabase
      .from('current_ek_prices')
      .select('ean, asin, ek_price, order_date, supplier')
      .order('order_date', { ascending: false, nullsFirst: false })
      .limit(10000)

    if (q) {
      const safe = escapeLike(q)
      query = query.or(`ean.ilike.%${safe}%,asin.ilike.%${safe}%`)
    }

    const { data, error: fetchError } = await query

    if (fetchError) {
      console.error('GET /api/prices/export error:', fetchError)
      return NextResponse.json({ error: 'Export fehlgeschlagen' }, { status: 500 })
    }

    const rows = (data ?? []).map((row) => ({
      ean: row.ean as string,
      asin: (row.asin as string | null) ?? null,
      ek_price: row.ek_price != null ? Number(row.ek_price) : null,
      order_date: (row.order_date as string | null) ?? null,
      supplier: (row.supplier as string | null) ?? null,
    }))

    const csv = toCsv(rows)
    const date = new Date().toISOString().slice(0, 10)

    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="preisdatenbank_${date}.csv"`,
      },
    })
  } catch (err) {
    console.error('GET /api/prices/export unexpected error:', err)
    return NextResponse.json({ error: 'Interner Serverfehler' }, { status: 500 })
  }
}
