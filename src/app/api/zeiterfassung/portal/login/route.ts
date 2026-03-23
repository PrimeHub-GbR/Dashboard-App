import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createSupabaseServiceClient } from '@/lib/supabase-server'

const schema = z.object({
  employee_id: z.string().uuid(),
  pin: z.string().regex(/^\d{4,8}$/),
})

function verifyKioskToken(req: NextRequest): boolean {
  const expected = process.env.KIOSK_TOKEN
  if (!expected) return true
  const token = req.headers.get('x-kiosk-token')
  if (!token) return false
  if (token.length !== expected.length) return false
  let diff = 0
  for (let i = 0; i < token.length; i++) {
    diff |= token.charCodeAt(i) ^ expected.charCodeAt(i)
  }
  return diff === 0
}

export async function POST(req: NextRequest) {
  if (!verifyKioskToken(req)) {
    return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 })
  }

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Ungültiger Body' }, { status: 400 })
  }

  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const { employee_id, pin } = parsed.data

  // PIN hashen
  const encoder = new TextEncoder()
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(pin))
  const pinHash = Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0')).join('')

  const service = createSupabaseServiceClient()

  const { data: employee, error } = await service
    .from('employees')
    .select('id, name, color, pin, is_active, target_hours_per_month, weekly_schedule')
    .eq('id', employee_id)
    .eq('is_active', true)
    .single()

  if (error || !employee) {
    return NextResponse.json({ error: 'Mitarbeiter nicht gefunden' }, { status: 404 })
  }

  if (employee.pin !== pinHash) {
    return NextResponse.json({ error: 'Falsche PIN' }, { status: 401 })
  }

  return NextResponse.json({
    employee: {
      id: employee.id,
      name: employee.name,
      color: employee.color,
      target_hours_per_month: employee.target_hours_per_month,
      weekly_schedule: employee.weekly_schedule,
    },
  })
}
