import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase-server'

const createMemberSchema = z.object({
  name:       z.string().min(1).max(100),
  position:   z.enum(['geschaeftsfuehrer', 'manager', 'mitarbeiter']),
  reports_to: z.string().uuid().nullable().optional(),
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

export async function GET() {
  const supabase = await createSupabaseServerClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 })

  const service = createSupabaseServiceClient()
  const { data, error: dbError } = await service
    .from('employees')
    .select('id, name, position, reports_to, reports_to_ids, birth_date, work_address, home_address, auth_user_id, color, is_active')
    .order('position', { ascending: false }) // geschaeftsfuehrer zuerst (alphabetisch g > m)
    .order('name')

  if (dbError) return NextResponse.json({ error: 'Datenbankfehler' }, { status: 500 })
  return NextResponse.json({ members: data })
}

export async function POST(req: NextRequest) {
  const ctx = await getAuthContext()
  if (!ctx) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 })
  if (ctx.role === 'staff') return NextResponse.json({ error: 'Keine Berechtigung' }, { status: 403 })

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Ungültiger JSON-Body' }, { status: 400 })
  }

  const parsed = createMemberSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const data = { ...parsed.data }

  if (ctx.role === 'manager') {
    if (data.position !== 'mitarbeiter') {
      return NextResponse.json({ error: 'Manager darf nur Mitarbeiter anlegen' }, { status: 403 })
    }
    if (!ctx.orgMemberId) {
      return NextResponse.json({ error: 'Manager-Profil nicht gefunden' }, { status: 403 })
    }
    data.reports_to = ctx.orgMemberId
  }

  const service = createSupabaseServiceClient()
  const { data: inserted, error: dbError } = await service
    .from('employees')
    .insert({
      name:       data.name,
      position:   data.position,
      reports_to: data.reports_to ?? null,
      // Neue Mitglieder ohne PIN sind standardmäßig inaktiv bis PIN gesetzt
      is_active:  data.position === 'mitarbeiter',
      color:      '#6b7280',
      target_hours_per_month: 160,
      weekly_schedule: { mon: 8, tue: 8, wed: 8, thu: 8, fri: 8, sat: 0, sun: 0 },
    })
    .select('id, name, position, reports_to, reports_to_ids, birth_date, work_address, home_address, auth_user_id, color, is_active')
    .single()

  if (dbError) return NextResponse.json({ error: 'Fehler beim Anlegen' }, { status: 500 })
  return NextResponse.json({ member: inserted }, { status: 201 })
}
