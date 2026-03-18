import { NextResponse } from 'next/server'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase-server'

// POST /api/rebuy/finalize — Scrape vorzeitig beenden + Excel generieren
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

    // Aktiven Scrape finden
    const { data: activeScrape } = await supabase
      .from('rebuy_scrapes')
      .select('id')
      .in('status', ['running', 'pending'])
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (!activeScrape) {
      return NextResponse.json({ error: 'Kein aktiver Scrape gefunden' }, { status: 409 })
    }

    // Container-Finalize aufrufen (synchron, wartet auf Excel-Generierung + Upload)
    let file_path: string
    let row_count: number
    try {
      const res = await fetch(`${settings.container_url}/finalize`, {
        method: 'POST',
        headers: { 'X-Api-Key': process.env.REBUY_FLASK_API_KEY ?? '' },
        signal: AbortSignal.timeout(120_000), // 2 min für Excel + Upload
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        // Fallback: Scrape als failed markieren
        await supabase
          .from('rebuy_scrapes')
          .update({
            status: 'failed',
            error_message: `Finalize fehlgeschlagen: ${data.error ?? res.status}`,
            finished_at: new Date().toISOString(),
          })
          .eq('id', activeScrape.id)
        return NextResponse.json({ error: data.error ?? 'finalize_failed' }, { status: res.status })
      }

      const data = await res.json()
      file_path = data.file_path
      row_count = data.row_count
    } catch (err) {
      // Container nicht erreichbar oder Timeout
      await supabase
        .from('rebuy_scrapes')
        .update({
          status: 'failed',
          error_message: 'Container nicht erreichbar (Finalize)',
          finished_at: new Date().toISOString(),
        })
        .eq('id', activeScrape.id)
      return NextResponse.json({ error: 'Container nicht erreichbar' }, { status: 503 })
    }

    // Scrape als success abschließen (Notify kommt auch vom Container — idempotent)
    await supabase
      .from('rebuy_scrapes')
      .update({
        status: 'success',
        file_path,
        row_count,
        scrape_date: new Date().toISOString().slice(0, 10),
        finished_at: new Date().toISOString(),
        progress_pages: null,
        total_pages: null,
        eta_seconds: null,
      })
      .eq('id', activeScrape.id)

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[POST /api/rebuy/finalize]', err)
    return NextResponse.json({ error: 'Interner Serverfehler' }, { status: 500 })
  }
}
