import { NextResponse } from 'next/server'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Stösst den n8n-Workflow "Market-Listings ALLE neu pruefen" an.
 *
 * Anders als der nächtliche Lauf (04:30, nur ungeprüfte) prüft er JEDES
 * Market-Listing erneut — nötig, wenn sich bei eBay etwas am Konto ändert
 * (z. B. Top-Shop-Gebühren) oder fehlgeschlagene Angebote korrigiert wurden.
 *
 * Der Lauf dauert bei ~2.000 Angeboten rund 30 Minuten (PlentyONE-Aufruflimit). n8n antwortet sofort mit
 * 202 und stösst am Ende selbst den Statusbericht an — das Dashboard wartet
 * deshalb auf einen neuen Bericht statt auf diese Antwort.
 */
export async function POST() {
  const auth = await createSupabaseServerClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Nicht authentifiziert' }, { status: 401 })

  const svc = createSupabaseServiceClient()
  const { data: rolle } = await svc
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .single()
  if (rolle?.role !== 'admin' && rolle?.role !== 'manager') {
    return NextResponse.json({ error: 'Keine Berechtigung' }, { status: 403 })
  }

  const basis = process.env.N8N_WEBHOOK_BASE_URL
  const url = process.env.N8N_LISTINGS_ALLE_PRUEFEN_URL
    ?? (basis ? `${basis.replace(/\/$/, '')}/listings-alle-pruefen` : undefined)
  if (!url) {
    return NextResponse.json(
      { error: 'Webhook-URL fehlt (N8N_LISTINGS_ALLE_PRUEFEN_URL)' },
      { status: 503 }
    )
  }

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(process.env.N8N_EBAY_TOKEN ? { 'x-primehub-token': process.env.N8N_EBAY_TOKEN } : {}),
      },
      body: '{}',
      cache: 'no-store',
      signal: AbortSignal.timeout(20_000),
    })
    if (!res.ok) {
      const text = await res.text()
      const hinweis = res.status === 404
        ? 'Workflow in n8n nicht gefunden oder nicht aktiv'
        : `n8n antwortete ${res.status}`
      return NextResponse.json({ error: hinweis, details: text.slice(0, 300) }, { status: 502 })
    }
  } catch (e) {
    const m = e instanceof Error ? e.message : 'Netzwerkfehler'
    return NextResponse.json({ error: `n8n nicht erreichbar: ${m}` }, { status: 502 })
  }

  return NextResponse.json({ ok: true }, { status: 202 })
}
