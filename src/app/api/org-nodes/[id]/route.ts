import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase-server'

const updateNodeSchema = z.object({
  parent_id: z.string().uuid().nullable().optional(),
  name: z.string().min(1).max(100).optional(),
  type: z.enum(['account', 'store', 'category', 'product', 'node']).optional(),
  sort_order: z.number().int().optional(),
  color: z.string().optional(),
})

async function requireAuth() {
  const supabase = await createSupabaseServerClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return null
  return user
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireAuth()
  if (!user) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 })

  const { id } = await params

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Ungültiger JSON-Body' }, { status: 400 })
  }

  const parsed = updateNodeSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const service = createSupabaseServiceClient()
  const { error } = await service
    .from('org_nodes')
    .update(parsed.data)
    .eq('id', id)

  if (error) return NextResponse.json({ error: 'Fehler beim Aktualisieren' }, { status: 500 })

  return NextResponse.json({ success: true })
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireAuth()
  if (!user) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 })

  const { id } = await params
  const service = createSupabaseServiceClient()

  const { error } = await service.from('org_nodes').delete().eq('id', id)
  if (error) return NextResponse.json({ error: 'Fehler beim Löschen' }, { status: 500 })

  return NextResponse.json({ success: true })
}
