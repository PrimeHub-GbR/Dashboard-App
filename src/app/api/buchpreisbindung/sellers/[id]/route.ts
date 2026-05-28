import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase-server'
import { calculateNextRunAt } from '@/lib/buchpreisbindung-schedule'

const WEEKDAY_VALUES = ['mon','tue','wed','thu','fri','sat','sun'] as const

const patchSchema = z.object({
  seller_name: z.string().max(200).optional(),
  is_active: z.boolean().optional(),
  schedule_mode: z.enum(['weekly', 'interval']).optional(),
  run_time: z.string().regex(/^\d{2}:\d{2}$/, 'Ungültige Uhrzeit (Format HH:MM)').optional(),
  interval_minutes: z.number().int().refine(
    v => [10, 30, 60, 120, 360, 720, 1440].includes(v),
    'Ungültiges Intervall'
  ).optional(),
  active_weekdays: z.array(z.enum(WEEKDAY_VALUES)).min(1).optional(),
  max_pages: z.number().int().min(1).max(200).nullable().optional(),
})

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

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
      .select('user_id, schedule_mode, run_time, interval_minutes, active_weekdays')
      .eq('id', id)
      .single()

    if (!existing || existing.user_id !== user.id) {
      return NextResponse.json({ error: 'Nicht gefunden oder keine Berechtigung' }, { status: 404 })
    }

    const updates: Record<string, unknown> = { ...parsed.data }

    // Recalculate next_run_at if any scheduling field changed (or seller (re)activated)
    const scheduleChanged =
      parsed.data.schedule_mode !== undefined ||
      parsed.data.run_time !== undefined ||
      parsed.data.interval_minutes !== undefined ||
      parsed.data.active_weekdays !== undefined ||
      parsed.data.is_active !== undefined
    if (scheduleChanged) {
      updates.next_run_at = calculateNextRunAt({
        schedule_mode: parsed.data.schedule_mode ?? existing.schedule_mode,
        run_time: parsed.data.run_time ?? existing.run_time,
        interval_minutes: parsed.data.interval_minutes ?? existing.interval_minutes,
        active_weekdays: parsed.data.active_weekdays ?? existing.active_weekdays,
      }).toISOString()
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
