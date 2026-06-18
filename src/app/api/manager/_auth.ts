import { createSupabaseServerClient } from '@/lib/supabase-server'

/**
 * Verifiziert, dass der aktuelle User Geschäftsführung (admin) ist.
 * Der Manager-Bereich ist GF-only — 'manager' und 'staff' haben keinen Zugriff.
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
