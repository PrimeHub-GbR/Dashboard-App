import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { KommunikationClient } from '@/components/kommunikation/KommunikationClient'

export const metadata = {
  title: 'Kommunikation | PrimeHub Dashboard',
}

export default async function KommunikationPage() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/')

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Kommunikation</h1>
        <p className="text-muted-foreground mt-1">
          WhatsApp-Nachrichten senden und Versandhistorie einsehen
        </p>
      </div>

      <KommunikationClient />
    </div>
  )
}
