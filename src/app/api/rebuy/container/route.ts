import { NextResponse } from 'next/server'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase-server'

// GET /api/rebuy/container — Proxy-Route: prüft ob der LXC-Container erreichbar ist
export async function GET() {
  try {
    const supabaseAuth = await createSupabaseServerClient()
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Nicht authentifiziert' }, { status: 401 })
    }

    const supabase = createSupabaseServiceClient()

    // Container-URL aus Settings laden
    const { data: settings } = await supabase
      .from('rebuy_settings')
      .select('container_url')
      .limit(1)
      .single()

    if (!settings?.container_url) {
      return NextResponse.json({ online: false, reason: 'container_url nicht konfiguriert' })
    }

    // Health-Check mit kurzem Timeout
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 5000) // 5 Sekunden

    try {
      const response = await fetch(`${settings.container_url}/health`, {
        signal: controller.signal,
        cache: 'no-store',
      })
      clearTimeout(timeout)

      if (response.ok) {
        const data = await response.json().catch(() => ({}))
        return NextResponse.json({ online: true, ...data })
      }

      return NextResponse.json({ online: false, reason: `HTTP ${response.status}` })
    } catch (fetchErr) {
      clearTimeout(timeout)
      const reason = fetchErr instanceof Error && fetchErr.name === 'AbortError'
        ? 'Timeout (5s)'
        : 'Nicht erreichbar'
      return NextResponse.json({ online: false, reason })
    }
  } catch (err) {
    console.error('[GET /api/rebuy/container]', err)
    return NextResponse.json({ error: 'Interner Serverfehler' }, { status: 500 })
  }
}
