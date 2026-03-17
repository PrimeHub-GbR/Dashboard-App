import { NextResponse } from 'next/server'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase-server'

// GET /api/rebuy/logs — Letzte Log-Zeilen vom Container holen
export async function GET() {
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
      return NextResponse.json({ lines: [], total: 0, error: 'Container-URL nicht konfiguriert' })
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 8000)

    try {
      const res = await fetch(`${settings.container_url}/logs`, {
        headers: { 'X-Api-Key': process.env.REBUY_FLASK_API_KEY ?? '' },
        signal: controller.signal,
      })
      clearTimeout(timeout)

      if (!res.ok) {
        return NextResponse.json({ lines: [], total: 0, error: `Container HTTP ${res.status}` })
      }

      const data = await res.json()
      return NextResponse.json({ lines: data.lines ?? [], total: data.total ?? 0 })
    } catch {
      clearTimeout(timeout)
      return NextResponse.json({ lines: [], total: 0, error: 'Container nicht erreichbar' })
    }
  } catch (err) {
    console.error('[GET /api/rebuy/logs]', err)
    return NextResponse.json({ lines: [], total: 0, error: 'Interner Serverfehler' }, { status: 500 })
  }
}
