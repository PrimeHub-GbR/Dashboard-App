import { NextResponse } from 'next/server'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase-server'

// GET /api/rebuy — Liste aller Scrapes + aktueller Status
// Self-healing: gleicht DB-Status mit echtem Container-Status ab
export async function GET() {
  try {
    const supabaseAuth = await createSupabaseServerClient()
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Nicht authentifiziert' }, { status: 401 })
    }

    const supabase = createSupabaseServiceClient()

    const { data: scrapes, error } = await supabase
      .from('rebuy_scrapes')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const list = scrapes ?? []

    // Self-healing: wenn DB running/pending zeigt, aber Container idle ist → failed setzen
    const stuckScrapes = list.filter((s) => s.status === 'running' || s.status === 'pending')
    if (stuckScrapes.length > 0) {
      try {
        const { data: settings } = await supabase
          .from('rebuy_settings')
          .select('container_url')
          .limit(1)
          .single()

        if (settings?.container_url) {
          const controller = new AbortController()
          const timeout = setTimeout(() => controller.abort(), 4000)
          const healthRes = await fetch(`${settings.container_url}/health`, {
            signal: controller.signal,
            cache: 'no-store',
          }).catch(() => null)
          clearTimeout(timeout)

          if (healthRes?.ok) {
            const health = await healthRes.json().catch(() => ({}))
            if (health.running === false) {
              const ids = stuckScrapes.map((s: { id: string }) => s.id)
              await supabase
                .from('rebuy_scrapes')
                .update({
                  status: 'failed',
                  error_message: 'Scraper-Prozess unerwartet beendet (Container-Status: idle)',
                  finished_at: new Date().toISOString(),
                })
                .in('id', ids)

              for (const s of list) {
                if (ids.includes(s.id)) {
                  s.status = 'failed'
                  s.error_message = 'Scraper-Prozess unerwartet beendet (Container-Status: idle)'
                  s.finished_at = new Date().toISOString()
                }
              }
            }
          }
        }
      } catch {
        // Self-healing ist best-effort — Fehler nicht propagieren
      }
    }

    return NextResponse.json(list)
  } catch (err) {
    console.error('[GET /api/rebuy]', err)
    return NextResponse.json({ error: 'Interner Serverfehler' }, { status: 500 })
  }
}
