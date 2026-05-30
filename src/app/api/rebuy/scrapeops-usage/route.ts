import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'

// Live-Abfrage des ScrapeOps-Kontostands (verbleibende / initiale Credits).
// Quelle: https://scrapeops.io API – Account-Usage-Endpoint.
// 1:1-Klon der Buchpreisbindung-Variante (geteilter SCRAPEOPS_API_KEY).
export async function GET() {
  try {
    const supabaseAuth = await createSupabaseServerClient()
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Nicht authentifiziert' }, { status: 401 })
    }

    const apiKey = process.env.SCRAPEOPS_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'SCRAPEOPS_API_KEY nicht konfiguriert' }, { status: 503 })
    }

    const res = await fetch(
      `https://backend.scrapeops.io/v1/proxy/account/usage?api_key=${encodeURIComponent(apiKey)}`,
      { cache: 'no-store' }
    )

    if (!res.ok) {
      return NextResponse.json({ error: 'ScrapeOps-Abfrage fehlgeschlagen' }, { status: 502 })
    }

    const body = await res.json()
    const r = body?.results ?? {}
    const planCredits = Number(r.plan_api_credits ?? 0)
    const usedCredits = Number(r.used_api_credits ?? 0)
    const remainingCredits = Math.max(0, planCredits - usedCredits)

    return NextResponse.json({
      planCredits,
      usedCredits,
      remainingCredits,
      concurrency: Number(r.plan_max_concurrency ?? 0),
      renewalDate: r.plan_renewal_date && r.plan_renewal_date !== 'not found' ? r.plan_renewal_date : null,
    })
  } catch (err) {
    console.error('GET /api/rebuy/scrapeops-usage error:', err)
    return NextResponse.json({ error: 'Interner Serverfehler' }, { status: 500 })
  }
}
