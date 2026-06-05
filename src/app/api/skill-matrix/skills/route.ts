import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

const createSchema = z.object({
  name:     z.string().min(1).max(120),
  category: z.string().min(1).max(60).default('Sonstiges'),
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

// POST /api/skill-matrix/skills — neuen Skill anlegen
export async function POST(req: NextRequest) {
  const auth = await requireEditor()
  if (auth.error) return auth.error

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Ungültiger JSON-Body' }, { status: 400 })
  }

  const parsed = createSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const service = createSupabaseServiceClient()

  // sort_order ans Ende der Kategorie hängen
  const { data: maxRow } = await service
    .from('skills')
    .select('sort_order')
    .eq('category', parsed.data.category)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle()

  const nextOrder = (maxRow?.sort_order ?? 0) + 1

  const { data: inserted, error: dbError } = await service
    .from('skills')
    .insert({ name: parsed.data.name, category: parsed.data.category, sort_order: nextOrder })
    .select('id, name, category, sort_order, is_active')
    .single()

  if (dbError) {
    const msg = dbError.code === '23505' ? 'Skill existiert bereits' : 'Fehler beim Anlegen'
    return NextResponse.json({ error: msg }, { status: 400 })
  }

  return NextResponse.json({ skill: inserted }, { status: 201 })
}
