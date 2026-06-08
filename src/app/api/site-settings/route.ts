import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

const patchSchema = z.object({
  landing_enabled: z.boolean(),
})

// GET /api/site-settings — aktuellen Zustand lesen (Admin/Manager)
export async function GET() {
  const supabase = await createSupabaseServerClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 })

  const service = createSupabaseServiceClient()
  const { data } = await service
    .from('site_settings')
    .select('value')
    .eq('key', 'landing_enabled')
    .maybeSingle()

  return NextResponse.json({ landing_enabled: data?.value === true })
}

// POST /api/site-settings — Website an/aus schalten (nur Admin)
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
  const { error: upsertError } = await service
    .from('site_settings')
    .upsert(
      { key: 'landing_enabled', value: parsed.data.landing_enabled, updated_by: user.id, updated_at: new Date().toISOString() },
      { onConflict: 'key' },
    )

  if (upsertError) return NextResponse.json({ error: 'Fehler beim Speichern' }, { status: 500 })
  return NextResponse.json({ landing_enabled: parsed.data.landing_enabled })
}
