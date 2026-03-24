import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createSupabaseServiceClient } from '@/lib/supabase-server'

const setPinSchema = z.object({
  employee_id: z.string().uuid(),
  pin: z.string().regex(/^\d{4,8}$/, 'PIN muss 4–8 Ziffern sein'),
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

async function hashPin(pin: string): Promise<string> {
  const encoder = new TextEncoder()
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(pin))
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

export async function POST(req: NextRequest) {
  if (!verifyKioskToken(req)) {
    return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Ungültiger JSON-Body' }, { status: 400 })
  }

  const parsed = setPinSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const { employee_id, pin } = parsed.data
  const service = createSupabaseServiceClient()

  // Mitarbeiter laden und prüfen dass pin noch nicht gesetzt ist
  const { data: employee, error: empError } = await service
    .from('employees')
    .select('id, pin, is_active')
    .eq('id', employee_id)
    .eq('is_active', true)
    .single()

  if (empError || !employee) {
    return NextResponse.json({ error: 'Mitarbeiter nicht gefunden' }, { status: 404 })
  }

  if (employee.pin !== null) {
    return NextResponse.json({ error: 'PIN bereits gesetzt — zum Ändern Admin kontaktieren' }, { status: 409 })
  }

  const pinHash = await hashPin(pin)

  const { error: updateError } = await service
    .from('employees')
    .update({ pin: pinHash })
    .eq('id', employee_id)

  if (updateError) {
    return NextResponse.json({ error: 'PIN konnte nicht gespeichert werden' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
