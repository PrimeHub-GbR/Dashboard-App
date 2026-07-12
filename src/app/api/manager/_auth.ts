import { createSupabaseServerClient } from '@/lib/supabase-server'

/**
 * Verifiziert, dass der aktuelle User Geschäftsführung (admin) ist.
 * Verwalten (Fristen anlegen/ändern/löschen, Firmeninfos) bleibt GF-only.
 * Gibt den User zurueck oder null (nicht autorisiert).
 */
export async function requireAdmin() {
  const supabase = await createSupabaseServerClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return null

  const { data } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .single()

  if (data?.role !== 'admin') return null
  return user
}

/**
 * Verifiziert admin ODER manager. Manager sehen nur ihre eigenen Termine
 * (die RPC filtert serverseitig auf die Empfängerliste) und dürfen abhaken.
 * Gibt { user, role } zurueck oder null (nicht autorisiert).
 */
export async function requireAdminOrManager() {
  const supabase = await createSupabaseServerClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return null

  const { data } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .single()

  const role = data?.role
  if (role !== 'admin' && role !== 'manager') return null
  return { user, role: role as 'admin' | 'manager' }
}
