import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createSupabaseServiceClient } from '@/lib/supabase-server'
import { calculateNetWorkMinutes } from '@/lib/zeiterfassung/arbzg'
import { triggerOvertimeNotification } from '@/lib/zeiterfassung/overtime-notify'
import { formatMonthLabel } from '@/lib/zeiterfassung/timezone'
import { getMaxShiftHours, isStaleOpenEntry } from '@/lib/zeiterfassung/shift-limit'

const toggleSchema = z.object({
  employee_id: z.string().uuid(),
  pin: z.string().regex(/^\d{4,8}$/).optional(),
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
  const service = createSupabaseServiceClient()

  // Mitarbeiter laden
  const { data: employee, error: empError } = await service
    .from('employees')
    .select('id, name, color, pin, is_active, target_hours_per_month')
    .eq('id', employee_id)
    .eq('is_active', true)
    .single()

  if (empError || !employee) {
    return NextResponse.json({ error: 'Mitarbeiter nicht gefunden' }, { status: 404 })
  }

  // PIN noch nicht gesetzt → Mitarbeiter muss erst eine PIN vergeben
  if (employee.pin === null) {
    return NextResponse.json({ error: 'PIN_NOT_SET' }, { status: 428 })
  }

  // PIN-Validierung
  if (!pin) {
    return NextResponse.json({ error: 'PIN fehlt' }, { status: 400 })
  }
  const pinHash = await hashPin(pin)
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
    // === VERGESSENE ABMELDUNG PRÜFEN ===
    // Offene Buchung von einem früheren Tag oder älter als die Schwelle → nicht blind auf
    // jetzt ausstempeln. Stattdessen Korrektur-Flow am Kiosk anstoßen (keine Mutation hier).
    const maxShiftHours = await getMaxShiftHours(service)
    if (isStaleOpenEntry(openEntry.checked_in_at, maxShiftHours)) {
      return NextResponse.json({
        type: 'forgot_checkout',
        open_entry: { id: openEntry.id, checked_in_at: openEntry.checked_in_at },
        max_hours: maxShiftHours,
        employee_name: employee.name,
        employee_color: employee.color,
      })
    }

    // === AUSSTEMPELN ===
    const now = new Date()
    const checkedInAt = new Date(openEntry.checked_in_at)
    const { grossMinutes, breakMinutes, netMinutes } = calculateNetWorkMinutes(checkedInAt, now)

    const { error: updateError } = await service
      .from('time_entries')
      .update({
        checked_out_at: now.toISOString(),
        break_minutes: breakMinutes,
        auth_method: 'pin',
      })
      .eq('id', openEntry.id)

    if (updateError) {
      return NextResponse.json({ error: 'Ausstempeln fehlgeschlagen' }, { status: 500 })
    }

    checkOvertimeAndNotify(
      service,
      employee_id,
      employee.name,
      employee.target_hours_per_month
    ).catch(() => {})

    // "Stunden voll": prüfen ob das Monats-Soll mit dieser Buchung (erstmalig)
    // erreicht wurde. Synchron, damit der Kiosk die Glückwunsch-Facts erhält.
    const monthCompletion = await checkMonthCompletionAndNotify(service, employee_id).catch(() => null)

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
      month_completion: monthCompletion,
    })
  } else {
    // === EINSTEMPELN ===
    const now = new Date().toISOString()
    const { data: entry, error: insertError } = await service
      .from('time_entries')
      .insert({ employee_id, checked_in_at: now, auth_method: 'pin' })
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

interface MonthCompletionFacts {
  ist_minutes: number
  soll_minutes: number
  reached: boolean
  worked_days: number
  avg_minutes_per_day: number
  break_minutes: number
  vacation_days: number
  sick_days: number
  unpaid_days: number
  completed_tasks: number
}

/**
 * Prüft, ob der Mitarbeiter mit dieser Buchung sein Monats-Soll (erstmalig)
 * erreicht hat. Wenn ja und für den Monat noch kein Event existiert: Event
 * idempotent anlegen + Push auslösen. Gibt die Facts an den Kiosk zurück, sobald
 * das Soll erreicht ist (für die Glückwunsch-Anzeige) — unabhängig davon, ob das
 * Event neu war (z.B. bei mehrfachem Aus-/Einstempeln am selben Tag).
 */
async function checkMonthCompletionAndNotify(
  service: ReturnType<typeof createSupabaseServiceClient>,
  employeeId: string
): Promise<MonthCompletionFacts | null> {
  const { periodStart, periodEnd, periodMonth } = berlinMonthBounds()

  const { data: factsRows, error: factsErr } = await service.rpc('get_month_completion_facts', {
    p_employee_id: employeeId,
    p_period_start: periodStart,
    p_period_end: periodEnd,
  })
  if (factsErr || !factsRows || factsRows.length === 0) return null

  const facts = factsRows[0] as MonthCompletionFacts
  if (!facts.reached) return null

  // Event idempotent anlegen — TRUE nur beim erstmaligen Erreichen pro Monat.
  const { data: isNew } = await service.rpc('record_month_completion', {
    p_employee_id: employeeId,
    p_period_month: periodMonth,
  })

  // Push nur beim erstmaligen Erreichen auslösen (fire-and-forget).
  if (isNew === true) {
    triggerMonthCompletionPush(employeeId).catch(() => {})
  }

  // Facts immer zurückgeben, solange das Soll erreicht ist → Kiosk-Glückwunsch.
  return facts
}

/** Erster und letzter Tag + Monatsanfang des aktuellen Berlin-Monats (YYYY-MM-DD). */
function berlinMonthBounds(): { periodStart: string; periodEnd: string; periodMonth: string } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Berlin',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())
  const get = (t: string) => parts.find(p => p.type === t)!.value
  const year = Number(get('year'))
  const month = Number(get('month'))
  const periodStart = `${year}-${String(month).padStart(2, '0')}-01`
  // Letzter Tag des Monats: Tag 0 des Folgemonats.
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const periodEnd = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
  return { periodStart, periodEnd, periodMonth: periodStart }
}

/** Push via Edge Function notify-month-completion (Service-Role-Bearer). */
async function triggerMonthCompletionPush(employeeId: string): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) return

  await fetch(`${url}/functions/v1/notify-month-completion`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${serviceKey}`,
    },
    body: JSON.stringify({
      employee_id: employeeId,
      title: '🎉 Stunden erreicht',
      body: 'Du hast deine Stunden für diesen Monat erreicht. Stark!',
    }),
  })
}
