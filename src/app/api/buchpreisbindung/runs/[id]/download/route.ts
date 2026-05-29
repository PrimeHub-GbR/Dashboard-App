import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase-server'
import { buildBuchpreischeckExcel } from '@/lib/buchpreisbindung-excel'

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
      .select('seller_id, amazon_seller_id, status, triggered_by, total_items, violations_count, scrapeops_credits, started_at, completed_at')
      .eq('id', id)
      .single()

    if (!run) {
      return NextResponse.json({ error: 'Lauf nicht gefunden' }, { status: 404 })
    }
    if (run.status !== 'success' || (run.total_items ?? 0) === 0) {
      return NextResponse.json({ error: 'Kein erfolgreicher Lauf mit Ergebnissen' }, { status: 404 })
    }

    const { data: seller } = await supabase
      .from('buchpreischeck_sellers')
      .select('seller_name, amazon_seller_id')
      .eq('id', run.seller_id)
      .single()

    const { data: items } = await supabase
      .from('buchpreischeck_items')
      .select('isbn13, asin, title, amazon_price, vlb_price, amazon_url, is_compliant')
      .eq('run_id', id)
      .limit(50000)

    if (!items || items.length === 0) {
      return NextResponse.json({ error: 'Keine Items für diesen Lauf gespeichert' }, { status: 404 })
    }

    const buffer = await buildBuchpreischeckExcel(
      {
        amazon_seller_id: run.amazon_seller_id,
        triggered_by: run.triggered_by,
        total_items: run.total_items,
        violations_count: run.violations_count,
        scrapeops_credits: run.scrapeops_credits,
        started_at: run.started_at,
        completed_at: run.completed_at,
      },
      {
        seller_name: seller?.seller_name ?? null,
        amazon_seller_id: seller?.amazon_seller_id ?? run.amazon_seller_id,
      },
      items
    )

    const d = new Date(run.started_at)
    const pad = (n: number) => String(n).padStart(2, '0')
    const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
    const time = `${pad(d.getHours())}-${pad(d.getMinutes())}`
    const filename = `buchpreischeck_${run.amazon_seller_id}_${date}_${time}.xlsx`

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (err) {
    console.error('GET /api/buchpreisbindung/runs/[id]/download error:', err)
    return NextResponse.json({ error: 'Interner Serverfehler' }, { status: 500 })
  }
}
