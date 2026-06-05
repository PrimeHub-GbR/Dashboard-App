import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

const setSchema = z.object({
  employee_id: z.string().uuid(),
  skill_id:    z.string().uuid(),
  // 'kann' | 'lernt' | 'nein' (nein = Zuordnung entfernen)
  status:      z.enum(['kann', 'lernt', 'nein']),
})

// POST /api/skill-matrix/set
// Setzt den Status eines Mitarbeiters für einen Skill.
// Nur Admin/Manager.
export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 })

  const { data: roleData } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .single()

  const role = roleData?.role
  if (role !== 'admin' && role !== 'manager') {
    return NextResponse.json({ error: 'Keine Berechtigung' }, { status: 403 })
  }

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Ungültiger JSON-Body' }, { status: 400 })
  }

  const parsed = setSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const { employee_id, skill_id, status } = parsed.data
  const service = createSupabaseServiceClient()

  if (status === 'nein') {
    const { error: delError } = await service
      .from('employee_skills')
      .delete()
      .eq('employee_id', employee_id)
      .eq('skill_id', skill_id)
    if (delError) return NextResponse.json({ error: 'Fehler beim Entfernen' }, { status: 500 })
    return NextResponse.json({ ok: true, status: 'nein' })
  }

  const { error: upsertError } = await service
    .from('employee_skills')
    .upsert(
      { employee_id, skill_id, status, updated_by: user.id, updated_at: new Date().toISOString() },
      { onConflict: 'employee_id,skill_id' },
    )
  if (upsertError) return NextResponse.json({ error: 'Fehler beim Speichern' }, { status: 500 })

  return NextResponse.json({ ok: true, status })
}
