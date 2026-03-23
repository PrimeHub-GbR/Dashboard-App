import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase-server'
import { NextRequest, NextResponse } from 'next/server'

async function requireAdmin() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .single()

  return data?.role === 'admin' ? user : null
}

// GET /api/kiosk/devices — alle registrierten Geräte
export async function GET() {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createSupabaseServiceClient()
  const { data, error } = await service
    .from('kiosk_devices')
    .select('id, label, user_agent, registered_at, last_seen_at, is_active')
    .order('registered_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ devices: data })
}

// DELETE /api/kiosk/devices?id=<uuid> — Gerät widerrufen
export async function DELETE(request: NextRequest) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const id = request.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id fehlt' }, { status: 400 })

  const service = createSupabaseServiceClient()
  const { error } = await service
    .from('kiosk_devices')
    .update({ is_active: false })
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}

// PATCH /api/kiosk/devices?id=<uuid> — Label umbenennen
export async function PATCH(request: NextRequest) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const id = request.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id fehlt' }, { status: 400 })

  const { label } = await request.json()

  const service = createSupabaseServiceClient()
  const { error } = await service
    .from('kiosk_devices')
    .update({ label })
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
