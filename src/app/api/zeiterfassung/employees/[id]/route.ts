import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase-server'

const updateEmployeeSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  pin: z.string().regex(/^\d{4,8}$/).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  target_hours_per_month: z.number().min(1).max(400).optional(),
  is_active: z.boolean().optional(),
  weekly_schedule: z.object({
    mon: z.number().min(0).max(24),
    tue: z.number().min(0).max(24),
    wed: z.number().min(0).max(24),
    thu: z.number().min(0).max(24),
    fri: z.number().min(0).max(24),
    sat: z.number().min(0).max(24),
    sun: z.number().min(0).max(24),
  }).optional(),
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

  const parsed = updateEmployeeSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const updates: Record<string, unknown> = { ...parsed.data }

  // PIN neu hashen wenn angegeben
  if (parsed.data.pin) {
    const encoder = new TextEncoder()
    const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(parsed.data.pin))
    const hashHex = Array.from(new Uint8Array(hashBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')
    updates.pin = hashHex
  }

  const service = createSupabaseServiceClient()
  const { data, error } = await service
    .from('employees')
    .update(updates)
    .eq('id', id)
    .select('id, name, color, is_active, target_hours_per_month')
    .single()

  if (error) {
    return NextResponse.json({ error: 'Aktualisierung fehlgeschlagen' }, { status: 500 })
  }

  return NextResponse.json({ employee: data })
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
  const { error } = await service.from('employees').delete().eq('id', id)

  if (error) {
    return NextResponse.json({ error: 'Löschen fehlgeschlagen' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
