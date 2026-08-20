import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase-server'
import { PlentyOneClient } from '@/components/plentyone/PlentyOneClient'

export const metadata: Metadata = {
  title: 'PlentyONE-Migration | PrimeHub Dashboard',
  description: 'Amazon-Listings nach PlentyONE übernehmen — angereichert mit VLB-Daten und Covern',
}

export default async function PlentyOnePage() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/')

  const svc = createSupabaseServiceClient()
  const { data: rolle } = await svc
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .single()

  if (rolle?.role !== 'admin' && rolle?.role !== 'manager') {
    return (
      <div className="mx-auto max-w-2xl py-16 text-center">
        <h1 className="text-xl font-semibold text-white">Kein Zugriff</h1>
        <p className="mt-2 text-sm text-white/50">
          Die PlentyONE-Migration ist der Geschäftsführung und den Managern vorbehalten.
        </p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">PlentyONE-Migration</h1>
        <p className="mt-1 text-sm text-white/50">
          Amazon-Listings nach PlentyONE übernehmen — mit Verlagsdaten aus der VLB und den
          Buchcovern. Ein Upload, zwei parallele Stränge, zwei Ergebnisdateien.
        </p>
      </div>
      <PlentyOneClient />
    </div>
  )
}
