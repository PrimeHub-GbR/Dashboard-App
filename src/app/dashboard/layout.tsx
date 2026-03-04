import type { ReactNode } from 'react'
import { Toaster } from '@/components/ui/sonner'
import { LogoutButton } from '@/components/LogoutButton'

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex h-14 items-center justify-between border-b px-6">
        <span className="font-semibold text-sm">PrimeHub Dashboard</span>
        <LogoutButton />
      </header>
      {/* Sidebar placeholder — wird mit PROJ-2/3 Nav-Items erweitert */}
      <main className="flex-1 p-6 lg:p-8">
        {children}
      </main>
      <Toaster richColors position="top-right" />
    </div>
  )
}
