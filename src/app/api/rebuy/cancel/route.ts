import { NextResponse } from 'next/server'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase-server'

// POST /api/rebuy/cancel — Laufenden Scrape abbrechen
export async function POST() {
  try {
    const supabaseAuth = await createSupabaseServerClient()
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Nicht authentifiziert' }, { status: 401 })
    }

    const supabase = createSupabaseServiceClient()

    const { data: settings } = await supabase
      .from('rebuy_settings')
      .select('container_url')
      .limit(1)
      .single()

    if (!settings?.container_url) {
      return NextResponse.json({ error: 'Container-URL nicht konfiguriert' }, { status: 503 })
    }

    // Container-Cancel aufrufen
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 5000)
    try {
      const res = await fetch(`${settings.container_url}/cancel`, {
        method: 'POST',
        signal: controller.signal,
      })
      clearTimeout(timeout)
      if (!res.ok && res.status !== 409) {
        const data = await res.json().catch(() => ({}))
        return NextResponse.json({ error: data.error ?? 'cancel_failed' }, { status: res.status })
      }
    } catch {
      clearTimeout(timeout)
      // Container nicht erreichbar — trotzdem Supabase-Eintrag korrigieren
    }

    // Laufende Scrapes in Supabase auf failed setzen
    await supabase
      .from('rebuy_scrapes')
      .update({
        status: 'failed',
        error_message: 'Manuell abgebrochen',
        finished_at: new Date().toISOString(),
      })
      .in('status', ['running', 'pending'])

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[POST /api/rebuy/cancel]', err)
    return NextResponse.json({ error: 'Interner Serverfehler' }, { status: 500 })
  }
}
