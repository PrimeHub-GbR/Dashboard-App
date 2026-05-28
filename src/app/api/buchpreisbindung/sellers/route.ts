import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase-server'
import { rateLimit } from '@/lib/rate-limit'
import { calculateNextRunAt } from '@/lib/buchpreisbindung-schedule'

const WEEKDAY_VALUES = ['mon','tue','wed','thu','fri','sat','sun'] as const

const createSellerSchema = z.object({
  amazon_seller_id: z.string().regex(/^A[A-Z0-9]{13}$/, 'Ungültige Amazon Seller-ID'),
  seller_name: z.string().max(200).optional(),
  schedule_mode: z.enum(['weekly', 'interval']).default('weekly'),
  run_time: z.string().regex(/^\d{2}:\d{2}$/, 'Ungültige Uhrzeit (Format HH:MM)').default('03:00'),
  interval_minutes: z.number().int().refine(
    v => [10, 30, 60, 120, 360, 720, 1440].includes(v),
    'Ungültiges Intervall'
  ).default(1440),
  active_weekdays: z.array(z.enum(WEEKDAY_VALUES)).min(1, 'Mindestens einen Wochentag auswählen'),
  max_pages: z.number().int().min(1).max(200).nullable().optional(),
})

export async function GET() {
  try {
    const supabaseAuth = await createSupabaseServerClient()
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Nicht authentifiziert' }, { status: 401 })
    }

    const supabase = createSupabaseServiceClient()
    const { data, error } = await supabase
      .from('buchpreischeck_sellers')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(data)
  } catch (err) {
    console.error('GET /api/buchpreisbindung/sellers error:', err)
    return NextResponse.json({ error: 'Interner Serverfehler' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabaseAuth = await createSupabaseServerClient()
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Nicht authentifiziert' }, { status: 401 })
    }

    if (!rateLimit(`buchpreischeck-sellers:${user.id}`, 10, 60_000)) {
      return NextResponse.json({ error: 'Zu viele Anfragen' }, { status: 429 })
    }

    const body = await request.json()
    const parsed = createSellerSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
    }

    const { amazon_seller_id, seller_name, schedule_mode, run_time, interval_minutes, active_weekdays, max_pages } = parsed.data
    const next_run_at = calculateNextRunAt({ schedule_mode, run_time, active_weekdays, interval_minutes })

    const supabase = createSupabaseServiceClient()
    const { data, error } = await supabase
      .from('buchpreischeck_sellers')
      .insert({
        user_id: user.id,
        amazon_seller_id,
        seller_name: seller_name ?? null,
        schedule_mode,
        run_time,
        interval_minutes,
        active_weekdays,
        max_pages: max_pages ?? null,
        is_active: false,
        next_run_at: next_run_at.toISOString(),
      })
      .select()
      .single()

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'Dieser Händler ist bereits konfiguriert' }, { status: 409 })
      }
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(data, { status: 201 })
  } catch (err) {
    console.error('POST /api/buchpreisbindung/sellers error:', err)
    return NextResponse.json({ error: 'Interner Serverfehler' }, { status: 500 })
  }
}
