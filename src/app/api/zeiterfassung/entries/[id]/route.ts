import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase-server'

const correctEntrySchema = z.object({
  checked_in_at: z.string().datetime().optional(),
  checked_out_at: z.string().datetime().nullable().optional(),
  break_minutes: z.number().int().min(0).optional(),
  note: z.string().min(1, 'Notiz ist Pflicht').max(500),
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

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireAdmin()
  if (!user) {
    return NextResponse.json({ error: 'Nur Admins' }, { status: 403 })
  }

  const { id } = await params
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Ungültiger JSON-Body' }, { status: 400 })
  }

  const parsed = correctEntrySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const service = createSupabaseServiceClient()
  const { data, error } = await service
    .from('time_entries')
    .update({
      ...parsed.data,
      corrected_by: user.id,
      corrected_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select('id, employee_id, checked_in_at, checked_out_at, break_minutes, note, corrected_at')
    .single()

  if (error) {
    return NextResponse.json({ error: 'Korrektur fehlgeschlagen' }, { status: 500 })
  }

  return NextResponse.json({ entry: data })
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireAdmin()
  if (!user) {
    return NextResponse.json({ error: 'Nur Admins' }, { status: 403 })
  }

  const { id } = await params
  const service = createSupabaseServiceClient()
  const { error } = await service
    .from('time_entries')
    .delete()
    .eq('id', id)

  if (error) {
    return NextResponse.json({ error: 'Löschen fehlgeschlagen' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
