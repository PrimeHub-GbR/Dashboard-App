import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase-server'

type UserRole = 'admin' | 'manager' | 'staff'

async function requireAdminOrManager(): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const supabase = await createSupabaseServerClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return { ok: false, status: 401, error: 'Nicht autorisiert' }

  const { data } = await supabase.from('user_roles').select('role').eq('user_id', user.id).single()
  const role = data?.role as UserRole | undefined
  if (role !== 'admin' && role !== 'manager') {
    return { ok: false, status: 403, error: 'Keine Berechtigung' }
  }
  return { ok: true }
}

export async function GET(req: NextRequest) {
  const auth = await requireAdminOrManager()
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const onlyUnack = req.nextUrl.searchParams.get('only') === 'unacknowledged'
  const service = createSupabaseServiceClient()

  let query = service
    .from('employee_profile_changes')
    .select('id, employee_id, field_name, old_value, new_value, changed_at, acknowledged_at, employees(name, color)')
    .order('changed_at', { ascending: false })
    .limit(50)

  if (onlyUnack) {
    query = query.is('acknowledged_at', null)
  }

  const { data, error } = await query
  if (error) {
    return NextResponse.json({ error: 'Datenbankfehler' }, { status: 500 })
  }

  // unack-Count separat, weil obige Query limitiert
  const { count: unackCount } = await service
    .from('employee_profile_changes')
    .select('id', { count: 'exact', head: true })
    .is('acknowledged_at', null)

  return NextResponse.json({
    changes: data ?? [],
    unacknowledged_count: unackCount ?? 0,
  })
}
