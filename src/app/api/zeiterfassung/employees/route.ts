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
}).default({ mon: 8, tue: 8, wed: 8, thu: 8, fri: 8, sat: 0, sun: 0 })

const createEmployeeSchema = z.object({
  name: z.string().min(1).max(100),
  pin: z.string().regex(/^\d{4,8}$/, 'PIN muss 4–8 Ziffern sein'),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#22c55e'),
  target_hours_per_month: z.number().min(1).max(400).default(160),
  weekly_schedule: weeklyScheduleSchema,
})

async function requireAdmin(req: NextRequest) {
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
    .from('employees')
    .select('id, name, color, is_active, target_hours_per_month, weekly_schedule, created_at')
    .neq('position', 'geschaeftsfuehrer') // GF erscheinen nicht in der Zeiterfassung
    .order('name')

  if (dbError) {
    return NextResponse.json({ error: 'Datenbankfehler' }, { status: 500 })
  }

  return NextResponse.json({ employees: data })
}

export async function POST(req: NextRequest) {
  const user = await requireAdmin(req)
  if (!user) {
    return NextResponse.json({ error: 'Nur Admins können Mitarbeiter anlegen' }, { status: 403 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Ungültiger JSON-Body' }, { status: 400 })
  }

  const parsed = createEmployeeSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const { name, pin, color, target_hours_per_month, weekly_schedule } = parsed.data

  // PIN als einfacher Hash (SHA-256 via Web Crypto)
  const encoder = new TextEncoder()
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(pin))
  const hashHex = Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')

  const service = createSupabaseServiceClient()
  const { data, error } = await service
    .from('employees')
    .insert({
      name,
      pin: hashHex,
      color,
      target_hours_per_month,
      weekly_schedule,
      created_by: user.id,
    })
    .select('id, name, color, is_active, target_hours_per_month, weekly_schedule, created_at')
    .single()

  if (error) {
    return NextResponse.json({ error: 'Fehler beim Anlegen' }, { status: 500 })
  }

  return NextResponse.json({ employee: data }, { status: 201 })
}
