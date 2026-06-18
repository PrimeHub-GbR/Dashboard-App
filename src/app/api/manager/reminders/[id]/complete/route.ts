import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { requireAdmin } from '../../../_auth'

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 })

  const { id } = await params
  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.rpc('gf_complete_reminder', { p_id: id })

  if (error) return NextResponse.json({ error: 'Fehler beim Abhaken' }, { status: 500 })
  return NextResponse.json({ success: true })
}
