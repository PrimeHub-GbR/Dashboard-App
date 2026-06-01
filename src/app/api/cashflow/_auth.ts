import { createSupabaseServerClient } from '@/lib/supabase-server'

/**
 * Verifiziert, dass der aktuelle User Admin oder Manager ist.
 * Gibt den User zurueck oder null (nicht autorisiert).
 */
export async function requireManager() {
  const supabase = await createSupabaseServerClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return null

  const { data } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .single()

  if (data?.role !== 'admin' && data?.role !== 'manager') return null
  return user
}
