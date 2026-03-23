import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createSupabaseServiceClient } from '@/lib/supabase-server'

const checkinSchema = z.object({
  employee_id: z.string().uuid(),
  pin: z.string().regex(/^\d{4,8}$/),
})

function verifyKioskToken(req: NextRequest): boolean {
  const expected = process.env.KIOSK_TOKEN
  if (!expected) return true // nicht konfiguriert = offen
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

  const parsed = checkinSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const { employee_id, pin } = parsed.data
  const pinHash = await hashPin(pin)

  const service = createSupabaseServiceClient()

  // Mitarbeiter + PIN prüfen
  const { data: employee, error: empError } = await service
    .from('employees')
    .select('id, name, color, pin, is_active')
    .eq('id', employee_id)
    .eq('is_active', true)
    .single()

  if (empError || !employee) {
    return NextResponse.json({ error: 'Mitarbeiter nicht gefunden' }, { status: 404 })
  }

  if (employee.pin !== pinHash) {
    return NextResponse.json({ error: 'Falsche PIN' }, { status: 401 })
  }

  // Prüfen ob bereits eingestempelt
  const { data: openEntry } = await service
    .from('time_entries')
    .select('id, checked_in_at')
    .eq('employee_id', employee_id)
    .is('checked_out_at', null)
    .single()

  if (openEntry) {
    return NextResponse.json(
      {
        error: 'Bereits eingestempelt',
        already_checked_in: true,
        entry_id: openEntry.id,
        checked_in_at: openEntry.checked_in_at,
      },
      { status: 409 }
    )
  }

  // Einstempeln
  const now = new Date().toISOString()
  const { data: entry, error: insertError } = await service
    .from('time_entries')
    .insert({
      employee_id,
      checked_in_at: now,
    })
    .select('id, checked_in_at')
    .single()

  if (insertError) {
    return NextResponse.json({ error: 'Einstempeln fehlgeschlagen' }, { status: 500 })
  }

  return NextResponse.json({
    type: 'checkin',
    entry_id: entry.id,
    employee_name: employee.name,
    employee_color: employee.color,
    checked_in_at: entry.checked_in_at,
  })
}
