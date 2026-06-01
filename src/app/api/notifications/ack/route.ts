import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase-server'

type UserRole = 'admin' | 'manager' | 'staff'

const bodySchema = z.object({
  key: z.string().min(3).max(200),
})

/**
 * Bestätigt eine Meldung ("zur Kenntnis genommen"). Routet je nach Schlüssel-
 * Präfix an die richtige Persistenz:
 *   profile:<id>   → employee_profile_changes.acknowledged_at
 *   ztreview:<id>  → time_entries.needs_review = false (= Kontrolle erledigt)
 *   ztstale/overtime/… → generische notification_acks-Tabelle
 */
export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) {
    return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 })
  }
  const { data: roleData } = await supabase
    .from('user_roles').select('role').eq('user_id', user.id).single()
  const role = roleData?.role as UserRole | undefined
  if (role !== 'admin' && role !== 'manager') {
    return NextResponse.json({ error: 'Keine Berechtigung' }, { status: 403 })
  }

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return NextResponse.json({ error: 'Ungültiger JSON-Body' }, { status: 400 })
  }
  const parsed = bodySchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: 'key erforderlich' }, { status: 400 })
  }

  const { key } = parsed.data
  const service = createSupabaseServiceClient()

  if (key.startsWith('profile:')) {
    const id = key.slice('profile:'.length)
    const { error: e } = await service
      .from('employee_profile_changes')
      .update({ acknowledged_at: new Date().toISOString(), acknowledged_by: user.id })
      .eq('id', id)
    if (e) return NextResponse.json({ error: 'Update fehlgeschlagen' }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  if (key.startsWith('ztreview:')) {
    const id = key.slice('ztreview:'.length)
    const { error: e } = await service
      .from('time_entries')
      .update({ needs_review: false })
      .eq('id', id)
    if (e) return NextResponse.json({ error: 'Update fehlgeschlagen' }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  // Generisch (ztstale, overtime, künftige Quellen)
  const { error: e } = await service
    .from('notification_acks')
    .upsert(
      { notif_key: key, acknowledged_at: new Date().toISOString(), acknowledged_by: user.id },
      { onConflict: 'notif_key' }
    )
  if (e) return NextResponse.json({ error: 'Update fehlgeschlagen' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
