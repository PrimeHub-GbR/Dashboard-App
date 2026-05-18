import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createHmac } from 'crypto'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase-server'
import { rateLimit } from '@/lib/rate-limit'

const runSchema = z.object({
  seller_id: z.string().uuid('Ungültige Seller-UUID'),
})

function signPayload(body: string, secret: string): string {
  return 'sha256=' + createHmac('sha256', secret).update(body, 'utf8').digest('hex')
}

export async function POST(request: NextRequest) {
  try {
    const supabaseAuth = await createSupabaseServerClient()
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Nicht authentifiziert' }, { status: 401 })
    }

    if (!rateLimit(`buchpreischeck-run:${user.id}`, 5, 60_000)) {
      return NextResponse.json({ error: 'Zu viele Anfragen (max. 5/min)' }, { status: 429 })
    }

    const body = await request.json()
    const parsed = runSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
    }

    const supabase = createSupabaseServiceClient()

    // Get seller
    const { data: seller } = await supabase
      .from('buchpreischeck_sellers')
      .select('id, amazon_seller_id, user_id')
      .eq('id', parsed.data.seller_id)
      .single()

    if (!seller) {
      return NextResponse.json({ error: 'Händler nicht gefunden' }, { status: 404 })
    }

    // Create run record
    const { data: run, error: runError } = await supabase
      .from('buchpreischeck_runs')
      .insert({
        seller_id: seller.id,
        amazon_seller_id: seller.amazon_seller_id,
        status: 'running',
        triggered_by: 'manual',
      })
      .select()
      .single()

    if (runError || !run) {
      return NextResponse.json({ error: 'Run konnte nicht erstellt werden' }, { status: 500 })
    }

    // Trigger N8N
    const n8nBaseUrl = process.env.N8N_WEBHOOK_BASE_URL
    if (!n8nBaseUrl) {
      await supabase
        .from('buchpreischeck_runs')
        .update({ status: 'failed', error_message: 'N8N Webhook URL nicht konfiguriert' })
        .eq('id', run.id)
      return NextResponse.json({ error: 'N8N nicht konfiguriert' }, { status: 500 })
    }

    const callbackUrl = `${request.nextUrl.origin}/api/buchpreisbindung/callback/${run.id}`
    const outboundBody = JSON.stringify({
      run_id: run.id,
      seller_id: seller.amazon_seller_id,
      callback_url: callbackUrl,
    })

    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    const hmacSecret = process.env.N8N_HMAC_SECRET
    if (hmacSecret) {
      headers['x-dashboard-signature'] = signPayload(outboundBody, hmacSecret)
    }

    try {
      const n8nResp = await fetch(`${n8nBaseUrl}/buchpreisbindung-check`, {
        method: 'POST',
        headers,
        body: outboundBody,
      })

      if (!n8nResp.ok) {
        const errText = await n8nResp.text().catch(() => '')
        await supabase
          .from('buchpreischeck_runs')
          .update({ status: 'failed', error_message: `N8N Fehler (${n8nResp.status}): ${errText}` })
          .eq('id', run.id)
        return NextResponse.json({ error: 'N8N-Workflow konnte nicht gestartet werden' }, { status: 502 })
      }
    } catch (fetchErr) {
      const msg = fetchErr instanceof Error ? fetchErr.message : 'Netzwerkfehler'
      await supabase
        .from('buchpreischeck_runs')
        .update({ status: 'failed', error_message: `N8N nicht erreichbar: ${msg}` })
        .eq('id', run.id)
      return NextResponse.json({ error: 'N8N nicht erreichbar' }, { status: 502 })
    }

    return NextResponse.json({ run_id: run.id }, { status: 201 })
  } catch (err) {
    console.error('POST /api/buchpreisbindung/run error:', err)
    return NextResponse.json({ error: 'Interner Serverfehler' }, { status: 500 })
  }
}
