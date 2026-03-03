import type { ReactNode } from 'react'
import { Toaster } from '@/components/ui/sonner'

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen">
      {/* Sidebar placeholder — wird mit PROJ-2/3 Nav-Items erweitert */}
      <main className="flex-1 p-6 lg:p-8">
        {children}
      </main>
      <Toaster richColors position="top-right" />
    </div>
  )
}
