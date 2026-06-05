import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

const patchSchema = z.object({
  name:     z.string().min(1).max(120).optional(),
  category: z.string().min(1).max(60).optional(),
})

async function requireEditor() {
  const supabase = await createSupabaseServerClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return { error: NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 }) }

  const { data: roleData } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .single()

  const role = roleData?.role
  if (role !== 'admin' && role !== 'manager') {
    return { error: NextResponse.json({ error: 'Keine Berechtigung' }, { status: 403 }) }
  }
  return { user }
}

// PATCH /api/skill-matrix/skills/[id] — Skill umbenennen / Kategorie ändern
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireEditor()
  if (auth.error) return auth.error

  const { id } = await params
  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: 'Ungültige ID' }, { status: 400 })
  }

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Ungültiger JSON-Body' }, { status: 400 })
  }

  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  if (Object.keys(parsed.data).length === 0) {
    return NextResponse.json({ error: 'Keine Änderungen' }, { status: 400 })
  }

  const service = createSupabaseServiceClient()
  const { data: updated, error: dbError } = await service
    .from('skills')
    .update(parsed.data)
    .eq('id', id)
    .select('id, name, category, sort_order, is_active')
    .single()

  if (dbError) {
    const msg = dbError.code === '23505' ? 'Skill-Name existiert bereits' : 'Fehler beim Speichern'
    return NextResponse.json({ error: msg }, { status: 400 })
  }

  return NextResponse.json({ skill: updated })
}

// DELETE /api/skill-matrix/skills/[id] — Skill löschen (inkl. aller Zuordnungen via CASCADE)
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireEditor()
  if (auth.error) return auth.error

  const { id } = await params
  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: 'Ungültige ID' }, { status: 400 })
  }

  const service = createSupabaseServiceClient()
  const { error: dbError } = await service.from('skills').delete().eq('id', id)
  if (dbError) return NextResponse.json({ error: 'Fehler beim Löschen' }, { status: 500 })

  return NextResponse.json({ ok: true })
}
