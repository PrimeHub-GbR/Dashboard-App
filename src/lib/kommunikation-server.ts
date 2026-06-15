import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase-server'

/**
 * Stellt sicher, dass der Aufrufer ein Chef (admin/manager) ist.
 * Gibt den User zurueck oder null (→ 401/403 in der Route).
 */
export async function requireChefUser() {
  const supabase = await createSupabaseServerClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return null

  const service = createSupabaseServiceClient()
  const { data: roleRow } = await service
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .single()

  if (!roleRow || !['admin', 'manager'].includes(roleRow.role)) return null
  return user
}

/** Zaehlt die Platzhalter {{1}}, {{2}} … (hoechster Index = Anzahl Variablen). */
export function countTemplateVars(body: string): number {
  const idx = [...body.matchAll(/\{\{(\d+)\}\}/g)].map((m) => parseInt(m[1], 10))
  return idx.length ? Math.max(...idx) : 0
}
