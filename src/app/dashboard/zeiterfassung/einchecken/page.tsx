import { createSupabaseServiceClient } from '@/lib/supabase-server'
import { KioskCheckin } from '@/components/zeiterfassung/KioskCheckin'

export const metadata = { title: 'Check-in — Zeiterfassung' }
export const dynamic = 'force-dynamic'

export default async function EincheckenPage() {
  const service = createSupabaseServiceClient()
  const { data: employees } = await service
    .from('employees')
    .select('id, name, color')
    .eq('is_active', true)
    .order('name')

  return <KioskCheckin employees={employees ?? []} />
}
