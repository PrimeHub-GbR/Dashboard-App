import { NextResponse } from 'next/server'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Stösst den n8n-Workflow an, der den eBay-Statusbericht erzeugt.
 *
 * Der Workflow antwortet sofort (Webhook-Modus "onReceived") und liefert das
 * Ergebnis später per POST an /api/plentyone/ebay/bericht. Diese Route wartet
 * deshalb nicht auf den Bericht — das Dashboard fragt ihn danach ab.
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

  const url = process.env.N8N_EBAY_BERICHT_URL
  if (!url) {
    return NextResponse.json(
      { error: 'Webhook-URL fehlt (N8N_EBAY_BERICHT_URL)' },
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
      return NextResponse.json(
        { error: `n8n antwortete ${res.status}`, details: text.slice(0, 300) },
        { status: 502 }
      )
    }
  } catch (e) {
    const m = e instanceof Error ? e.message : 'Netzwerkfehler'
    return NextResponse.json({ error: `n8n nicht erreichbar: ${m}` }, { status: 502 })
  }

  return NextResponse.json({ ok: true }, { status: 202 })
}
