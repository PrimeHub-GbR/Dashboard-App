import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { ManagerClient } from '@/components/manager/ManagerClient'

export const metadata: Metadata = {
  title: 'Manager — PrimeHub Dashboard',
}
export const dynamic = 'force-dynamic'

export default async function ManagerPage() {
  const supabase = await createSupabaseServerClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) redirect('/')

  const { data: roleData } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .single()

  const role = roleData?.role as 'admin' | 'manager' | 'staff' | undefined
  // GF (admin): voller Zugriff. Manager: read-only Terminliste der eigenen
  // Termine (Empfänger). Alle anderen: kein Zugriff.
  if (role !== 'admin' && role !== 'manager') redirect('/dashboard')
  const isAdmin = role === 'admin'

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          {isAdmin ? 'Manager' : 'Termine'}
        </h1>
        <p className="text-muted-foreground mt-1">
          {isAdmin
            ? 'GF-Pflichtfristen & Firmeninfos — nur für die Geschäftsführung'
            : 'Deine Termine & Fristen — du bist als Empfänger eingetragen'}
        </p>
      </div>
      <ManagerClient isAdmin={isAdmin} />
    </div>
  )
}
