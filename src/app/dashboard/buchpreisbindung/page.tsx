import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { BuchpreisbindungClient } from '@/components/buchpreisbindung/BuchpreisbindungClient'

export const metadata: Metadata = {
  title: 'Buchpreisbindung | PrimeHub Dashboard',
  description: 'Automatisierte Prüfung der Buchpreisbindung für Amazon-Händler',
}

export default async function BuchpreisbindungPage() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/')

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Buchpreisbindung</h1>
        <p className="mt-1 text-sm text-white/50">
          Automatisierte Prüfung ob Amazon-Händler die gesetzliche Buchpreisbindung (BuchPrG) einhalten.
        </p>
      </div>
      <BuchpreisbindungClient />
    </div>
  )
}
