import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { OrganisationClient } from '@/components/organisation/OrganisationClient'

export const metadata = { title: 'Organisation — PrimeHub Dashboard' }
export const dynamic = 'force-dynamic'

export default async function OrganisationPage() {
  const supabase = await createSupabaseServerClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) redirect('/')

  const { data: roleData } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .single()

  const role = roleData?.role as 'admin' | 'manager' | 'staff' | undefined
  if (!role) redirect('/')

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Organisation</h1>
        <p className="text-muted-foreground mt-1">
          Unternehmenshierarchie, Stammdaten und Mitarbeiterverwaltung
        </p>
      </div>
      <OrganisationClient userRole={role} />
    </div>
  )
}
