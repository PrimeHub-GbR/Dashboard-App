import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createSupabaseServiceClient } from '@/lib/supabase-server'
import { verifyKioskToken, hashPin, PIN_REGEX } from '@/lib/zeiterfassung/kiosk-auth'
import { calculateBreakMinutes, calculateNetWorkMinutes } from '@/lib/zeiterfassung/arbzg'

const resolveSchema = z.object({
  employee_id: z.string().uuid(),
  pin: z.string().regex(PIN_REGEX),
  entry_id: z.string().uuid(),
  actual_checkout: z.string().datetime(),
  acknowledged: z.literal(true),
  start_new_shift: z.boolean().default(true),
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

  const parsed = resolveSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const { employee_id, pin, entry_id, actual_checkout, start_new_shift } = parsed.data
  const service = createSupabaseServiceClient()

  // Mitarbeiter + PIN verifizieren (Self-Service am Kiosk)
  const { data: employee, error: empError } = await service
    .from('employees')
    .select('id, name, color, pin, is_active')
    .eq('id', employee_id)
    .eq('is_active', true)
    .single()

  if (empError || !employee) {
    return NextResponse.json({ error: 'Mitarbeiter nicht gefunden' }, { status: 404 })
  }
  if (employee.pin === null || employee.pin !== (await hashPin(pin))) {
    return NextResponse.json({ error: 'Falsche PIN' }, { status: 401 })
  }

  // Offenen Eintrag laden (muss dem Mitarbeiter gehören und noch offen sein)
  const { data: entry } = await service
    .from('time_entries')
    .select('id, checked_in_at')
    .eq('id', entry_id)
    .eq('employee_id', employee_id)
    .is('checked_out_at', null)
    .maybeSingle()

  if (!entry) {
    return NextResponse.json({ error: 'Eintrag nicht mehr offen' }, { status: 409 })
  }

  // Endzeit validieren
  const checkedIn = new Date(entry.checked_in_at)
  const actual = new Date(actual_checkout)
  const now = new Date()

  if (actual.getTime() <= checkedIn.getTime()) {
    return NextResponse.json({ error: 'Endzeit muss nach dem Check-in liegen' }, { status: 400 })
  }
  if (actual.getTime() > now.getTime()) {
    return NextResponse.json({ error: 'Endzeit darf nicht in der Zukunft liegen' }, { status: 400 })
  }
  const grossMinutes = Math.floor((actual.getTime() - checkedIn.getTime()) / 60_000)
  if (grossMinutes > 24 * 60) {
    return NextResponse.json({ error: 'Endzeit unplausibel (über 24h)' }, { status: 400 })
  }

  // Stale-Eintrag schließen — needs_review markiert ihn für die Admin-Kontrolle.
  // corrected_by bleibt NULL = vom Mitarbeiter selbst nachgetragen.
  const breakMinutes = calculateBreakMinutes(grossMinutes)
  const { error: updateError } = await service
    .from('time_entries')
    .update({
      checked_out_at: actual.toISOString(),
      break_minutes: breakMinutes,
      needs_review: true,
      corrected_at: now.toISOString(),
      note: 'Nachgetragen am Kiosk: vergessene Abmeldung',
    })
    .eq('id', entry.id)

  if (updateError) {
    return NextResponse.json({ error: 'Korrektur fehlgeschlagen' }, { status: 500 })
  }

  // Reihenfolge wichtig (Unique-Index: ein offener Eintrag pro Mitarbeiter): erst schließen, dann neu.
  if (start_new_shift) {
    const { data: newEntry, error: insertError } = await service
      .from('time_entries')
      .insert({ employee_id, checked_in_at: now.toISOString(), auth_method: 'pin' })
      .select('id, checked_in_at')
      .single()

    if (!insertError && newEntry) {
      return NextResponse.json({
        type: 'checkin',
        entry_id: newEntry.id,
        employee_name: employee.name,
        employee_color: employee.color,
        checked_in_at: newEntry.checked_in_at,
      })
    }
    // Stale ist bereits sauber geschlossen — Insert-Fehler nicht als 500 melden,
    // sondern als Checkout-Erfolg mit Hinweis (Mitarbeiter kann erneut einstempeln).
  }

  const { netMinutes } = calculateNetWorkMinutes(checkedIn, actual)
  return NextResponse.json({
    type: 'checkout',
    entry_id: entry.id,
    employee_name: employee.name,
    employee_color: employee.color,
    checked_in_at: entry.checked_in_at,
    checked_out_at: actual.toISOString(),
    gross_minutes: grossMinutes,
    break_minutes: breakMinutes,
    net_minutes: netMinutes,
  })
}
