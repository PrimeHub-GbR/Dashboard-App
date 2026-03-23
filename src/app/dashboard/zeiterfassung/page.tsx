import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { ZeiterfassungClient } from '@/components/zeiterfassung/ZeiterfassungClient'

export const metadata = { title: 'Zeiterfassung — PrimeHub Dashboard' }
export const dynamic = 'force-dynamic'

export default async function ZeiterfassungPage() {
  const supabase = await createSupabaseServerClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) redirect('/')

  const { data: roleData } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .single()

  const role = roleData?.role as 'admin' | 'staff' | undefined
  if (!role) redirect('/')

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Zeiterfassung</h1>
        <p className="text-muted-foreground mt-1">
          Mitarbeiter-Check-in, Stundenauswertung und Schichtplanung
        </p>
      </div>
      <ZeiterfassungClient initialRole={role} />
    </div>
  )
}
