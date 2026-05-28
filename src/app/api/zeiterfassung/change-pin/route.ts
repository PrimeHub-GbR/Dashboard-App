import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createSupabaseServiceClient } from '@/lib/supabase-server'
import { verifyKioskToken, hashPin, PIN_REGEX } from '@/lib/zeiterfassung/kiosk-auth'

const changePinSchema = z.object({
  employee_id: z.string().uuid(),
  old_pin: z.string().regex(PIN_REGEX, 'PIN muss 4–8 Ziffern sein'),
  new_pin: z.string().regex(PIN_REGEX, 'PIN muss 4–8 Ziffern sein'),
})

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

  const parsed = changePinSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const { employee_id, old_pin, new_pin } = parsed.data

  if (old_pin === new_pin) {
    return NextResponse.json({ error: 'Neue PIN muss sich von der alten unterscheiden' }, { status: 400 })
  }

  const service = createSupabaseServiceClient()

  const { data: employee, error: empError } = await service
    .from('employees')
    .select('id, pin, is_active')
    .eq('id', employee_id)
    .eq('is_active', true)
    .single()

  if (empError || !employee) {
    return NextResponse.json({ error: 'Mitarbeiter nicht gefunden' }, { status: 404 })
  }

  if (employee.pin === null) {
    return NextResponse.json({ error: 'Noch keine PIN gesetzt — bitte zuerst eine PIN vergeben' }, { status: 409 })
  }

  const oldHash = await hashPin(old_pin)
  if (oldHash !== employee.pin) {
    return NextResponse.json({ error: 'Alte PIN ist falsch' }, { status: 401 })
  }

  const newHash = await hashPin(new_pin)
  const { error: updateError } = await service
    .from('employees')
    .update({ pin: newHash })
    .eq('id', employee_id)

  if (updateError) {
    return NextResponse.json({ error: 'PIN konnte nicht gespeichert werden' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
