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

  return NextResponse.json({
    daily: dailyData ?? [],
    month: monthData ?? [],
    live_count: liveCount ?? 0,
    recent: recentEntries ?? [],
  })
}
