import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase-server'

const WEEKDAY_VALUES = ['mon','tue','wed','thu','fri','sat','sun'] as const

const patchSchema = z.object({
  seller_name: z.string().max(200).optional(),
  is_active: z.boolean().optional(),
  interval_minutes: z.number().int().refine(
    v => [10, 30, 60, 120, 360, 720, 1440].includes(v),
    'Ungültiges Intervall'
  ).optional(),
  active_weekdays: z.array(z.enum(WEEKDAY_VALUES)).min(1).optional(),
})

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function calculateNextRunAt(intervalMinutes: number, weekdays: string[]): Date {
  let next = new Date(Date.now() + intervalMinutes * 60 * 1000)
  const dayNames = ['sun','mon','tue','wed','thu','fri','sat']
  let safety = 0
  while (!weekdays.includes(dayNames[next.getDay()]) && safety < 8) {
    next = new Date(next.getTime() + 24 * 60 * 60 * 1000)
    safety++
  }
  return next
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    if (!UUID_RE.test(id)) {
      return NextResponse.json({ error: 'Ungültige ID' }, { status: 400 })
    }

    const supabaseAuth = await createSupabaseServerClient()
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Nicht authentifiziert' }, { status: 401 })
    }

    const body = await request.json()
    const parsed = patchSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
    }

    const supabase = createSupabaseServiceClient()

    // Verify ownership
    const { data: existing } = await supabase
      .from('buchpreischeck_sellers')
      .select('user_id, interval_minutes, active_weekdays')
      .eq('id', id)
      .single()

    if (!existing || existing.user_id !== user.id) {
      return NextResponse.json({ error: 'Nicht gefunden oder keine Berechtigung' }, { status: 404 })
    }

    const updates: Record<string, unknown> = { ...parsed.data }

    // Recalculate next_run_at if scheduling changed
    const newInterval = parsed.data.interval_minutes ?? existing.interval_minutes
    const newWeekdays = parsed.data.active_weekdays ?? existing.active_weekdays
    if (parsed.data.interval_minutes || parsed.data.active_weekdays || parsed.data.is_active) {
      updates.next_run_at = calculateNextRunAt(newInterval, newWeekdays).toISOString()
    }

    const { data, error } = await supabase
      .from('buchpreischeck_sellers')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(data)
  } catch (err) {
    console.error('PATCH /api/buchpreisbindung/sellers/[id] error:', err)
    return NextResponse.json({ error: 'Interner Serverfehler' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    if (!UUID_RE.test(id)) {
      return NextResponse.json({ error: 'Ungültige ID' }, { status: 400 })
    }

    const supabaseAuth = await createSupabaseServerClient()
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Nicht authentifiziert' }, { status: 401 })
    }

    const supabase = createSupabaseServiceClient()

    const { data: existing } = await supabase
      .from('buchpreischeck_sellers')
      .select('user_id')
      .eq('id', id)
      .single()

    if (!existing || existing.user_id !== user.id) {
      return NextResponse.json({ error: 'Nicht gefunden oder keine Berechtigung' }, { status: 404 })
    }

    const { error } = await supabase
      .from('buchpreischeck_sellers')
      .delete()
      .eq('id', id)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('DELETE /api/buchpreisbindung/sellers/[id] error:', err)
    return NextResponse.json({ error: 'Interner Serverfehler' }, { status: 500 })
  }
}
