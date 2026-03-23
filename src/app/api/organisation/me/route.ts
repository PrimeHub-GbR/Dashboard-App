import { NextResponse } from 'next/server'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase-server'

export async function GET() {
  const supabase = await createSupabaseServerClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return NextResponse.json({ orgMemberId: null })

  const service = createSupabaseServiceClient()
  const { data } = await service
    .from('employees')
    .select('id')
    .eq('auth_user_id', user.id)
    .single()

  return NextResponse.json({ orgMemberId: data?.id ?? null })
}
