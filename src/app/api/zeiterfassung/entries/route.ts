import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase-server'

const querySchema = z.object({
  employee_id: z.string().uuid().optional(),
  year: z.coerce.number().int().min(2020).max(2100).optional(),
  month: z.coerce.number().int().min(1).max(12).optional(),
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(100).default(50),
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
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const { employee_id, year, month, page, page_size } = parsed.data
  const from = (page - 1) * page_size
  const to = from + page_size - 1

  const service = createSupabaseServiceClient()
  let query = service
    .from('time_entries')
    .select(
      `id, employee_id, checked_in_at, checked_out_at, break_minutes, note, corrected_by, corrected_at, created_at,
       employees(id, name, color)`,
      { count: 'exact' }
    )
    .order('checked_in_at', { ascending: false })
    .range(from, to)

  if (employee_id) {
    query = query.eq('employee_id', employee_id)
  }

  if (year && month) {
    // Monatsfilter via Supabase (UTC-Range für Berlin-Monat)
    const startUtc = new Date(year, month - 1, 1)
    const endUtc = new Date(year, month, 1)
    query = query
      .gte('checked_in_at', startUtc.toISOString())
      .lt('checked_in_at', endUtc.toISOString())
  }

  const { data, error: dbError, count } = await query

  if (dbError) {
    return NextResponse.json({ error: 'Datenbankfehler' }, { status: 500 })
  }

  return NextResponse.json({
    entries: data,
    total: count ?? 0,
    page,
    page_size,
  })
}
