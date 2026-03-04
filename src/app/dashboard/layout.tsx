import type { ReactNode } from 'react'
import { Toaster } from '@/components/ui/sonner'
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar'
import { DashboardSidebar } from '@/components/DashboardSidebar'
import { createSupabaseServerClient } from '@/lib/supabase-server'

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  const userEmail = user?.email ?? null

  return (
    <SidebarProvider>
      <DashboardSidebar userEmail={userEmail} />
      <SidebarInset>
        <header className="flex h-14 items-center gap-2 border-b px-4 lg:hidden">
          <SidebarTrigger />
          <span className="font-semibold text-sm">PrimeHub Dashboard</span>
        </header>
        <main className="flex-1 p-6 lg:p-8">
          {children}
        </main>
      </SidebarInset>
      <Toaster richColors position="top-right" />
    </SidebarProvider>
  )
}