import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase-server'

const settingsUpdateSchema = z.object({
  schedule: z.string().min(1).optional(),
  container_url: z.string().url().optional().or(z.literal('')),
  backup_proxy_url: z.string().optional(),
  default_mode: z.enum(['bestseller', 'komplett']).optional(),
  auto_scrape_enabled: z.boolean().optional(),
})

// GET /api/rebuy/settings — Aktuelle Einstellungen laden
export async function GET() {
  try {
    const supabaseAuth = await createSupabaseServerClient()
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Nicht authentifiziert' }, { status: 401 })
    }

    const supabase = createSupabaseServiceClient()

    const { data, error } = await supabase
      .from('rebuy_settings')
      .select('*')
      .limit(1)
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(data)
  } catch (err) {
    console.error('[GET /api/rebuy/settings]', err)
    return NextResponse.json({ error: 'Interner Serverfehler' }, { status: 500 })
  }
}

// PUT /api/rebuy/settings — Einstellungen aktualisieren
export async function PUT(request: NextRequest) {
  try {
    const supabaseAuth = await createSupabaseServerClient()
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Nicht authentifiziert' }, { status: 401 })
    }

    const body = await request.json()
    const result = settingsUpdateSchema.safeParse(body)
    if (!result.success) {
      return NextResponse.json({ error: result.error.flatten() }, { status: 400 })
    }

    const supabase = createSupabaseServiceClient()

    // Ersten Eintrag holen
    const { data: existing } = await supabase
      .from('rebuy_settings')
      .select('id')
      .limit(1)
      .single()

    if (!existing) {
      return NextResponse.json({ error: 'Settings nicht gefunden' }, { status: 404 })
    }

    const updateData: Record<string, string | boolean> = {}
    if (result.data.schedule !== undefined) updateData.schedule = result.data.schedule
    if (result.data.container_url !== undefined) updateData.container_url = result.data.container_url
    if (result.data.backup_proxy_url !== undefined) updateData.backup_proxy_url = result.data.backup_proxy_url
    if (result.data.default_mode !== undefined) updateData.default_mode = result.data.default_mode
    if (result.data.auto_scrape_enabled !== undefined) updateData.auto_scrape_enabled = result.data.auto_scrape_enabled

    const { data: updated, error: updateError } = await supabase
      .from('rebuy_settings')
      .update(updateData)
      .eq('id', existing.id)
      .select('*')
      .single()

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    const containerUrl = updated?.container_url
    const apiKey = process.env.REBUY_FLASK_API_KEY ?? ''

    // Container über neuen Schedule informieren (fire-and-forget)
    // Bei auto_scrape_enabled=false IMMER 'manual' senden (deaktiviert systemd-Timer),
    // unabhängig vom gespeicherten Schedule (Wochentage/Zeit bleiben aber in DB erhalten).
    const effectiveScheduleChange = result.data.schedule !== undefined || result.data.auto_scrape_enabled !== undefined
    if (effectiveScheduleChange && containerUrl) {
      const autoEnabled = updated?.auto_scrape_enabled !== false
      const scheduleToSend = autoEnabled ? (updated?.schedule ?? 'manual') : 'manual'
      const hmacSecret = process.env.REBUY_HMAC_SECRET
      const scheduleBody = JSON.stringify({ schedule: scheduleToSend })
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-Api-Key': apiKey,
      }
      if (hmacSecret) {
        const { createHmac } = await import('crypto')
        const sig = createHmac('sha256', hmacSecret).update(scheduleBody, 'utf8').digest('hex')
        headers['x-rebuy-signature'] = `sha256=${sig}`
      }
      fetch(`${containerUrl}/schedule`, { method: 'POST', headers, body: scheduleBody }).catch(() => {})
    }

    // Container über neuen Proxy informieren (fire-and-forget)
    if (result.data.backup_proxy_url !== undefined && containerUrl) {
      fetch(`${containerUrl}/proxy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Api-Key': apiKey },
        body: JSON.stringify({ backup_proxy_url: result.data.backup_proxy_url }),
      }).catch(() => {})
    }

    // Container über neuen Default-Modus informieren (fire-and-forget)
    // → Container nutzt diesen Modus bei systemd-/Cron-getriggerten Selbst-Läufen
    if (result.data.default_mode !== undefined && containerUrl) {
      fetch(`${containerUrl}/mode`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Api-Key': apiKey },
        body: JSON.stringify({ default_mode: result.data.default_mode }),
      }).catch(() => {})
    }

    return NextResponse.json(updated)
  } catch (err) {
    console.error('[PUT /api/rebuy/settings]', err)
    return NextResponse.json({ error: 'Interner Serverfehler' }, { status: 500 })
  }
}
