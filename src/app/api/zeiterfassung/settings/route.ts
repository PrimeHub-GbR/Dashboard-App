import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase-server'

const updateSettingsSchema = z.object({
  overtime_threshold_hours: z.number().min(0).max(500).optional(),
  break_trigger_hours: z.number().min(0).max(12).optional(),
  n8n_webhook_url: z.string().url().nullable().optional(),
  notification_enabled: z.boolean().optional(),
  kiosk_pin_length: z.number().int().min(4).max(8).optional(),
})

async function requireAdmin() {
  const supabase = await createSupabaseServerClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return null
  const { data: roleData } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .single()
  if (roleData?.role !== 'admin') return null
  return user
}

export async function GET() {
  const supabase = await createSupabaseServerClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) {
    return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 })
  }

  const service = createSupabaseServiceClient()
  const { data, error: dbError } = await service
    .from('time_tracking_settings')
    .select('*')
    .single()

  if (dbError) {
    return NextResponse.json({ error: 'Datenbankfehler' }, { status: 500 })
  }

  return NextResponse.json({ settings: data })
}

export async function PATCH(req: NextRequest) {
  const user = await requireAdmin()
  if (!user) {
    return NextResponse.json({ error: 'Nur Admins' }, { status: 403 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Ungültiger JSON-Body' }, { status: 400 })
  }

  const parsed = updateSettingsSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const service = createSupabaseServiceClient()
  const { data, error } = await service
    .from('time_tracking_settings')
    .update(parsed.data)
    .not('id', 'is', null)  // Singleton: alle Zeilen (nur eine)
    .select('*')
    .single()

  if (error) {
    return NextResponse.json({ error: 'Speichern fehlgeschlagen' }, { status: 500 })
  }

  return NextResponse.json({ settings: data })
}
