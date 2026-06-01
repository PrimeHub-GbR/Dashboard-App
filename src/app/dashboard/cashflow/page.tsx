import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { CashFlowClient } from '@/components/cashflow/CashFlowClient'

export const metadata: Metadata = {
  title: 'CashFlow — PrimeHub Dashboard',
}
export const dynamic = 'force-dynamic'

export default async function CashFlowPage() {
  const supabase = await createSupabaseServerClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) redirect('/')

  const { data: roleData } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .single()

  const role = roleData?.role as 'admin' | 'manager' | 'staff' | undefined
  if (role !== 'admin' && role !== 'manager') redirect('/dashboard')

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">CashFlow</h1>
        <p className="text-muted-foreground mt-1">
          Verfügbare Barmittel pro Monatsende — Trend &amp; Analyse über alle Konten
        </p>
      </div>
      <CashFlowClient />
    </div>
  )
}
