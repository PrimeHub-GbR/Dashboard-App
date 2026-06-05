import { createSupabaseServiceClient } from '@/lib/supabase-server'
import { KioskCheckin } from '@/components/zeiterfassung/KioskCheckin'
import { getMaxShiftHours, isStaleOpenEntry } from '@/lib/zeiterfassung/shift-limit'

export const dynamic = 'force-dynamic'

export default async function KioskPage() {
  const service = createSupabaseServiceClient()

  const [{ data: empData }, { data: openEntries }, maxShiftHours] = await Promise.all([
    service
      .from('employees')
      .select('id, name, color, pin, position')
      .eq('is_active', true)
      .eq('is_demo', false) // Demo-Mitarbeiter (Max Muster) nie am Kiosk zeigen
      .neq('position', 'geschaeftsfuehrer')
      .order('position') // manager kommt vor mitarbeiter (alphabetisch)
      .order('name'),
    service
      .from('time_entries')
      .select('employee_id, checked_in_at')
      .is('checked_out_at', null),
    getMaxShiftHours(service),
  ])

  // Stale offene Einträge (vergessene Abmeldung) zählen NICHT als anwesend —
  // der Mitarbeiter wird beim Login durch den Korrektur-Dialog geführt.
  const checkedInIds = new Set(
    (openEntries ?? [])
      .filter(e => !isStaleOpenEntry(e.checked_in_at, maxShiftHours))
      .map(e => e.employee_id)
  )

  const employees = (empData ?? []).map(({ pin, ...emp }) => ({
    ...emp,
    pin_is_set: pin !== null,
    is_checked_in: checkedInIds.has(emp.id),
  }))

  return <KioskCheckin employees={employees} />
}
