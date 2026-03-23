import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase-server'

const updateMemberSchema = z.object({
  name:         z.string().min(1).max(100).optional(),
  birth_date:   z.string().nullable().optional(),
  work_address: z.string().nullable().optional(),
  home_address: z.string().nullable().optional(),
  auth_user_id: z.string().uuid().nullable().optional(),
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

  const { data: updated, error: updateError } = await service
    .from('employees')
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('id, name, position, reports_to, reports_to_ids, birth_date, work_address, home_address, auth_user_id, color, is_active')
    .single()

  if (updateError) return NextResponse.json({ error: 'Fehler beim Aktualisieren' }, { status: 500 })
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
