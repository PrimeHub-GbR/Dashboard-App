import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase-server'

const querySchema = z.object({
  year: z.coerce.number().int().min(2020).max(2100),
  month: z.coerce.number().int().min(1).max(12),
})

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
  const service = createSupabaseServiceClient()

  // 1. Tägliche Stunden pro Mitarbeiter (für Chart)
  const { data: dailyData } = await service.rpc('get_daily_hours_per_employee', {
    p_year: year,
    p_month: month,
  })

  // 2. Monatsübersicht aller Mitarbeiter (für KPI + Performance-Bars)
  const { data: monthData } = await service.rpc('get_all_employees_month_hours', {
    p_year: year,
    p_month: month,
  })

  // 3. Aktuell eingestempelt (für KPI)
  const { count: liveCount } = await service
    .from('time_entries')
    .select('id', { count: 'exact', head: true })
    .is('checked_out_at', null)

  // 4. Letzte 8 Check-in/Checkout-Ereignisse (für Activity Feed)
  const { data: recentEntries } = await service
    .from('time_entries')
    .select('id, employee_id, checked_in_at, checked_out_at, break_minutes, employees(id, name, color)')
    .order('updated_at', { ascending: false })
    .limit(8)

  // 5. Aktuell eingestempelt (live)
  const { data: liveEntries } = await service
    .from('time_entries')
    .select('id, employee_id, checked_in_at, employees(id, name, color)')
    .is('checked_out_at', null)

  // 6. Heutige Schichten (für geplante Ankünfte)
  const todayBerlin = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Berlin' }).format(new Date())
  const { data: todayShifts } = await service
    .from('shift_plans')
    .select('id, employee_id, start_time, end_time, employees(id, name, color)')
    .eq('shift_date', todayBerlin)

  // 7. Stündliche Präsenz (für Chart "Wann sind Mitarbeiter da")
  const startUtc = new Date(year, month - 1, 1)
  const endUtc = new Date(year, month, 1)

  const { data: monthEntries } = await service
    .from('time_entries')
    .select('employee_id, checked_in_at, checked_out_at')
    .gte('checked_in_at', startUtc.toISOString())
    .lt('checked_in_at', endUtc.toISOString())
    .not('checked_out_at', 'is', null)
    .limit(500)

  // Berlin-Stunde aus UTC-Timestamp
  function getBerlinHour(iso: string): number {
    return parseInt(new Intl.DateTimeFormat('en-US', {
      timeZone: 'Europe/Berlin', hour: 'numeric', hour12: false,
    }).format(new Date(iso)), 10)
  }

  // Für jede Stunde 6–21: wie viele eindeutige Mitarbeiter waren anwesend (kumulativ über den Monat)
  const hourlyMap = Array.from({ length: 16 }, (_, i) => i + 6).map(hour => {
    const empSet = new Set<string>()
    for (const entry of monthEntries ?? []) {
      if (!entry.checked_out_at) continue
      const inH = getBerlinHour(entry.checked_in_at)
      const outH = getBerlinHour(entry.checked_out_at)
      if (hour >= inH && hour <= outH) empSet.add(entry.employee_id)
    }
    return { hour: `${String(hour).padStart(2, '0')}:00`, raw_hour: hour, count: empSet.size }
  })

  return NextResponse.json({
    daily: dailyData ?? [],
    month: monthData ?? [],
    live_count: liveCount ?? 0,
    recent: recentEntries ?? [],
    live: liveEntries ?? [],
    today_shifts: todayShifts ?? [],
    hourly: hourlyMap,
  })
}
