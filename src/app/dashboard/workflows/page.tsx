import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase-server'
import { PageHeader } from '@/components/PageHeader'
import { WorkflowMonitorClient } from '@/components/workflow-monitor/WorkflowMonitorClient'

export const metadata: Metadata = {
  title: 'n8n Workflows',
}

export default async function WorkflowsPage() {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    redirect('/login')
  }

  const serviceClient = createSupabaseServiceClient()
  const { data: roleData } = await serviceClient
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .single()

  const isAdmin = roleData?.role === 'admin'

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6">
        <PageHeader
          title="n8n Workflows"
          description="Live-Status aller n8n-Workflows — aktualisiert sich automatisch alle 30 Sekunden"
        />
      </div>
      <WorkflowMonitorClient isAdmin={isAdmin} />
    </div>
  )
}
