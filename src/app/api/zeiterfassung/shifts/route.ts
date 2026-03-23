import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase-server'

const createShiftSchema = z.object({
  employee_id: z.string().uuid(),
  shift_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  start_time: z.string().regex(/^\d{2}:\d{2}$/),
  end_time: z.string().regex(/^\d{2}:\d{2}$/),
  note: z.string().max(200).optional(),
})

const querySchema = z.object({
  year: z.coerce.number().int().min(2020).max(2100),
  month: z.coerce.number().int().min(1).max(12),
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

export async function GET(req: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) {
    return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 })
  }

  const searchParams = Object.fromEntries(req.nextUrl.searchParams)
  const parsed = querySchema.safeParse(searchParams)
  if (!parsed.success) {
    return NextResponse.json({ error: 'year und month erforderlich' }, { status: 400 })
  }

  const { year, month } = parsed.data
  const startDate = `${year}-${String(month).padStart(2, '0')}-01`
  const endDate = month === 12
    ? `${year + 1}-01-01`
    : `${year}-${String(month + 1).padStart(2, '0')}-01`

  const service = createSupabaseServiceClient()
  const { data, error: dbError } = await service
    .from('shift_plans')
    .select('id, employee_id, shift_date, start_time, end_time, note, employees(id, name, color)')
    .gte('shift_date', startDate)
    .lt('shift_date', endDate)
    .order('shift_date')

  if (dbError) {
    return NextResponse.json({ error: 'Datenbankfehler' }, { status: 500 })
  }

  return NextResponse.json({ shifts: data })
}

export async function POST(req: NextRequest) {
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

  const parsed = createShiftSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const service = createSupabaseServiceClient()
  const { data, error } = await service
    .from('shift_plans')
    .insert({ ...parsed.data, created_by: user.id })
    .select('id, employee_id, shift_date, start_time, end_time, note')
    .single()

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'Für diesen Mitarbeiter existiert bereits ein Schichteintrag an diesem Tag' }, { status: 409 })
    }
    return NextResponse.json({ error: 'Fehler beim Anlegen' }, { status: 500 })
  }

  return NextResponse.json({ shift: data }, { status: 201 })
}
