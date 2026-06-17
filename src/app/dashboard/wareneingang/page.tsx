import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { WareneingangClient } from '@/components/wareneingang/WareneingangClient'

export const metadata = {
  title: 'Wareneingang | PrimeHub Dashboard',
}

export default async function WareneingangPage() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/')

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Wareneingang</h1>
        <p className="text-muted-foreground mt-1">
          Palettenlieferungen verfolgen — von der Auftragsbestätigung bis zur Annahme im Lager
        </p>
      </div>

      <WareneingangClient />
    </div>
  )
}
