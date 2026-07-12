import type { ReactNode } from 'react'
import { Toaster } from '@/components/ui/sonner'
import { DashboardSidebar } from '@/components/DashboardSidebar'
import { NotificationBell } from '@/components/NotificationBell'
import { createSupabaseServerClient } from '@/lib/supabase-server'

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  const userEmail = user?.email ?? null

  let role: string | null = null
  if (user) {
    const { data: roleRow } = await supabase
      .from('user_roles').select('role').eq('user_id', user.id).single()
    role = roleRow?.role ?? null
  }
  const isManagerOrAdmin = role === 'admin' || role === 'manager'

  return (
    <div className="flex h-screen overflow-hidden">
      <DashboardSidebar userEmail={userEmail} role={role} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <main className="flex-1 overflow-y-auto p-6 lg:p-8 bg-background">
          {children}
        </main>
      </div>
      {isManagerOrAdmin && <NotificationBell />}
      <Toaster richColors position="top-right" />
    </div>
  )
}
