import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { requireAdmin } from '../_auth'

const createInfoSchema = z.object({
  label: z.string().min(1).max(200),
  value: z.string().max(4000).optional().default(''),
  category: z.string().max(120).optional().default(''),
})

export async function GET() {
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 })

  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase.rpc('gf_list_company_info')

  if (error) return NextResponse.json({ error: 'Datenbankfehler' }, { status: 500 })
  return NextResponse.json({ info: data ?? [] })
}

export async function POST(req: NextRequest) {
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 })

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Ungültiger JSON-Body' }, { status: 400 })
  }

  const parsed = createInfoSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase.rpc('gf_add_company_info', {
    p_label: parsed.data.label,
    p_value: parsed.data.value,
    p_category: parsed.data.category,
  })

  if (error) return NextResponse.json({ error: 'Fehler beim Erstellen' }, { status: 500 })
  return NextResponse.json({ id: data }, { status: 201 })
}
