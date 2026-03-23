import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createSupabaseServiceClient } from '@/lib/supabase-server'
import { calculateNetWorkMinutes } from '@/lib/zeiterfassung/arbzg'
import { triggerOvertimeNotification } from '@/lib/zeiterfassung/overtime-notify'
import { formatMonthLabel } from '@/lib/zeiterfassung/timezone'

const toggleSchema = z.object({
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

  const parsed = toggleSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const { employee_id, pin } = parsed.data
  const pinHash = await hashPin(pin)
  const service = createSupabaseServiceClient()

  // Mitarbeiter + PIN prüfen
  const { data: employee, error: empError } = await service
    .from('employees')
    .select('id, name, color, pin, is_active, target_hours_per_month')
    .eq('id', employee_id)
    .eq('is_active', true)
    .single()

  if (empError || !employee) {
    return NextResponse.json({ error: 'Mitarbeiter nicht gefunden' }, { status: 404 })
  }

  if (employee.pin !== pinHash) {
    return NextResponse.json({ error: 'Falsche PIN' }, { status: 401 })
  }

  // Offenen Eintrag prüfen → entscheidet ob ein- oder ausstempeln
  const { data: openEntry } = await service
    .from('time_entries')
    .select('id, checked_in_at')
    .eq('employee_id', employee_id)
    .is('checked_out_at', null)
    .maybeSingle()

  if (openEntry) {
    // === AUSSTEMPELN ===
    const now = new Date()
    const checkedInAt = new Date(openEntry.checked_in_at)
    const { grossMinutes, breakMinutes, netMinutes } = calculateNetWorkMinutes(checkedInAt, now)

    const { error: updateError } = await service
      .from('time_entries')
      .update({
        checked_out_at: now.toISOString(),
        break_minutes: breakMinutes,
      })
      .eq('id', openEntry.id)

    if (updateError) {
      return NextResponse.json({ error: 'Ausstempeln fehlgeschlagen' }, { status: 500 })
    }

    // Überstunden-Check async
    checkOvertimeAndNotify(
      service,
      employee_id,
      employee.name,
      employee.target_hours_per_month
    ).catch(() => {})

    return NextResponse.json({
      type: 'checkout',
      entry_id: openEntry.id,
      employee_name: employee.name,
      employee_color: employee.color,
      checked_in_at: openEntry.checked_in_at,
      checked_out_at: now.toISOString(),
      gross_minutes: grossMinutes,
      break_minutes: breakMinutes,
      net_minutes: netMinutes,
    })
  } else {
    // === EINSTEMPELN ===
    const now = new Date().toISOString()
    const { data: entry, error: insertError } = await service
      .from('time_entries')
      .insert({ employee_id, checked_in_at: now })
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
}

async function checkOvertimeAndNotify(
  service: ReturnType<typeof createSupabaseServiceClient>,
  employeeId: string,
  employeeName: string,
  targetHoursPerMonth: number
) {
  const { data: settings } = await service
    .from('time_tracking_settings')
    .select('overtime_threshold_hours, notification_enabled, n8n_webhook_url')
    .single()

  if (!settings?.notification_enabled || !settings.n8n_webhook_url) return

  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() + 1

  const { data: monthData } = await service.rpc('get_employee_month_hours', {
    p_employee_id: employeeId,
    p_year: year,
    p_month: month,
  })

  if (!monthData || monthData.length === 0) return

  const row = monthData[0]
  const netMinutes = (row.total_work_minutes ?? 0) - (row.total_break_minutes ?? 0)
  const actualHours = netMinutes / 60
  const overtimeHours = actualHours - targetHoursPerMonth

  if (overtimeHours >= settings.overtime_threshold_hours) {
    await triggerOvertimeNotification({
      employee_name: employeeName,
      month: formatMonthLabel(year, month),
      actual_hours: Math.round(actualHours * 100) / 100,
      target_hours: targetHoursPerMonth,
      overtime_hours: Math.round(overtimeHours * 100) / 100,
    })
  }
}
