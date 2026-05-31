import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase-server'

type UserRole = 'admin' | 'manager' | 'staff'

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createSupabaseServerClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) {
    return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 })
  }

  const { data: roleData } = await supabase
    .from('user_roles').select('role').eq('user_id', user.id).single()
  const role = roleData?.role as UserRole | undefined
  if (role !== 'admin' && role !== 'manager') {
    return NextResponse.json({ error: 'Keine Berechtigung' }, { status: 403 })
  }

  const { id } = await params
  const service = createSupabaseServiceClient()
  const { data, error: updError } = await service
    .from('employee_profile_changes')
    .update({
      acknowledged_at: new Date().toISOString(),
      acknowledged_by: user.id,
    })
    .eq('id', id)
    .select('id, acknowledged_at')
    .single()

  if (updError || !data) {
    return NextResponse.json({ error: 'Update fehlgeschlagen' }, { status: 500 })
  }

  return NextResponse.json({ acknowledged_at: data.acknowledged_at })
}
