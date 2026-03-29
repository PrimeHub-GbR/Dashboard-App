import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase-server'

const createNodeSchema = z.object({
  parent_id: z.string().uuid().nullable().optional(),
  name: z.string().min(1).max(100),
  type: z.enum(['account', 'store', 'category', 'product', 'node']).default('node'),
  sort_order: z.number().int().default(0),
  color: z.string().default('#6366f1'),
})

async function requireAuth() {
  const supabase = await createSupabaseServerClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return null
  return user
}

export async function GET() {
  const user = await requireAuth()
  if (!user) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 })

  const service = createSupabaseServiceClient()
  const { data, error } = await service
    .from('org_nodes')
    .select('id, parent_id, name, type, sort_order, color, created_at')
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })

  if (error) return NextResponse.json({ error: 'Datenbankfehler' }, { status: 500 })

  return NextResponse.json({ nodes: data ?? [] })
}

export async function POST(req: NextRequest) {
  const user = await requireAuth()
  if (!user) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 })

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Ungültiger JSON-Body' }, { status: 400 })
  }

  const parsed = createNodeSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const service = createSupabaseServiceClient()
  const { data, error } = await service
    .from('org_nodes')
    .insert({
      parent_id: parsed.data.parent_id ?? null,
      name: parsed.data.name,
      type: parsed.data.type,
      sort_order: parsed.data.sort_order,
      color: parsed.data.color,
    })
    .select('id, parent_id, name, type, sort_order, color')
    .single()

  if (error || !data) return NextResponse.json({ error: 'Fehler beim Erstellen' }, { status: 500 })

  return NextResponse.json({ node: data }, { status: 201 })
}
