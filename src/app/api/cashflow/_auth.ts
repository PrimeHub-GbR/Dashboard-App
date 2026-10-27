import { createSupabaseServerClient } from '@/lib/supabase-server'
import type { User } from '@supabase/supabase-js'

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

export type ManagerAuthResult =
  | { ok: true; user: User }
  | { ok: false; status: 401 | 403; error: 'Nicht autorisiert' | 'Keine Berechtigung' }

/**
 * Wie requireManager(), liefert aber den Grund:
 * kein Login -> 401 'Nicht autorisiert', eingeloggt ohne Admin/Manager-Rolle -> 403 'Keine Berechtigung'.
 */
export async function checkManager(): Promise<ManagerAuthResult> {
  const supabase = await createSupabaseServerClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return { ok: false, status: 401, error: 'Nicht autorisiert' }

  const { data } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .maybeSingle()

  if (data?.role !== 'admin' && data?.role !== 'manager') {
    return { ok: false, status: 403, error: 'Keine Berechtigung' }
  }
  return { ok: true, user }
}
