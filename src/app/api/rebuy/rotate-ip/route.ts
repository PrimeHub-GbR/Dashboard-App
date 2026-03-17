import { NextResponse } from 'next/server'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase-server'

// POST /api/rebuy/rotate-ip — Cloudflare Warp IP rotieren
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

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 20000)

    try {
      const res = await fetch(`${settings.container_url}/rotate-ip`, {
        method: 'POST',
        headers: { 'X-Api-Key': process.env.REBUY_FLASK_API_KEY ?? '' },
        signal: controller.signal,
      })
      clearTimeout(timeout)

      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        return NextResponse.json({ error: data.error ?? 'rotate_failed' }, { status: res.status })
      }
      return NextResponse.json({ ok: true })
    } catch {
      clearTimeout(timeout)
      return NextResponse.json({ error: 'Container nicht erreichbar' }, { status: 502 })
    }
  } catch (err) {
    console.error('[POST /api/rebuy/rotate-ip]', err)
    return NextResponse.json({ error: 'Interner Serverfehler' }, { status: 500 })
  }
}
