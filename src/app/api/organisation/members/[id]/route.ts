import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase-server'

const weeklyScheduleSchema = z.object({
  mon: z.number().min(0).max(24),
  tue: z.number().min(0).max(24),
  wed: z.number().min(0).max(24),
  thu: z.number().min(0).max(24),
  fri: z.number().min(0).max(24),
  sat: z.number().min(0).max(24),
  sun: z.number().min(0).max(24),
})

const updateMemberSchema = z.object({
  name:                   z.string().min(1).max(100).optional(),
  position:               z.enum(['geschaeftsfuehrer', 'manager', 'mitarbeiter']).optional(),
  reports_to:             z.string().uuid().nullable().optional(),
  pin:                    z.string().regex(/^\d{4,8}$/).optional(),
  color:                  z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  target_hours_per_month: z.number().min(0).max(400).optional(),
  weekly_schedule:        weeklyScheduleSchema.optional(),
  is_active:              z.boolean().optional(),
  birth_date:             z.string().nullable().optional(),
  work_address:           z.string().nullable().optional(),
  home_address:           z.string().nullable().optional(),
  auth_user_id:           z.string().uuid().nullable().optional(),
})

type UserRole = 'admin' | 'manager' | 'staff'

async function getAuthContext(): Promise<{
  userId: string
  role: UserRole
  orgMemberId: string | null
} | null> {
  const supabase = await createSupabaseServerClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return null

  const { data: roleData } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .single()

  if (!roleData) return null
  const role = roleData.role as UserRole

  let orgMemberId: string | null = null
  if (role === 'manager' || role === 'admin') {
    const service = createSupabaseServiceClient()
    const { data } = await service
      .from('employees')
      .select('id')
      .eq('auth_user_id', user.id)
      .single()
    orgMemberId = data?.id ?? null
  }

  return { userId: user.id, role, orgMemberId }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await getAuthContext()
  if (!ctx) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 })
  if (ctx.role === 'staff') return NextResponse.json({ error: 'Keine Berechtigung' }, { status: 403 })

  const { id } = await params
  const service = createSupabaseServiceClient()

  const { data: target, error: fetchError } = await service
    .from('employees')
    .select('id, position, reports_to')
    .eq('id', id)
    .single()

  if (fetchError || !target) return NextResponse.json({ error: 'Nicht gefunden' }, { status: 404 })

  if (ctx.role === 'manager') {
    if (target.reports_to !== ctx.orgMemberId) {
      return NextResponse.json({ error: 'Keine Berechtigung für diesen Eintrag' }, { status: 403 })
    }
  }

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Ungültiger JSON-Body' }, { status: 400 })
  }

  const parsed = updateMemberSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  // Manager darf position/reports_to nicht ändern
  if (ctx.role === 'manager') {
    if (parsed.data.position || parsed.data.reports_to !== undefined) {
      return NextResponse.json({ error: 'Keine Berechtigung für diese Felder' }, { status: 403 })
    }
  }

  // PIN hashen wenn vorhanden
  const updateData: Record<string, unknown> = { ...parsed.data, updated_at: new Date().toISOString() }
  if (parsed.data.pin) {
    const encoder = new TextEncoder()
    const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(parsed.data.pin))
    updateData.pin = Array.from(new Uint8Array(hashBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')
  } else {
    delete updateData.pin
  }

  // reports_to_ids synchron halten
  if ('reports_to' in parsed.data) {
    updateData.reports_to_ids = parsed.data.reports_to ? [parsed.data.reports_to] : []
  }

  const { data: updated, error: updateError } = await service
    .from('employees')
    .update(updateData)
    .eq('id', id)
    .select('id, name, position, reports_to, reports_to_ids, birth_date, work_address, home_address, auth_user_id, color, is_active, target_hours_per_month, weekly_schedule')
    .single()

  if (updateError) return NextResponse.json({ error: updateError.message ?? 'Fehler beim Aktualisieren' }, { status: 500 })
  return NextResponse.json({ member: updated })
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  void req
  const ctx = await getAuthContext()
  if (!ctx) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 })
  if (ctx.role === 'staff') return NextResponse.json({ error: 'Keine Berechtigung' }, { status: 403 })

  const { id } = await params
  const service = createSupabaseServiceClient()

  const { data: target, error: fetchError } = await service
    .from('employees')
    .select('id, position, reports_to')
    .eq('id', id)
    .single()

  if (fetchError || !target) return NextResponse.json({ error: 'Nicht gefunden' }, { status: 404 })

  if (ctx.role === 'manager') {
    if (target.position !== 'mitarbeiter' || target.reports_to !== ctx.orgMemberId) {
      return NextResponse.json({ error: 'Keine Berechtigung für diesen Eintrag' }, { status: 403 })
    }
  }

  const { error: deleteError } = await service
    .from('employees')
    .delete()
    .eq('id', id)

  if (deleteError) return NextResponse.json({ error: 'Fehler beim Löschen' }, { status: 500 })
  return NextResponse.json({ success: true })
}
