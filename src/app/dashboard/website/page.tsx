import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { WebsiteSettingsClient } from '@/components/website/WebsiteSettingsClient'

export const metadata = { title: 'Webseite — PrimeHub Dashboard' }
export const dynamic = 'force-dynamic'

export default async function WebsitePage() {
  const supabase = await createSupabaseServerClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) redirect('/')

  const { data: roleData } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .single()

  const role = roleData?.role as 'admin' | 'manager' | 'staff' | undefined
  if (role !== 'admin' && role !== 'manager') redirect('/')

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Webseite</h1>
        <p className="text-muted-foreground mt-1">
          Öffentliche Firmen-Landingpage auf primehubgbr.com steuern.
        </p>
      </div>
      <WebsiteSettingsClient canToggle={role === 'admin'} />
    </div>
  )
}
