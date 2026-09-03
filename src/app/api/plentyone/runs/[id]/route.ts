import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase-server'

export const runtime = 'nodejs'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const patchSchema = z.object({
  export_freigabe: z.boolean(),
})

/**
 * Export-Freigabe eines Laufs umlegen. Solange sie an ist, holt PlentyONE die
 * Artikel- und Eigenschaften-CSV dieses Laufs per Zeitplan ab; ausgeschaltet
 * liefert die Abhol-URL nur noch die Kopfzeile.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  if (!UUID.test(id)) {
    return NextResponse.json({ error: 'Ungültige Lauf-ID' }, { status: 400 })
  }

  const auth = await createSupabaseServerClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Nicht authentifiziert' }, { status: 401 })

  const svc = createSupabaseServiceClient()
  const { data: rolle } = await svc
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .single()
  if (rolle?.role !== 'admin' && rolle?.role !== 'manager') {
    return NextResponse.json({ error: 'Keine Berechtigung' }, { status: 403 })
  }

  const parsed = patchSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Ungültige Daten' }, { status: 400 })
  }

  const { data, error } = await svc
    .from('plentyone_runs')
    .update({ export_freigabe: parsed.data.export_freigabe })
    .eq('id', id)
    .select('id, export_freigabe')
    .single()

  if (error || !data) {
    return NextResponse.json({ error: 'Lauf nicht gefunden' }, { status: 404 })
  }
  return NextResponse.json({ run: data })
}
