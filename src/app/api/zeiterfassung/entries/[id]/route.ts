import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase-server'
import { calculateBreakMinutes } from '@/lib/zeiterfassung/arbzg'

const correctEntrySchema = z.object({
  checked_in_at: z.string().datetime().optional(),
  checked_out_at: z.string().datetime().nullable().optional(),
  break_minutes: z.number().int().min(0).optional(),
  note: z.string().min(1, 'Notiz ist Pflicht').max(500).optional(),
  needs_review: z.boolean().optional(),
})

async function requireAdmin() {
  const supabase = await createSupabaseServerClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return null
  const { data: roleData } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .single()
  if (roleData?.role !== 'admin') return null
  return user
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireAdmin()
  if (!user) {
    return NextResponse.json({ error: 'Nur Admins' }, { status: 403 })
  }

  const { id } = await params
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Ungültiger JSON-Body' }, { status: 400 })
  }

  const parsed = correctEntrySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const service = createSupabaseServiceClient()
  const input = parsed.data

  // Echte Zeit-/Notiz-Änderung vs. reine Kontroll-Quittung ({ needs_review: false })
  const isTimeEdit =
    input.checked_in_at !== undefined ||
    input.checked_out_at !== undefined ||
    input.break_minutes !== undefined ||
    input.note !== undefined
  if (isTimeEdit && !input.note) {
    return NextResponse.json({ error: 'Notiz ist Pflicht' }, { status: 400 })
  }

  const updateData: Record<string, unknown> = {}
  if (input.checked_in_at !== undefined) updateData.checked_in_at = input.checked_in_at
  if (input.checked_out_at !== undefined) updateData.checked_out_at = input.checked_out_at
  if (input.break_minutes !== undefined) updateData.break_minutes = input.break_minutes
  if (input.note !== undefined) updateData.note = input.note
  if (input.needs_review !== undefined) updateData.needs_review = input.needs_review

  // Pause automatisch berechnen wenn Zeiten geändert aber break_minutes nicht explizit angegeben
  if (updateData.break_minutes === undefined && updateData.checked_out_at) {
    const { data: existing } = await service
      .from('time_entries')
      .select('checked_in_at')
      .eq('id', id)
      .single()
    const effectiveIn = (updateData.checked_in_at as string | undefined) ?? existing?.checked_in_at
    if (effectiveIn) {
      const gross = Math.floor(
        (new Date(updateData.checked_out_at as string).getTime() - new Date(effectiveIn).getTime()) / 60_000
      )
      updateData.break_minutes = gross > 0 ? calculateBreakMinutes(gross) : 0
    }
  }

  // corrected_by/at nur bei echter Korrektur stempeln, nicht bei reiner Kontroll-Quittung
  if (isTimeEdit) {
    updateData.corrected_by = user.id
    updateData.corrected_at = new Date().toISOString()
  }

  if (Object.keys(updateData).length === 0) {
    return NextResponse.json({ error: 'Keine Änderung angegeben' }, { status: 400 })
  }

  const { data, error } = await service
    .from('time_entries')
    .update(updateData)
    .eq('id', id)
    .select('id, employee_id, checked_in_at, checked_out_at, break_minutes, note, corrected_at, needs_review')
    .single()

  if (error) {
    return NextResponse.json({ error: 'Korrektur fehlgeschlagen' }, { status: 500 })
  }

  return NextResponse.json({ entry: data })
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireAdmin()
  if (!user) {
    return NextResponse.json({ error: 'Nur Admins' }, { status: 403 })
  }

  const { id } = await params
  const service = createSupabaseServiceClient()
  const { error } = await service
    .from('time_entries')
    .delete()
    .eq('id', id)

  if (error) {
    return NextResponse.json({ error: 'Löschen fehlgeschlagen' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
