import { createSupabaseServiceClient } from '@/lib/supabase-server'
import { KioskCheckin } from '@/components/zeiterfassung/KioskCheckin'

export const dynamic = 'force-dynamic'

export default async function KioskPage() {
  const service = createSupabaseServiceClient()
  const { data } = await service
    .from('employees')
    .select('id, name, color, pin')
    .eq('is_active', true)
    .neq('position', 'geschaeftsfuehrer')
    .order('name')

  const employees = (data ?? []).map(({ pin, ...emp }) => ({ ...emp, pin_is_set: pin !== null }))

  return <KioskCheckin employees={employees} />
}
