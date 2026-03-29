import { createSupabaseServiceClient } from '@/lib/supabase-server'
import { KioskCheckin } from '@/components/zeiterfassung/KioskCheckin'

export const dynamic = 'force-dynamic'

export default async function KioskPage() {
  const service = createSupabaseServiceClient()

  const [{ data: empData }, { data: openEntries }] = await Promise.all([
    service
      .from('employees')
      .select('id, name, color, pin, position')
      .eq('is_active', true)
      .neq('position', 'geschaeftsfuehrer')
      .order('position') // manager kommt vor mitarbeiter (alphabetisch)
      .order('name'),
    service
      .from('time_entries')
      .select('employee_id')
      .is('checked_out_at', null),
  ])

  const checkedInIds = new Set((openEntries ?? []).map(e => e.employee_id))

  const employees = (empData ?? []).map(({ pin, ...emp }) => ({
    ...emp,
    pin_is_set: pin !== null,
    is_checked_in: checkedInIds.has(emp.id),
  }))

  return <KioskCheckin employees={employees} />
}
