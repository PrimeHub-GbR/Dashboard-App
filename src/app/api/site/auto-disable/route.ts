import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

// GET /api/site/auto-disable
// Vercel-Cron: deaktiviert die öffentliche Website, sobald die Frist
// (auto_disable_at) abgelaufen ist. Sicherheitsnetz, falls der Admin vergisst,
// manuell auszuschalten. Die Middleware sperrt die Seite bereits ab Fristablauf;
// dieser Cron synchronisiert zusätzlich den Dashboard-Status.
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const service = createSupabaseServiceClient()
  const { data } = await service
    .from('site_settings')
    .select('key, value')
    .in('key', ['landing_enabled', 'auto_disable_at'])

  const map = Object.fromEntries((data ?? []).map((r) => [r.key, r.value]))
  const enabled = map.landing_enabled === true
  const at = typeof map.auto_disable_at === 'string' ? map.auto_disable_at : null

  if (enabled && at && new Date(at).getTime() <= Date.now()) {
    const now = new Date().toISOString()
    await service.from('site_settings').upsert(
      { key: 'landing_enabled', value: false, updated_at: now },
      { onConflict: 'key' },
    )
    await service.from('site_settings').delete().eq('key', 'auto_disable_at')
    console.log('Auto-disable: Website wurde nach Fristablauf deaktiviert.')
    return NextResponse.json({ ok: true, disabled: true })
  }

  return NextResponse.json({ ok: true, disabled: false })
}
