import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { PageHeader } from '@/components/PageHeader'
import { RepricerClient } from '@/components/repricer/RepricerClient'
import { createSupabaseServerClient } from '@/lib/supabase-server'

export const metadata: Metadata = {
  title: 'Repricer CSV Update',
}

export default async function RepricerPage() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/')

  const { data: roleData } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .single()

  if (roleData?.role !== 'admin') redirect('/dashboard')

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6">
        <PageHeader
          title="Repricer CSV Update"
          description="Repricer.com CSV hochladen, automatisch mit Buchhandelspreisen befuellen und herunterladen"
        />
      </div>
      <RepricerClient />
    </div>
  )
}
