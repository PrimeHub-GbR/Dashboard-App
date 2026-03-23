import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { AufgabenClient } from '@/components/aufgaben/AufgabenClient'

export const metadata = {
  title: 'Aufgaben | PrimeHub Dashboard',
}

export default async function AufgabenPage() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/')

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold text-white">Aufgaben</h1>
        <p className="mt-1 text-sm text-white/40">
          Aufgaben erstellen, delegieren und verfolgen
        </p>
      </div>

      <AufgabenClient />
    </div>
  )
}
