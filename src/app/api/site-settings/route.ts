import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

const DEFAULT_DAYS = 5
const MIN_DAYS = 1
const MAX_DAYS = 365

type Settings = {
  landing_enabled: boolean
  auto_disable_enabled: boolean
  auto_disable_days: number
  auto_disable_at: string | null
}

type Service = ReturnType<typeof createSupabaseServiceClient>

async function loadSettings(service: Service): Promise<Settings> {
  const { data } = await service.from('site_settings').select('key, value')
  const map = Object.fromEntries((data ?? []).map((r) => [r.key, r.value]))
  return {
    landing_enabled: map.landing_enabled === true,
    auto_disable_enabled: map.auto_disable_enabled !== false, // fehlt => Standard an
    auto_disable_days: typeof map.auto_disable_days === 'number' ? map.auto_disable_days : DEFAULT_DAYS,
    auto_disable_at: typeof map.auto_disable_at === 'string' ? map.auto_disable_at : null,
  }
}

async function setKey(service: Service, key: string, value: unknown, userId: string) {
  await service.from('site_settings').upsert(
    { key, value, updated_by: userId, updated_at: new Date().toISOString() },
    { onConflict: 'key' },
  )
}

const patchSchema = z.object({
  landing_enabled: z.boolean().optional(),
  auto_disable_enabled: z.boolean().optional(),
  auto_disable_days: z.number().int().min(MIN_DAYS).max(MAX_DAYS).optional(),
  extend: z.boolean().optional(),
})

// GET /api/site-settings — Zustand lesen (eingeloggte Nutzer)
export async function GET() {
  const supabase = await createSupabaseServerClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 })

  const settings = await loadSettings(createSupabaseServiceClient())
  return NextResponse.json(settings)
}

// POST /api/site-settings — Website + Auto-Deaktivierung steuern (nur Admin)
export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 })

  const { data: roleData } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .single()

  if (roleData?.role !== 'admin') {
    return NextResponse.json({ error: 'Nur Admins dürfen die Website schalten' }, { status: 403 })
  }

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Ungültiger JSON-Body' }, { status: 400 })
  }
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const service = createSupabaseServiceClient()
  const current = await loadSettings(service)
  const p = parsed.data

  const finalLanding = p.landing_enabled ?? current.landing_enabled
  const finalAutoEnabled = p.auto_disable_enabled ?? current.auto_disable_enabled
  const finalDays = p.auto_disable_days ?? current.auto_disable_days

  // Frist neu setzen, wenn: (re)aktiviert, verlängert, Automatik gerade eingeschaltet oder Tage geändert
  const shouldResetDeadline =
    p.extend === true ||
    p.landing_enabled === true ||
    (p.auto_disable_enabled === true && !current.auto_disable_enabled) ||
    p.auto_disable_days !== undefined

  let newDeadline: string | null
  if (!finalLanding || !finalAutoEnabled) {
    newDeadline = null
  } else if (shouldResetDeadline) {
    newDeadline = new Date(Date.now() + finalDays * 24 * 60 * 60 * 1000).toISOString()
  } else {
    newDeadline = current.auto_disable_at
  }

  // Schreiben
  if (p.auto_disable_days !== undefined) await setKey(service, 'auto_disable_days', finalDays, user.id)
  if (p.auto_disable_enabled !== undefined) await setKey(service, 'auto_disable_enabled', finalAutoEnabled, user.id)
  if (p.landing_enabled !== undefined) await setKey(service, 'landing_enabled', finalLanding, user.id)

  if (newDeadline === null) {
    if (current.auto_disable_at !== null) await service.from('site_settings').delete().eq('key', 'auto_disable_at')
  } else if (newDeadline !== current.auto_disable_at) {
    await setKey(service, 'auto_disable_at', newDeadline, user.id)
  }

  return NextResponse.json(await loadSettings(service))
}
