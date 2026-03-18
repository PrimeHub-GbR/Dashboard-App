import { NextResponse } from 'next/server'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase-server'

// POST /api/rebuy/resume — Pausierten Scrape nach Guthaben-Aufladung fortsetzen
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

    // Pausierten Scrape finden
    const { data: pausedScrape } = await supabase
      .from('rebuy_scrapes')
      .select('id')
      .eq('status', 'paused')
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (!pausedScrape) {
      return NextResponse.json({ error: 'Kein pausierter Scrape gefunden' }, { status: 409 })
    }

    // Container-Resume aufrufen
    try {
      const res = await fetch(`${settings.container_url}/resume`, {
        method: 'POST',
        headers: { 'X-Api-Key': process.env.REBUY_FLASK_API_KEY ?? '' },
        signal: AbortSignal.timeout(10_000),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        return NextResponse.json({ error: data.error ?? 'resume_failed' }, { status: res.status })
      }
    } catch {
      return NextResponse.json({ error: 'Container nicht erreichbar' }, { status: 503 })
    }

    // DB-Status zurück auf running setzen
    await supabase
      .from('rebuy_scrapes')
      .update({
        status: 'running',
        error_message: null,
      })
      .eq('id', pausedScrape.id)

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[POST /api/rebuy/resume]', err)
    return NextResponse.json({ error: 'Interner Serverfehler' }, { status: 500 })
  }
}
