import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { requireAdmin } from '../../_auth'

const updateInfoSchema = z.object({
  label: z.string().min(1).max(200),
  value: z.string().max(4000).optional().default(''),
  category: z.string().max(120).optional().default(''),
})

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 })

  const { id } = await params

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Ungültiger JSON-Body' }, { status: 400 })
  }

  const parsed = updateInfoSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.rpc('gf_update_company_info', {
    p_id: id,
    p_label: parsed.data.label,
    p_value: parsed.data.value,
    p_category: parsed.data.category,
  })

  if (error) return NextResponse.json({ error: 'Fehler beim Aktualisieren' }, { status: 500 })
  return NextResponse.json({ success: true })
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 })

  const { id } = await params
  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.rpc('gf_delete_company_info', { p_id: id })

  if (error) return NextResponse.json({ error: 'Fehler beim Löschen' }, { status: 500 })
  return NextResponse.json({ success: true })
}
