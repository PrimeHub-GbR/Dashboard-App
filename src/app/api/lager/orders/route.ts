import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase-server'

const looseUuid = z.string().regex(
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
)

async function requireUser() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

// Aktuelle offene Liste + bestellte Listen + Archiv (Lese-RPCs, via Service-Role).
export async function GET() {
  const user = await requireUser()
  if (!user) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 })

  const service = createSupabaseServiceClient()
  const [openR, orderedR, archiveR] = await Promise.all([
    service.rpc('get_reorder_open'),
    service.rpc('get_reorder_ordered'),
    service.rpc('get_reorder_archive'),
  ])
  return NextResponse.json({
    open: openR.data ?? { list_id: null, items: [] },
    ordered: orderedR.data ?? [],
    archive: archiveR.data ?? [],
  })
}

const actionSchema = z.object({
  action: z.enum(['order', 'deliver', 'remove']),
  list_id: looseUuid.optional(),
  request_id: looseUuid.optional(),
})

export async function POST(req: NextRequest) {
  const user = await requireUser()
  if (!user) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 })

  const parsed = actionSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Ungültige Eingabe' }, { status: 400 })
  const { action, list_id, request_id } = parsed.data

  const service = createSupabaseServiceClient()
  const { data: emp } = await service
    .from('employees').select('id').eq('auth_user_id', user.id).maybeSingle()

  if (action === 'remove') {
    if (!request_id) return NextResponse.json({ error: 'request_id fehlt' }, { status: 400 })
    const { data: reqRow } = await service
      .from('reorder_requests').select('list_id').eq('id', request_id).maybeSingle()
    if (!reqRow) return NextResponse.json({ error: 'Eintrag nicht gefunden' }, { status: 404 })
    const { data: list } = await service
      .from('reorder_lists').select('status').eq('id', reqRow.list_id).maybeSingle()
    if (list?.status !== 'open') {
      return NextResponse.json({ error: 'Liste ist nicht mehr offen' }, { status: 409 })
    }
    const { error } = await service.from('reorder_requests').delete().eq('id', request_id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  if (!list_id) return NextResponse.json({ error: 'list_id fehlt' }, { status: 400 })

  if (action === 'order') {
    const { count } = await service
      .from('reorder_requests').select('id', { count: 'exact', head: true }).eq('list_id', list_id)
    if (!count) return NextResponse.json({ error: 'Leere Liste kann nicht bestellt werden' }, { status: 409 })
    const { data, error } = await service
      .from('reorder_lists')
      .update({ status: 'ordered', ordered_by: emp?.id ?? null, ordered_at: new Date().toISOString() })
      .eq('id', list_id).eq('status', 'open').select('id')
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!data || data.length === 0) return NextResponse.json({ error: 'Liste nicht offen' }, { status: 409 })
    return NextResponse.json({ ok: true })
  }

  // action === 'deliver'
  const { data, error } = await service
    .from('reorder_lists')
    .update({ status: 'delivered', delivered_by: emp?.id ?? null, delivered_at: new Date().toISOString() })
    .eq('id', list_id).eq('status', 'ordered').select('id')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data || data.length === 0) return NextResponse.json({ error: 'Liste nicht bestellt' }, { status: 409 })
  return NextResponse.json({ ok: true })
}
