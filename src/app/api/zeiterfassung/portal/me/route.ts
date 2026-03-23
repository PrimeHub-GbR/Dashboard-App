import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createSupabaseServiceClient } from '@/lib/supabase-server'

const querySchema = z.object({
  employee_id: z.string().uuid(),
  year: z.coerce.number().int().min(2020).max(2100),
  month: z.coerce.number().int().min(1).max(12),
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

export async function GET(req: NextRequest) {
  if (!verifyKioskToken(req)) {
    return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 })
  }

  const params = Object.fromEntries(req.nextUrl.searchParams)
  const parsed = querySchema.safeParse(params)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const { employee_id, year, month } = parsed.data
  const service = createSupabaseServiceClient()

  // 1. Mitarbeiter-Daten
  const { data: employee, error: empError } = await service
    .from('employees')
    .select('id, name, color, target_hours_per_month, weekly_schedule')
    .eq('id', employee_id)
    .eq('is_active', true)
    .single()

  if (empError || !employee) {
    return NextResponse.json({ error: 'Mitarbeiter nicht gefunden' }, { status: 404 })
  }

  // 2. Monats-Zeitbereich (UTC)
  const startUtc = new Date(year, month - 1, 1).toISOString()
  const endUtc = new Date(year, month, 1).toISOString()

  // 3. Monats-Stunden via RPC
  const { data: monthStats } = await service.rpc('get_employee_month_hours', {
    p_employee_id: employee_id,
    p_year: year,
    p_month: month,
  })

  // 4. Tägliche Stunden für Chart
  const { data: dailyAll } = await service.rpc('get_daily_hours_per_employee', {
    p_year: year,
    p_month: month,
  })
  const daily = (dailyAll ?? []).filter((d: { employee_id: string }) => d.employee_id === employee_id)

  // 5. Schichten für den Monat
  const startDate = `${year}-${String(month).padStart(2, '0')}-01`
  const endDate = `${year}-${String(month + 1).padStart(2, '0')}-01`
  const { data: shifts } = await service
    .from('shift_plans')
    .select('id, shift_date, start_time, end_time, note')
    .eq('employee_id', employee_id)
    .gte('shift_date', startDate)
    .lt('shift_date', month < 12 ? endDate : `${year + 1}-01-01`)
    .order('shift_date')

  // 6. Zeiteinträge (letzten 20)
  const { data: entries } = await service
    .from('time_entries')
    .select('id, checked_in_at, checked_out_at, break_minutes, note')
    .eq('employee_id', employee_id)
    .gte('checked_in_at', startUtc)
    .lt('checked_in_at', endUtc)
    .order('checked_in_at', { ascending: false })
    .limit(20)

  return NextResponse.json({
    employee,
    monthStats: monthStats ?? { total_work_minutes: 0, total_break_minutes: 0, entry_count: 0 },
    daily: daily ?? [],
    shifts: shifts ?? [],
    entries: entries ?? [],
  })
}
