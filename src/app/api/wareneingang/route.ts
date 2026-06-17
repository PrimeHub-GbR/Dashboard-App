import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase-server'

async function requireAuth() {
  const supabase = await createSupabaseServerClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return null
  return user
}

export async function GET(req: NextRequest) {
  const user = await requireAuth()
  if (!user) {
    return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status')
  const supplier = searchParams.get('supplier')
  const limit = Math.min(200, Math.max(1, parseInt(searchParams.get('limit') ?? '100', 10)))

  const service = createSupabaseServiceClient()

  let query = service
    .from('wareneingang')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (status) query = query.eq('status', status)
  if (supplier) query = query.eq('supplier', supplier)

  const { data, error } = await query
  if (error) {
    console.error('Wareneingang-Liste fehlgeschlagen:', error)
    return NextResponse.json({ error: 'Datenbankfehler' }, { status: 500 })
  }

  // Namen der Empfänger (auth.users) für die Anzeige auflösen.
  const empfaengerIds = [...new Set((data ?? []).map((r) => r.empfangen_von).filter(Boolean))]
  const nameMap = new Map<string, string>()
  if (empfaengerIds.length > 0) {
    const { data: emps } = await service
      .from('employees')
      .select('auth_user_id, name')
      .in('auth_user_id', empfaengerIds)
    for (const e of emps ?? []) {
      if (e.auth_user_id) nameMap.set(e.auth_user_id, e.name)
    }
  }

  const rows = (data ?? []).map((r) => ({
    ...r,
    empfangen_von_name: r.empfangen_von ? nameMap.get(r.empfangen_von) ?? null : null,
  }))

  return NextResponse.json({ rows })
}
