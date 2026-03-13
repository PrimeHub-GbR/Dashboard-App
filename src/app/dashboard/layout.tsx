import type { ReactNode } from 'react'
import { Toaster } from '@/components/ui/sonner'
import { DashboardSidebar } from '@/components/DashboardSidebar'
import { createSupabaseServerClient } from '@/lib/supabase-server'

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  const userEmail = user?.email ?? null

  return (
    <div className="flex h-screen overflow-hidden">
      <DashboardSidebar userEmail={userEmail} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <main className="flex-1 overflow-y-auto p-6 lg:p-8 bg-background">
          {children}
        </main>
      </div>
      <Toaster richColors position="top-right" />
    </div>
  )
}
