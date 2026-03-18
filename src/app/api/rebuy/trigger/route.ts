import { NextRequest, NextResponse } from 'next/server'
import { createHmac } from 'crypto'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase-server'

// POST /api/rebuy/trigger — Manuellen Scrape-Start vom Dashboard triggern
export async function POST(request: NextRequest) {
  try {
    const supabaseAuth = await createSupabaseServerClient()
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Nicht authentifiziert' }, { status: 401 })
    }

    const reqBody = await request.json().catch(() => ({}))
    const boostLevel = Math.max(0, Math.min(3, Number(reqBody.boostLevel ?? 0)))

    const supabase = createSupabaseServiceClient()

    // Prüfen ob bereits ein Scrape läuft
    const { data: running } = await supabase
      .from('rebuy_scrapes')
      .select('id')
      .eq('status', 'running')
      .limit(1)

    if (running && running.length > 0) {
      return NextResponse.json({ error: 'Es läuft bereits ein Scrape-Vorgang' }, { status: 409 })
    }

    // Container-URL laden
    const { data: settings } = await supabase
      .from('rebuy_settings')
      .select('container_url')
      .limit(1)
      .single()

    if (!settings?.container_url) {
      return NextResponse.json({ error: 'Container-URL nicht konfiguriert' }, { status: 503 })
    }

    // Neuen Scrape-Eintrag anlegen
    const { data: scrape, error: insertError } = await supabase
      .from('rebuy_scrapes')
      .insert({
        status: 'pending',
        started_at: new Date().toISOString(),
      })
      .select('id')
      .single()

    if (insertError || !scrape) {
      console.error('[POST /api/rebuy/trigger] Insert error:', insertError)
      return NextResponse.json({ error: 'Datenbankfehler' }, { status: 500 })
    }

    const scrapeId = scrape.id
    const notifyUrl = `${process.env.NEXT_PUBLIC_SITE_URL ?? 'https://dashboard.primehubgbr.com'}/api/rebuy/notify`
    const statusUrl = `${process.env.NEXT_PUBLIC_SITE_URL ?? 'https://dashboard.primehubgbr.com'}/api/rebuy/status`

    const body = JSON.stringify({ scrape_id: scrapeId, notify_url: notifyUrl, status_url: statusUrl, boost_level: boostLevel })

    // HMAC-Signatur generieren
    const hmacSecret = process.env.REBUY_HMAC_SECRET
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Api-Key': process.env.REBUY_FLASK_API_KEY ?? '',
    }
    if (hmacSecret) {
      const sig = createHmac('sha256', hmacSecret).update(body, 'utf8').digest('hex')
      headers['x-rebuy-signature'] = `sha256=${sig}`
    }

    // Container triggern
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10000)

    try {
      const response = await fetch(`${settings.container_url}/trigger`, {
        method: 'POST',
        headers,
        body,
        signal: controller.signal,
      })
      clearTimeout(timeout)

      if (!response.ok) {
        // Scrape-Eintrag auf failed setzen
        await supabase.from('rebuy_scrapes').update({ status: 'failed', error_message: `Container antwortete mit HTTP ${response.status}` }).eq('id', scrapeId)
        return NextResponse.json({ error: `Container-Fehler: HTTP ${response.status}` }, { status: 502 })
      }
    } catch (fetchErr) {
      clearTimeout(timeout)
      const msg = fetchErr instanceof Error && fetchErr.name === 'AbortError' ? 'Container nicht erreichbar (Timeout)' : 'Container nicht erreichbar'
      await supabase.from('rebuy_scrapes').update({ status: 'failed', error_message: msg }).eq('id', scrapeId)
      return NextResponse.json({ error: msg }, { status: 502 })
    }

    return NextResponse.json({ ok: true, scrape_id: scrapeId })
  } catch (err) {
    console.error('[POST /api/rebuy/trigger]', err)
    return NextResponse.json({ error: 'Interner Serverfehler' }, { status: 500 })
  }
}
