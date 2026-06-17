import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase-server'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function requireAuth() {
  const supabase = await createSupabaseServerClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return null
  return user
}

const patchSchema = z.object({
  // Empfang durch Mitarbeiter bestätigen → Status auf 'empfangen'.
  mark_empfangen: z.boolean().optional(),
  paletten_geprueft: z.coerce.number().int().min(0).max(999).nullable().optional(),
  schaden: z.boolean().optional(),
  notiz: z.string().trim().max(2000).nullable().optional(),
  // Manuell pflegbar: avisierter Anliefertermin (ISO-Datum/-Zeit) oder null zum Leeren.
  avisiert_fuer: z.string().trim().nullable().optional(),
})

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireAuth()
  if (!user) {
    return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 })
  }

  const { id } = await params
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: 'Ungültige ID' }, { status: 400 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Ungültiges JSON' }, { status: 400 })
  }

  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Ungültige Daten', details: parsed.error.flatten() },
      { status: 400 }
    )
  }

  const data = parsed.data
  const update: Record<string, unknown> = {}

  if (data.paletten_geprueft !== undefined) update.paletten_geprueft = data.paletten_geprueft
  if (data.schaden !== undefined) update.schaden = data.schaden
  if (data.notiz !== undefined) update.notiz = data.notiz
  if (data.avisiert_fuer !== undefined) update.avisiert_fuer = data.avisiert_fuer

  if (data.mark_empfangen) {
    update.status = 'empfangen'
    update.empfangen_von = user.id
    update.empfangen_am = new Date().toISOString()
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'Keine Änderungen' }, { status: 400 })
  }

  const service = createSupabaseServiceClient()
  const { data: updated, error } = await service
    .from('wareneingang')
    .update(update)
    .eq('id', id)
    .select('*')
    .single()

  if (error) {
    console.error('Wareneingang-Update fehlgeschlagen:', error)
    return NextResponse.json({ error: 'Datenbankfehler' }, { status: 500 })
  }

  return NextResponse.json({ row: updated })
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireAuth()
  if (!user) {
    return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 })
  }

  const { id } = await params
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: 'Ungültige ID' }, { status: 400 })
  }

  const service = createSupabaseServiceClient()
  const { error } = await service.from('wareneingang').delete().eq('id', id)
  if (error) {
    console.error('Wareneingang-Löschen fehlgeschlagen:', error)
    return NextResponse.json({ error: 'Datenbankfehler' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
